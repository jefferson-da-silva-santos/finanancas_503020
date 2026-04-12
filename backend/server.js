'use strict';

const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

// ─────────────────────────────────────────────
// DATABASE SETUP
// ─────────────────────────────────────────────

const DB_PATH = process.env.DB_PATH || path.join(os.homedir(), 'finflow.db');
const db = new Database(DB_PATH);

// Performance pragmas
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─────────────────────────────────────────────
// SCHEMA CREATION
// ─────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS months (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    income REAL NOT NULL DEFAULT 0,
    pct_essential REAL NOT NULL DEFAULT 50,
    pct_personal REAL NOT NULL DEFAULT 30,
    pct_savings REAL NOT NULL DEFAULT 20,
    UNIQUE(year, month)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month_id INTEGER NOT NULL REFERENCES months(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'money',
    payment_type TEXT NOT NULL DEFAULT 'cash',
    category TEXT NOT NULL CHECK(category IN ('essential','personal','savings')),
    due_date TEXT,
    paid INTEGER NOT NULL DEFAULT 0,
    is_installment INTEGER NOT NULL DEFAULT 0,
    installment_group_id TEXT,
    installment_number INTEGER,
    installment_total INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS incomes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month_id INTEGER NOT NULL REFERENCES months(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    received INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_transactions_month ON transactions(month_id);
  CREATE INDEX IF NOT EXISTS idx_transactions_group ON transactions(installment_group_id);
  CREATE INDEX IF NOT EXISTS idx_incomes_month ON incomes(month_id);
`);

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function getOrCreateMonth(year, month) {
  let row = db.prepare('SELECT * FROM months WHERE year=? AND month=?').get(year, month);
  if (!row) {
    const info = db.prepare(
      'INSERT INTO months (year, month) VALUES (?, ?)'
    ).run(year, month);
    row = db.prepare('SELECT * FROM months WHERE id=?').get(info.lastInsertRowid);
  }
  return row;
}

function computeSummary(monthId, monthRow) {
  const txs     = db.prepare('SELECT * FROM transactions WHERE month_id=?').all(monthId);
  const incomes = db.prepare('SELECT * FROM incomes WHERE month_id=? ORDER BY created_at ASC').all(monthId);

  // Entradas efetivamente recebidas somam à renda base
  const totalIncomeReceived = incomes.reduce((acc, e) => acc + (e.received ? e.amount : 0), 0);
  const baseIncome = monthRow.income + totalIncomeReceived;

  const planned = {
    essential: (baseIncome * monthRow.pct_essential) / 100,
    personal:  (baseIncome * monthRow.pct_personal)  / 100,
    savings:   (baseIncome * monthRow.pct_savings)   / 100,
  };

  const realized = { essential: 0, personal: 0, savings: 0 };
  const pending  = { essential: 0, personal: 0, savings: 0 };

  for (const tx of txs) {
    if (tx.paid) {
      realized[tx.category] = (realized[tx.category] || 0) + tx.amount;
    } else {
      pending[tx.category] = (pending[tx.category] || 0) + tx.amount;
    }
  }

  const totalRealized = realized.essential + realized.personal + realized.savings;

  return { planned, realized, pending, totalRealized, transactions: txs, incomes, totalIncomeReceived, baseIncome };
}

function validatePercents(e, p, s) {
  const total = (parseFloat(e) || 0) + (parseFloat(p) || 0) + (parseFloat(s) || 0);
  return Math.abs(total - 100) < 0.01;
}

function generateGroupId() {
  return `grp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// Add months to a date string YYYY-MM-DD
function addMonths(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}

function getYearMonth(dateStr) {
  const [year, month] = dateStr.split('-').map(Number);
  return { year, month };
}

// ─────────────────────────────────────────────
// EXPRESS APP
// ─────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());

function ok(res, data) {
  res.json({ success: true, data });
}

function fail(res, msg, code = 400) {
  res.status(code).json({ success: false, error: msg });
}

// ─────────────────────────────────────────────
// ROUTES: MONTHS
// ─────────────────────────────────────────────

// GET /api/months/:year/:month
app.get('/api/months/:year/:month', (req, res) => {
  try {
    const year  = parseInt(req.params.year);
    const month = parseInt(req.params.month);
    if (!year || month < 1 || month > 12) return fail(res, 'Ano ou mês inválido');

    const row = getOrCreateMonth(year, month);
    const summary = computeSummary(row.id, row);
    ok(res, { month: row, ...summary });
  } catch (e) {
    fail(res, e.message, 500);
  }
});

// PUT /api/months/:year/:month — update income and percents
app.put('/api/months/:year/:month', (req, res) => {
  try {
    const year  = parseInt(req.params.year);
    const month = parseInt(req.params.month);
    const { income, pct_essential, pct_personal, pct_savings } = req.body;

    if (income !== undefined && income < 0) return fail(res, 'Renda não pode ser negativa');
    if (pct_essential !== undefined || pct_personal !== undefined || pct_savings !== undefined) {
      if (!validatePercents(pct_essential, pct_personal, pct_savings)) {
        return fail(res, 'Os percentuais devem somar 100%');
      }
    }

    const row = getOrCreateMonth(year, month);
    const fields = [];
    const values = [];

    if (income !== undefined)       { fields.push('income=?');       values.push(income); }
    if (pct_essential !== undefined) { fields.push('pct_essential=?'); values.push(pct_essential); }
    if (pct_personal !== undefined)  { fields.push('pct_personal=?');  values.push(pct_personal); }
    if (pct_savings !== undefined)   { fields.push('pct_savings=?');   values.push(pct_savings); }

    if (fields.length > 0) {
      values.push(row.id);
      db.prepare(`UPDATE months SET ${fields.join(',')} WHERE id=?`).run(...values);
    }

    const updated = db.prepare('SELECT * FROM months WHERE id=?').get(row.id);
    const summary = computeSummary(updated.id, updated);
    ok(res, { month: updated, ...summary });
  } catch (e) {
    fail(res, e.message, 500);
  }
});

// ─────────────────────────────────────────────
// ROUTES: TRANSACTIONS
// ─────────────────────────────────────────────

// GET /api/months/:year/:month/transactions
app.get('/api/months/:year/:month/transactions', (req, res) => {
  try {
    const year  = parseInt(req.params.year);
    const month = parseInt(req.params.month);
    const row = getOrCreateMonth(year, month);
    const txs = db.prepare(
      'SELECT * FROM transactions WHERE month_id=? ORDER BY due_date ASC, created_at ASC'
    ).all(row.id);
    ok(res, txs);
  } catch (e) {
    fail(res, e.message, 500);
  }
});

// POST /api/transactions — create (single or installment)
app.post('/api/transactions', (req, res) => {
  try {
    const {
      year, month,
      description, amount, payment_method, payment_type,
      category, due_date, paid,
      is_installment, installment_count, first_payment_date
    } = req.body;

    if (!description || !description.trim()) return fail(res, 'Descrição obrigatória');
    if (!amount || amount <= 0)              return fail(res, 'Valor deve ser positivo');
    if (!['essential','personal','savings'].includes(category)) return fail(res, 'Categoria inválida');
    if (!year || !month)                     return fail(res, 'Ano e mês obrigatórios');

    const insertTx = db.prepare(`
      INSERT INTO transactions
        (month_id, description, amount, payment_method, payment_type,
         category, due_date, paid, is_installment,
         installment_group_id, installment_number, installment_total)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    if (is_installment && installment_count > 1 && first_payment_date) {
      if (installment_count > 48) return fail(res, 'Máximo de 48 parcelas');
      const groupId = generateGroupId();
      const installAmt = parseFloat((amount / installment_count).toFixed(2));

      const createMany = db.transaction(() => {
        for (let i = 0; i < installment_count; i++) {
          const dueStr = addMonths(first_payment_date, i);
          const { year: y, month: m } = getYearMonth(dueStr);
          const mRow = getOrCreateMonth(y, m);
          insertTx.run(
            mRow.id,
            `${description} (${i + 1}/${installment_count})`,
            installAmt,
            payment_method || 'credit',
            'installment',
            category,
            dueStr,
            0,
            1,
            groupId,
            i + 1,
            installment_count
          );
        }
      });
      createMany();
      ok(res, { message: `${installment_count} parcelas criadas`, group_id: groupId });
    } else {
      const mRow = getOrCreateMonth(year, month);
      const info = insertTx.run(
        mRow.id, description, amount, payment_method || 'money', 'cash',
        category, due_date || null, paid ? 1 : 0, 0, null, null, null
      );
      const tx = db.prepare('SELECT * FROM transactions WHERE id=?').get(info.lastInsertRowid);
      ok(res, tx);
    }
  } catch (e) {
    fail(res, e.message, 500);
  }
});

// PUT /api/transactions/:id — update a transaction
app.put('/api/transactions/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const tx = db.prepare('SELECT * FROM transactions WHERE id=?').get(id);
    if (!tx) return fail(res, 'Transação não encontrada', 404);

    const { description, amount, payment_method, payment_type, category, due_date, paid } = req.body;

    if (category && !['essential','personal','savings'].includes(category)) return fail(res, 'Categoria inválida');
    if (amount !== undefined && amount <= 0) return fail(res, 'Valor deve ser positivo');

    const fields = [];
    const values = [];

    if (description !== undefined) { fields.push('description=?');    values.push(description); }
    if (amount !== undefined)      { fields.push('amount=?');         values.push(amount); }
    if (payment_method !== undefined) { fields.push('payment_method=?'); values.push(payment_method); }
    if (payment_type !== undefined)   { fields.push('payment_type=?');   values.push(payment_type); }
    if (category !== undefined)    { fields.push('category=?');       values.push(category); }
    if (due_date !== undefined)    { fields.push('due_date=?');       values.push(due_date); }
    if (paid !== undefined)        { fields.push('paid=?');           values.push(paid ? 1 : 0); }

    if (fields.length === 0) return fail(res, 'Nenhum campo para atualizar');

    values.push(id);
    db.prepare(`UPDATE transactions SET ${fields.join(',')} WHERE id=?`).run(...values);
    const updated = db.prepare('SELECT * FROM transactions WHERE id=?').get(id);
    ok(res, updated);
  } catch (e) {
    fail(res, e.message, 500);
  }
});

// DELETE /api/transactions/:id
app.delete('/api/transactions/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const tx = db.prepare('SELECT * FROM transactions WHERE id=?').get(id);
    if (!tx) return fail(res, 'Transação não encontrada', 404);
    db.prepare('DELETE FROM transactions WHERE id=?').run(id);
    ok(res, { deleted: id });
  } catch (e) {
    fail(res, e.message, 500);
  }
});

// DELETE /api/transactions/group/:groupId — delete all installments of a group
app.delete('/api/transactions/group/:groupId', (req, res) => {
  try {
    const { groupId } = req.params;
    const info = db.prepare('DELETE FROM transactions WHERE installment_group_id=?').run(groupId);
    ok(res, { deleted: info.changes });
  } catch (e) {
    fail(res, e.message, 500);
  }
});

// PATCH /api/transactions/:id/toggle-paid
app.patch('/api/transactions/:id/toggle-paid', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const tx = db.prepare('SELECT * FROM transactions WHERE id=?').get(id);
    if (!tx) return fail(res, 'Transação não encontrada', 404);
    const newPaid = tx.paid ? 0 : 1;
    db.prepare('UPDATE transactions SET paid=? WHERE id=?').run(newPaid, id);
    ok(res, { id, paid: newPaid });
  } catch (e) {
    fail(res, e.message, 500);
  }
});

// GET /api/upcoming — transações não pagas nos próximos 30 dias
app.get('/api/upcoming', (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const limit = new Date();
    limit.setDate(limit.getDate() + 30);
    const limitStr = limit.toISOString().slice(0, 10);

    const txs = db.prepare(`
      SELECT t.*, m.year, m.month
      FROM transactions t
      JOIN months m ON m.id = t.month_id
      WHERE t.paid = 0
        AND t.due_date IS NOT NULL
        AND t.due_date >= ?
        AND t.due_date <= ?
      ORDER BY t.due_date ASC
      LIMIT 50
    `).all(today, limitStr);

    ok(res, txs);
  } catch (e) {
    fail(res, e.message, 500);
  }
});

// GET /api/year/:year — resumo anual
app.get('/api/year/:year', (req, res) => {
  try {
    const year = parseInt(req.params.year);
    const months = [];
    for (let m = 1; m <= 12; m++) {
      const row = db.prepare('SELECT * FROM months WHERE year=? AND month=?').get(year, m);
      if (row) {
        const summary = computeSummary(row.id, row);
        months.push({ month: m, ...summary, config: row });
      } else {
        months.push({ month: m, config: null, planned: null, realized: null });
      }
    }
    ok(res, months);
  } catch (e) {
    fail(res, e.message, 500);
  }
});

// ─────────────────────────────────────────────
// ROUTES: INCOMES (Entradas)
// ─────────────────────────────────────────────

// GET /api/months/:year/:month/incomes
app.get('/api/months/:year/:month/incomes', (req, res) => {
  try {
    const year  = parseInt(req.params.year);
    const month = parseInt(req.params.month);
    const row = getOrCreateMonth(year, month);
    const incomes = db.prepare(
      'SELECT * FROM incomes WHERE month_id=? ORDER BY created_at ASC'
    ).all(row.id);
    ok(res, incomes);
  } catch (e) {
    fail(res, e.message, 500);
  }
});

// POST /api/incomes — create income entry
app.post('/api/incomes', (req, res) => {
  try {
    const { year, month, description, amount, received } = req.body;
    if (!description || !description.trim()) return fail(res, 'Descrição obrigatória');
    if (!amount || amount <= 0)              return fail(res, 'Valor deve ser positivo');
    if (!year || !month)                     return fail(res, 'Ano e mês obrigatórios');

    const mRow = getOrCreateMonth(year, month);
    const info = db.prepare(
      'INSERT INTO incomes (month_id, description, amount, received) VALUES (?, ?, ?, ?)'
    ).run(mRow.id, description.trim(), parseFloat(amount), received ? 1 : 0);

    const income = db.prepare('SELECT * FROM incomes WHERE id=?').get(info.lastInsertRowid);
    ok(res, income);
  } catch (e) {
    fail(res, e.message, 500);
  }
});

// PUT /api/incomes/:id — update income entry
app.put('/api/incomes/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const entry = db.prepare('SELECT * FROM incomes WHERE id=?').get(id);
    if (!entry) return fail(res, 'Entrada não encontrada', 404);

    const { description, amount, received } = req.body;
    const fields = [];
    const values = [];

    if (description !== undefined) { fields.push('description=?'); values.push(description.trim()); }
    if (amount !== undefined)      { fields.push('amount=?');      values.push(parseFloat(amount)); }
    if (received !== undefined)    { fields.push('received=?');    values.push(received ? 1 : 0); }

    if (fields.length === 0) return fail(res, 'Nenhum campo para atualizar');
    values.push(id);
    db.prepare(`UPDATE incomes SET ${fields.join(',')} WHERE id=?`).run(...values);

    const updated = db.prepare('SELECT * FROM incomes WHERE id=?').get(id);
    ok(res, updated);
  } catch (e) {
    fail(res, e.message, 500);
  }
});

// DELETE /api/incomes/:id
app.delete('/api/incomes/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const entry = db.prepare('SELECT * FROM incomes WHERE id=?').get(id);
    if (!entry) return fail(res, 'Entrada não encontrada', 404);
    db.prepare('DELETE FROM incomes WHERE id=?').run(id);
    ok(res, { deleted: id });
  } catch (e) {
    fail(res, e.message, 500);
  }
});

// PATCH /api/incomes/:id/toggle-received
app.patch('/api/incomes/:id/toggle-received', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const entry = db.prepare('SELECT * FROM incomes WHERE id=?').get(id);
    if (!entry) return fail(res, 'Entrada não encontrada', 404);
    const newVal = entry.received ? 0 : 1;
    db.prepare('UPDATE incomes SET received=? WHERE id=?').run(newVal, id);
    ok(res, { id, received: newVal });
  } catch (e) {
    fail(res, e.message, 500);
  }
});

// ─────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────

const PORT = process.env.PORT || 3333;
const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`[FinFlow] Server running at http://127.0.0.1:${PORT}`);
});

module.exports = { app, server, db };
