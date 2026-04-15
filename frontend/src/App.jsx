import { useState, useEffect, useCallback } from 'react';
import {
  Chart as ChartJS,
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import './App.css';
import 'boxicons/css/boxicons.min.css';

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────

const API = 'http://127.0.0.1:3333/api';

const MONTHS_PT = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
];

// FIX 4: "Economias e Dívidas" → "Economias" com ícone bx-piggy-bank
const CATEGORIES = {
  essential: { label: 'Essenciais',  icon: 'bx-home-alt',    color: 'var(--green-500)' },
  personal:  { label: 'Pessoais',    icon: 'bx-shopping-bag', color: 'var(--amber-500)' },
  savings:   { label: 'Economias',   icon: 'bx-coin',   color: 'var(--orange-500)' },
};

const PAYMENT_METHODS = [
  { value: 'money',    label: 'Dinheiro' },
  { value: 'debit',   label: 'Débito' },
  { value: 'credit',  label: 'Crédito' },
  { value: 'pix',     label: 'Pix' },
  { value: 'boleto',  label: 'Boleto' },
  { value: 'transfer',label: 'Transferência' },
];

// FIX 3: Cores temáticas para blocos de metas
const GOAL_COLORS = [
  { bg: '#16a34a', light: 'rgba(22,163,74,0.12)',  name: 'Verde' },
  { bg: '#f59e0b', light: 'rgba(245,158,11,0.12)', name: 'Âmbar' },
  { bg: '#f97316', light: 'rgba(249,115,22,0.12)', name: 'Laranja' },
  { bg: '#3b82f6', light: 'rgba(59,130,246,0.12)', name: 'Azul' },
  { bg: '#8b5cf6', light: 'rgba(139,92,246,0.12)', name: 'Violeta' },
  { bg: '#ec4899', light: 'rgba(236,72,153,0.12)', name: 'Rosa' },
  { bg: '#06b6d4', light: 'rgba(6,182,212,0.12)',  name: 'Ciano' },
  { bg: '#84cc16', light: 'rgba(132,204,22,0.12)', name: 'Lima' },
  { bg: '#ef4444', light: 'rgba(239,68,68,0.12)',  name: 'Vermelho' },
  { bg: '#a16207', light: 'rgba(161,98,7,0.12)',   name: 'Dourado' },
];

// ─────────────────────────────────────────────
// API LAYER
// ─────────────────────────────────────────────

async function apiFetch(path, options = {}) {
  const url = `${API}${path}`;
  const config = {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  };
  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body);
  }
  const res = await fetch(url, config);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Erro desconhecido');
  return json.data;
}

const api = {
  getMonth:          (y, m)       => apiFetch(`/months/${y}/${m}`),
  updateMonth:       (y, m, body) => apiFetch(`/months/${y}/${m}`, { method: 'PUT', body }),
  getTransactions:   (y, m)       => apiFetch(`/months/${y}/${m}/transactions`),
  createTransaction: (body)       => apiFetch('/transactions', { method: 'POST', body }),
  updateTransaction: (id, body)   => apiFetch(`/transactions/${id}`, { method: 'PUT', body }),
  deleteTransaction: (id)         => apiFetch(`/transactions/${id}`, { method: 'DELETE' }),
  deleteGroup:       (gid)        => apiFetch(`/transactions/group/${gid}`, { method: 'DELETE' }),
  togglePaid:        (id)         => apiFetch(`/transactions/${id}/toggle-paid`, { method: 'PATCH' }),
  getUpcoming:       ()           => apiFetch('/upcoming'),
  getIncomes:        (y, m)       => apiFetch(`/months/${y}/${m}/incomes`),
  createIncome:      (body)       => apiFetch('/incomes', { method: 'POST', body }),
  updateIncome:      (id, body)   => apiFetch(`/incomes/${id}`, { method: 'PUT', body }),
  deleteIncome:      (id)         => apiFetch(`/incomes/${id}`, { method: 'DELETE' }),
  toggleReceived:    (id)         => apiFetch(`/incomes/${id}/toggle-received`, { method: 'PATCH' }),
};

// ─────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────

function fmt(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const due = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((due - now) / 86400000);
}

function useToast() {
  const [toasts, setToasts] = useState([]);
  const add = useCallback((msg, type = 'success') => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);
  return { toasts, add };
}

// ─────────────────────────────────────────────
// COMPONENTS: Toast
// ─────────────────────────────────────────────

function ToastContainer({ toasts }) {
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast--${t.type}`}>
          <i className={`bx ${t.type === 'success' ? 'bx-check-circle' : t.type === 'error' ? 'bx-x-circle' : 'bx-info-circle'}`} />
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// COMPONENTS: Modal
// ─────────────────────────────────────────────

function Modal({ title, onClose, children, size = 'md' }) {
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={`modal modal--${size}`}>
        <div className="modal__header">
          <h2 className="modal__title">{title}</h2>
          <button className="modal__close" onClick={onClose}>
            <i className="bx bx-x" />
          </button>
        </div>
        <div className="modal__body">{children}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// COMPONENTS: TransactionForm
// ─────────────────────────────────────────────

function TransactionForm({ year, month, onSave, onClose, toast }) {
  const [form, setForm] = useState({
    description: '',
    amount: '',
    payment_method: 'pix',
    category: 'essential',
    due_date: today(),
    paid: false,
    is_installment: false,
    installment_count: 2,
    first_payment_date: today(),
  });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit() {
    if (!form.description.trim()) return toast('Descrição obrigatória', 'error');
    if (!form.amount || parseFloat(form.amount) <= 0) return toast('Valor inválido', 'error');

    setSaving(true);
    try {
      await api.createTransaction({
        year, month,
        description: form.description.trim(),
        amount: parseFloat(form.amount),
        payment_method: form.payment_method,
        payment_type: form.is_installment ? 'installment' : 'cash',
        category: form.category,
        due_date: form.is_installment ? null : form.due_date,
        paid: form.is_installment ? false : form.paid,
        is_installment: form.is_installment,
        installment_count: form.is_installment ? parseInt(form.installment_count) : 1,
        first_payment_date: form.is_installment ? form.first_payment_date : null,
      });
      toast(form.is_installment ? `${form.installment_count} parcelas criadas!` : 'Transação adicionada!');
      onSave();
      onClose();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="form-grid">
      <div className="form-field form-field--full">
        <label>Descrição</label>
        <input
          type="text"
          value={form.description}
          onChange={e => set('description', e.target.value)}
          placeholder="Ex: Aluguel, Academia, Netflix..."
          autoFocus
        />
      </div>

      <div className="form-field">
        <label>Valor (R$)</label>
        <input
          type="number"
          min="0.01"
          step="0.01"
          value={form.amount}
          onChange={e => set('amount', e.target.value)}
          placeholder="0,00"
        />
      </div>

      <div className="form-field">
        <label>Categoria</label>
        <select value={form.category} onChange={e => set('category', e.target.value)}>
          {Object.entries(CATEGORIES).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      <div className="form-field">
        <label>Forma de Pagamento</label>
        <select value={form.payment_method} onChange={e => set('payment_method', e.target.value)}>
          {PAYMENT_METHODS.map(p => (
            <option key={p.value} value={p.value}>{p.label}</option>
          ))}
        </select>
      </div>

      <div className="form-field">
        <label>Tipo</label>
        <div className="toggle-group">
          <button
            className={`toggle-btn ${!form.is_installment ? 'active' : ''}`}
            onClick={() => set('is_installment', false)}
          >
            <i className="bx bx-credit-card" /> À Vista
          </button>
          <button
            className={`toggle-btn ${form.is_installment ? 'active' : ''}`}
            onClick={() => set('is_installment', true)}
          >
            <i className="bx bx-receipt" /> Parcelado
          </button>
        </div>
      </div>

      {!form.is_installment ? (
        <>
          <div className="form-field">
            <label>Vencimento</label>
            <input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} />
          </div>
          <div className="form-field form-field--full">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={form.paid}
                onChange={e => set('paid', e.target.checked)}
              />
              <span>Marcar como pago</span>
            </label>
          </div>
        </>
      ) : (
        <>
          <div className="form-field">
            <label>Nº de Parcelas</label>
            <input
              type="number"
              min="2"
              max="48"
              value={form.installment_count}
              onChange={e => set('installment_count', e.target.value)}
            />
          </div>
          <div className="form-field">
            <label>Data 1ª Parcela</label>
            <input
              type="date"
              value={form.first_payment_date}
              onChange={e => set('first_payment_date', e.target.value)}
            />
          </div>
          <div className="form-field--info">
            <i className="bx bx-info-circle" />
            Valor por parcela: <strong>{fmt(parseFloat(form.amount || 0) / parseInt(form.installment_count || 1))}</strong>
          </div>
        </>
      )}

      <div className="form-actions">
        <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn--primary" onClick={handleSubmit} disabled={saving}>
          {saving ? <i className="bx bx-loader-alt bx-spin" /> : <i className="bx bx-plus" />}
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// COMPONENTS: EditTransactionModal
// ─────────────────────────────────────────────

function EditTransactionModal({ tx, onSave, onClose, toast }) {
  const [form, setForm] = useState({
    description: tx.description,
    amount: tx.amount,
    payment_method: tx.payment_method,
    category: tx.category,
    due_date: tx.due_date || today(),
    paid: tx.paid === 1,
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSave() {
    setSaving(true);
    try {
      await api.updateTransaction(tx.id, {
        ...form,
        amount: parseFloat(form.amount),
      });
      toast('Transação atualizada!');
      onSave();
      onClose();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="form-grid">
      <div className="form-field form-field--full">
        <label>Descrição</label>
        <input type="text" value={form.description} onChange={e => set('description', e.target.value)} />
      </div>
      <div className="form-field">
        <label>Valor (R$)</label>
        <input type="number" min="0.01" step="0.01" value={form.amount} onChange={e => set('amount', e.target.value)} />
      </div>
      <div className="form-field">
        <label>Categoria</label>
        <select value={form.category} onChange={e => set('category', e.target.value)}>
          {Object.entries(CATEGORIES).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>
      <div className="form-field">
        <label>Forma de Pagamento</label>
        <select value={form.payment_method} onChange={e => set('payment_method', e.target.value)}>
          {PAYMENT_METHODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </div>
      <div className="form-field">
        <label>Vencimento</label>
        <input type="date" value={form.due_date} onChange={e => set('due_date', e.target.value)} />
      </div>
      <div className="form-field form-field--full">
        <label className="checkbox-label">
          <input type="checkbox" checked={form.paid} onChange={e => set('paid', e.target.checked)} />
          <span>Pago</span>
        </label>
      </div>
      <div className="form-actions">
        <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn--primary" onClick={handleSave} disabled={saving}>
          {saving ? <i className="bx bx-loader-alt bx-spin" /> : null} Salvar
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// COMPONENTS: DonutChart
// FIX 2: Corrigido cálculo da porcentagem — usa baseIncome da API
//         (renda base + entradas recebidas) em vez do income bruto
// ─────────────────────────────────────────────

function DonutChart({ data, income, darkMode }) {
  // FIX 2: extrair baseIncome do objeto data que vem da API
  const realized  = data.realized  || {};
  const planned   = data.planned   || {};
  const baseIncome = data.baseIncome != null ? data.baseIncome : (income || 0);

  const chartData = {
    labels: ['Essenciais', 'Pessoais', 'Economias'],
    datasets: [{
      data: [
        realized.essential || 0,
        realized.personal  || 0,
        realized.savings   || 0,
      ],
      backgroundColor: ['#16a34a', '#f59e0b', '#f97316'],
      borderColor: darkMode ? '#1a1f2e' : '#ffffff',
      borderWidth: 3,
      hoverOffset: 8,
    }],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '70%',
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: ctx => ` ${ctx.label}: ${fmt(ctx.raw)}`,
        },
      },
    },
  };

  const totalRealized = (realized.essential || 0) + (realized.personal || 0) + (realized.savings || 0);
  // FIX 2: usa baseIncome (renda + entradas recebidas já somadas pelo servidor)
  const pct = baseIncome > 0 ? Math.round((totalRealized / baseIncome) * 100) : 0;

  return (
    <div className="donut-wrapper">
      <div className="donut-chart">
        <Doughnut data={chartData} options={options} />
        <div className="donut-center">
          <span className="donut-center__pct">{pct}%</span>
          <span className="donut-center__label">utilizado</span>
        </div>
      </div>
      <div className="donut-legend">
        {Object.entries(CATEGORIES).map(([key, cat]) => (
          <div key={key} className="legend-item">
            <span className="legend-dot" style={{ background: cat.color }} />
            <div className="legend-info">
              <span className="legend-name">{cat.label}</span>
              <span className="legend-value">{fmt(realized[key] || 0)}</span>
              <span className="legend-planned">/ {fmt(planned[key] || 0)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// COMPONENTS: BarChart
// FIX 1: Remove números/ticks do eixo Y, mantém linhas de grade
// ─────────────────────────────────────────────

function BarChartComparison({ data, darkMode }) {
  const { realized, planned } = data;
  const textColor = darkMode ? '#94a3b8' : '#64748b';
  const gridColor = darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';

  const chartData = {
    labels: ['Essenciais', 'Pessoais', 'Economias'],
    datasets: [
      {
        label: 'Planejado',
        data: [planned?.essential || 0, planned?.personal || 0, planned?.savings || 0],
        backgroundColor: 'rgba(22, 163, 74, 0.25)',
        borderColor: '#16a34a',
        borderWidth: 2,
        borderRadius: 6,
      },
      {
        label: 'Realizado',
        data: [realized.essential || 0, realized.personal || 0, realized.savings || 0],
        backgroundColor: ['rgba(22,163,74,0.8)', 'rgba(245,158,11,0.8)', 'rgba(249,115,22,0.8)'],
        borderColor: ['#16a34a', '#f59e0b', '#f97316'],
        borderWidth: 2,
        borderRadius: 6,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { color: textColor, font: { family: 'DM Sans', size: 12 }, padding: 16 },
      },
      tooltip: {
        callbacks: { label: ctx => ` ${ctx.dataset.label}: ${fmt(ctx.raw)}` },
      },
    },
    scales: {
      x: { ticks: { color: textColor }, grid: { display: false } },
      y: {
        // FIX 1: oculta apenas os números/ticks, mantém as linhas de grade visíveis
        ticks: { display: false },
        grid: { color: gridColor },
      },
    },
  };

  return (
    <div style={{ height: 220 }}>
      <Bar data={chartData} options={options} />
    </div>
  );
}

// ─────────────────────────────────────────────
// COMPONENTS: PercentEditor
// ─────────────────────────────────────────────

function PercentEditor({ config, year, month, onSaved, toast }) {
  const [pcts, setPcts] = useState({
    e: config?.pct_essential ?? 50,
    p: config?.pct_personal  ?? 30,
    s: config?.pct_savings   ?? 20,
  });
  const [saving, setSaving] = useState(false);

  const total = parseFloat(pcts.e) + parseFloat(pcts.p) + parseFloat(pcts.s);
  const valid = Math.abs(total - 100) < 0.01;

  async function handleSave() {
    if (!valid) return toast('Os percentuais devem somar 100%', 'error');
    setSaving(true);
    try {
      await api.updateMonth(year, month, {
        pct_essential: parseFloat(pcts.e),
        pct_personal:  parseFloat(pcts.p),
        pct_savings:   parseFloat(pcts.s),
      });
      toast('Configurações salvas!');
      onSaved();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pct-editor">
      <div className="pct-editor__table">
        <div className="pct-row">
          <span className="pct-row__dot" style={{ background: '#16a34a' }} />
          <span className="pct-row__label">Essenciais</span>
          <input
            type="number" min="0" max="100" step="1"
            value={pcts.e}
            onChange={e => setPcts(p => ({ ...p, e: e.target.value }))}
          />
          <span className="pct-row__sym">%</span>
        </div>
        <div className="pct-row">
          <span className="pct-row__dot" style={{ background: '#f59e0b' }} />
          <span className="pct-row__label">Pessoais</span>
          <input
            type="number" min="0" max="100" step="1"
            value={pcts.p}
            onChange={e => setPcts(p => ({ ...p, p: e.target.value }))}
          />
          <span className="pct-row__sym">%</span>
        </div>
        <div className="pct-row">
          <span className="pct-row__dot" style={{ background: '#f97316' }} />
          <span className="pct-row__label">Economias</span>
          <input
            type="number" min="0" max="100" step="1"
            value={pcts.s}
            onChange={e => setPcts(p => ({ ...p, s: e.target.value }))}
          />
          <span className="pct-row__sym">%</span>
        </div>
      </div>
      <div className={`pct-total ${valid ? 'valid' : 'invalid'}`}>
        Total: {total.toFixed(0)}%
        {!valid && <span> — deve somar 100%</span>}
      </div>
      <button className="btn btn--primary btn--sm" onClick={handleSave} disabled={saving || !valid}>
        {saving ? <i className="bx bx-loader-alt bx-spin" /> : <i className="bx bx-save" />}
        Salvar Configurações
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────
// COMPONENTS: TransactionTable
// ─────────────────────────────────────────────

function TransactionTable({ transactions, onTogglePaid, onEdit, onDelete, toast }) {
  const [filterCat, setFilterCat]   = useState('all');
  const [filterPaid, setFilterPaid] = useState('all');

  const filtered = transactions.filter(tx => {
    const catOk  = filterCat  === 'all' || tx.category === filterCat;
    const paidOk = filterPaid === 'all' || (filterPaid === 'paid' ? tx.paid : !tx.paid);
    return catOk && paidOk;
  });

  async function confirmDelete(tx) {
    try {
      if (tx.installment_group_id) {
        if (!window.confirm(`Deletar todas as parcelas do grupo?`)) return;
        await api.deleteGroup(tx.installment_group_id);
        toast('Todas as parcelas removidas!');
      } else {
        await api.deleteTransaction(tx.id);
        toast('Transação removida!');
      }
      onDelete();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  return (
    <div className="tx-table-wrapper">
      <div className="tx-filters">
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)}>
          <option value="all">Todas as categorias</option>
          {Object.entries(CATEGORIES).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select value={filterPaid} onChange={e => setFilterPaid(e.target.value)}>
          <option value="all">Todos</option>
          <option value="paid">Pagos</option>
          <option value="unpaid">Pendentes</option>
        </select>
        <span className="tx-count">{filtered.length} transações</span>
      </div>

      {filtered.length === 0 ? (
        <div className="tx-empty">
          <i className="bx bx-receipt" />
          <p>Nenhuma transação encontrada</p>
        </div>
      ) : (
        <table className="tx-table">
          <thead>
            <tr>
              <th>Pago</th>
              <th>Descrição</th>
              <th>Categoria</th>
              <th>Valor</th>
              <th>Vencimento</th>
              <th>Forma</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(tx => {
              const cat = CATEGORIES[tx.category];
              const days = daysUntil(tx.due_date);
              const overdue = !tx.paid && days !== null && days < 0;
              const dueSoon = !tx.paid && days !== null && days >= 0 && days <= 3;

              return (
                <tr key={tx.id} className={`tx-row ${tx.paid ? 'tx-row--paid' : ''} ${overdue ? 'tx-row--overdue' : ''}`}>
                  <td>
                    <label className="table-checkbox" title={tx.paid ? 'Marcar como pendente' : 'Marcar como pago'}>
                      <input
                        type="checkbox"
                        checked={!!tx.paid}
                        onChange={() => onTogglePaid(tx.id)}
                      />
                      <span className="table-checkbox__box" />
                    </label>
                  </td>
                  <td className="tx-desc">
                    <span>{tx.description}</span>
                    {tx.is_installment ? (
                      <span className="badge badge--installment">
                        {tx.installment_number}/{tx.installment_total}
                      </span>
                    ) : null}
                  </td>
                  <td>
                    <span className="badge" style={{ background: cat.color + '22', color: cat.color }}>
                      <i className={`bx ${cat.icon}`} /> {cat.label}
                    </span>
                  </td>
                  <td className={`tx-amount ${tx.paid ? 'tx-amount--paid' : ''}`}>
                    {fmt(tx.amount)}
                  </td>
                  <td>
                    <span className={`due-date ${overdue ? 'due-date--overdue' : dueSoon ? 'due-date--soon' : ''}`}>
                      {fmtDate(tx.due_date)}
                      {overdue && <i className="bx bx-error-circle" />}
                      {dueSoon && !overdue && <i className="bx bx-alarm" />}
                    </span>
                  </td>
                  <td className="tx-method">{PAYMENT_METHODS.find(p => p.value === tx.payment_method)?.label || tx.payment_method}</td>
                  <td className="tx-actions">
                    <button className="icon-btn" onClick={() => onEdit(tx)} title="Editar">
                      <i className="bx bx-edit" />
                    </button>
                    <button className="icon-btn icon-btn--danger" onClick={() => confirmDelete(tx)} title="Excluir">
                      <i className="bx bx-trash" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// COMPONENTS: IncomeForm
// ─────────────────────────────────────────────

function IncomeForm({ year, month, onSave, onClose, toast }) {
  const [form, setForm] = useState({ description: '', amount: '', received: false });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit() {
    if (!form.description.trim()) return toast('Descrição obrigatória', 'error');
    if (!form.amount || parseFloat(form.amount) <= 0) return toast('Valor inválido', 'error');
    setSaving(true);
    try {
      await api.createIncome({
        year, month,
        description: form.description.trim(),
        amount: parseFloat(form.amount),
        received: form.received,
      });
      toast('Entrada registrada!');
      onSave();
      onClose();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="form-grid">
      <div className="form-field form-field--full">
        <label>Descrição</label>
        <input
          type="text"
          value={form.description}
          onChange={e => set('description', e.target.value)}
          placeholder="Ex: Salário, Freelance, Aluguel recebido..."
          autoFocus
        />
      </div>
      <div className="form-field form-field--full">
        <label>Valor (R$)</label>
        <input
          type="number"
          min="0.01"
          step="0.01"
          value={form.amount}
          onChange={e => set('amount', e.target.value)}
          placeholder="0,00"
        />
      </div>
      <div className="form-field form-field--full">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={form.received}
            onChange={e => set('received', e.target.checked)}
          />
          <span>Marcar como recebido</span>
        </label>
      </div>
      <div className="form-actions">
        <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn--primary" onClick={handleSubmit} disabled={saving}>
          {saving ? <i className="bx bx-loader-alt bx-spin" /> : <i className="bx bx-plus" />}
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// COMPONENTS: EditIncomeModal
// ─────────────────────────────────────────────

function EditIncomeModal({ entry, onSave, onClose, toast }) {
  const [form, setForm] = useState({
    description: entry.description,
    amount: entry.amount,
    received: entry.received === 1,
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSave() {
    if (!form.description.trim()) return toast('Descrição obrigatória', 'error');
    if (!form.amount || parseFloat(form.amount) <= 0) return toast('Valor inválido', 'error');
    setSaving(true);
    try {
      await api.updateIncome(entry.id, {
        description: form.description.trim(),
        amount: parseFloat(form.amount),
        received: form.received,
      });
      toast('Entrada atualizada!');
      onSave();
      onClose();
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="form-grid">
      <div className="form-field form-field--full">
        <label>Descrição</label>
        <input
          type="text"
          value={form.description}
          onChange={e => set('description', e.target.value)}
          autoFocus
        />
      </div>
      <div className="form-field form-field--full">
        <label>Valor (R$)</label>
        <input
          type="number"
          min="0.01"
          step="0.01"
          value={form.amount}
          onChange={e => set('amount', e.target.value)}
        />
      </div>
      <div className="form-field form-field--full">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={form.received}
            onChange={e => set('received', e.target.checked)}
          />
          <span>Recebido</span>
        </label>
      </div>
      <div className="form-actions">
        <button className="btn btn--ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn--primary" onClick={handleSave} disabled={saving}>
          {saving ? <i className="bx bx-loader-alt bx-spin" /> : null} Salvar
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// COMPONENTS: IncomeTable
// ─────────────────────────────────────────────

function IncomeTable({ incomes, onToggleReceived, onEdit, onDelete, toast }) {
  const totalReceived = incomes.reduce((acc, e) => acc + (e.received ? e.amount : 0), 0);
  const totalPending  = incomes.reduce((acc, e) => acc + (!e.received ? e.amount : 0), 0);

  async function handleDelete(id) {
    try {
      await api.deleteIncome(id);
      toast('Entrada removida!');
      onDelete();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  return (
    <div className="income-table-wrapper">
      <div className="income-totals">
        <div className="income-total income-total--received">
          <i className="bx bx-check-circle" />
          <div>
            <span>Recebido</span>
            <strong>{fmt(totalReceived)}</strong>
          </div>
        </div>
        <div className="income-total income-total--pending">
          <i className="bx bx-time" />
          <div>
            <span>A Receber</span>
            <strong>{fmt(totalPending)}</strong>
          </div>
        </div>
        <div className="income-total income-total--total">
          <i className="bx bx-wallet" />
          <div>
            <span>Total Previsto</span>
            <strong>{fmt(totalReceived + totalPending)}</strong>
          </div>
        </div>
      </div>

      {incomes.length === 0 ? (
        <div className="tx-empty">
          <i className="bx bx-dollar-circle" />
          <p>Nenhuma entrada registrada neste mês</p>
        </div>
      ) : (
        <table className="tx-table">
          <thead>
            <tr>
              <th>Recebido</th>
              <th>Descrição</th>
              <th>Valor</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {incomes.map(entry => (
              <tr key={entry.id} className={`tx-row ${entry.received ? 'tx-row--paid' : ''}`}>
                <td>
                  <label className="table-checkbox" title={entry.received ? 'Marcar como pendente' : 'Marcar como recebido'}>
                    <input
                      type="checkbox"
                      checked={!!entry.received}
                      onChange={() => onToggleReceived(entry.id)}
                    />
                    <span className="table-checkbox__box" />
                  </label>
                </td>
                <td className="tx-desc">
                  <span>{entry.description}</span>
                </td>
                <td className={`tx-amount ${entry.received ? 'tx-amount--received' : ''}`}>
                  {fmt(entry.amount)}
                </td>
                <td className="tx-actions">
                  <button className="icon-btn" onClick={() => onEdit(entry)} title="Editar">
                    <i className="bx bx-edit" />
                  </button>
                  <button className="icon-btn icon-btn--danger" onClick={() => handleDelete(entry.id)} title="Excluir">
                    <i className="bx bx-trash" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// COMPONENTS: UpcomingPanel
// ─────────────────────────────────────────────

function UpcomingPanel({ onTogglePaid }) {
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await api.getUpcoming();
      setItems(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleToggle = async (id) => {
    await api.togglePaid(id);
    load();
    onTogglePaid && onTogglePaid();
  };

  return (
    <div className="upcoming-panel">
      <h3 className="panel-title">
        <i className="bx bx-calendar-event" /> Contas a Vencer (30 dias)
      </h3>
      {loading ? (
        <div className="loader"><i className="bx bx-loader-alt bx-spin" /></div>
      ) : items.length === 0 ? (
        <div className="upcoming-empty">
          <i className="bx bx-check-shield" />
          <span>Nenhuma conta pendente nos próximos 30 dias</span>
        </div>
      ) : (
        <div className="upcoming-list">
          {items.map(tx => {
            const days = daysUntil(tx.due_date);
            const overdue = days < 0;
            const cat = CATEGORIES[tx.category];
            return (
              <div key={tx.id} className={`upcoming-item ${overdue ? 'upcoming-item--overdue' : ''}`}>
                <button className={`paid-toggle ${tx.paid ? 'paid-toggle--on' : ''}`} onClick={() => handleToggle(tx.id)}>
                  <i className={`bx ${tx.paid ? 'bx-check-circle' : 'bx-circle'}`} />
                </button>
                <div className="upcoming-info">
                  <span className="upcoming-desc">{tx.description}</span>
                  <span className="upcoming-meta">
                    <i className={`bx ${cat.icon}`} style={{ color: cat.color }} />
                    {MONTHS_PT[tx.month - 1]}/{tx.year}
                  </span>
                </div>
                <div className="upcoming-right">
                  <span className="upcoming-amount">{fmt(tx.amount)}</span>
                  <span className={`upcoming-days ${overdue ? 'overdue' : days <= 3 ? 'soon' : ''}`}>
                    {overdue ? `${Math.abs(days)}d atrasado` : days === 0 ? 'Hoje!' : `${days}d`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// FIX 3: FEAT Metas — armazenamento local
// ─────────────────────────────────────────────

const GOALS_KEY = 'finflow-goals';

function loadGoals() {
  try {
    const raw = localStorage.getItem(GOALS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveGoals(goals) {
  localStorage.setItem(GOALS_KEY, JSON.stringify(goals));
}

function newGoalId() {
  return `goal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

// ─────────────────────────────────────────────
// COMPONENTS: GoalDonut
// ─────────────────────────────────────────────

function GoalDonut({ goal, darkMode }) {
  const totalDeposited = (goal.deposits || []).reduce((acc, d) => acc + d.amount, 0);
  const target    = goal.target || 0;
  const remaining = Math.max(0, target - totalDeposited);
  const pct       = target > 0 ? Math.min(Math.round((totalDeposited / target) * 100), 100) : 0;
  const color     = goal.color || '#16a34a';

  const chartData = {
    labels: ['Alcançado', 'Restante'],
    datasets: [{
      data: target > 0
        ? [Math.min(totalDeposited, target), remaining]
        : [0, 1],
      backgroundColor: [color, darkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)'],
      borderColor: darkMode ? '#1a1f2e' : '#ffffff',
      borderWidth: 2,
      hoverOffset: 4,
    }],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '72%',
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: { label: ctx => ` ${ctx.label}: ${fmt(ctx.raw)}` },
      },
    },
  };

  return (
    <div className="goal-donut-wrapper">
      <div className="goal-donut-chart">
        <Doughnut data={chartData} options={options} />
        <div className="goal-donut-center">
          <span className="goal-donut-pct" style={{ color }}>{pct}%</span>
        </div>
      </div>
      <div className="goal-donut-info">
        <div className="goal-donut-row">
          <span className="goal-donut-label">Alcançado</span>
          <span className="goal-donut-val" style={{ color }}>{fmt(totalDeposited)}</span>
        </div>
        <div className="goal-donut-row">
          <span className="goal-donut-label">Falta</span>
          <span className="goal-donut-val goal-donut-val--muted">{fmt(remaining)}</span>
        </div>
        <div className="goal-donut-row">
          <span className="goal-donut-label">Meta</span>
          <span className="goal-donut-val goal-donut-val--target">{fmt(target)}</span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// COMPONENTS: GoalBlock
// ─────────────────────────────────────────────

function GoalBlock({ goal, darkMode, onUpdate, onDelete, toast }) {
  const [editingMeta, setEditingMeta]   = useState(false);
  const [metaForm, setMetaForm]         = useState({ name: goal.name, target: goal.target, colorIdx: goal.colorIdx ?? 0 });
  const [depositForm, setDepositForm]   = useState({ date: today(), amount: '' });
  const [addingDeposit, setAddingDeposit] = useState(false);

  const color = GOAL_COLORS[goal.colorIdx ?? 0];

  function handleSaveMeta() {
    if (!metaForm.name.trim()) return toast('Nome da meta obrigatório', 'error');
    if (!metaForm.target || parseFloat(metaForm.target) <= 0) return toast('Valor da meta inválido', 'error');
    const updated = {
      ...goal,
      name: metaForm.name.trim(),
      target: parseFloat(metaForm.target),
      colorIdx: metaForm.colorIdx,
      color: GOAL_COLORS[metaForm.colorIdx].bg,
    };
    onUpdate(updated);
    setEditingMeta(false);
    toast('Meta atualizada!');
  }

  function handleAddDeposit() {
    if (!depositForm.date)   return toast('Data obrigatória', 'error');
    if (!depositForm.amount || parseFloat(depositForm.amount) <= 0) return toast('Valor inválido', 'error');
    const deposit = {
      id: `dep_${Date.now()}`,
      date: depositForm.date,
      amount: parseFloat(depositForm.amount),
    };
    const updated = { ...goal, deposits: [...(goal.deposits || []), deposit] };
    onUpdate(updated);
    setDepositForm({ date: today(), amount: '' });
    setAddingDeposit(false);
    toast('Aporte registrado!');
  }

  function handleDeleteDeposit(depId) {
    const updated = { ...goal, deposits: (goal.deposits || []).filter(d => d.id !== depId) };
    onUpdate(updated);
    toast('Aporte removido!');
  }

  const deposits = [...(goal.deposits || [])].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="goal-block" style={{ '--goal-color': color.bg, '--goal-light': color.light }}>
      {/* Header */}
      <div className="goal-block__header">
        <div className="goal-block__title-area">
          <span className="goal-block__dot" style={{ background: color.bg }} />
          {editingMeta ? (
            <input
              className="goal-block__name-input"
              value={metaForm.name}
              onChange={e => setMetaForm(f => ({ ...f, name: e.target.value }))}
              autoFocus
            />
          ) : (
            <h3 className="goal-block__name">{goal.name}</h3>
          )}
        </div>
        <div className="goal-block__actions">
          {editingMeta ? (
            <>
              <button className="icon-btn icon-btn--save" onClick={handleSaveMeta} title="Salvar">
                <i className="bx bx-check" />
              </button>
              <button className="icon-btn" onClick={() => {
                setEditingMeta(false);
                setMetaForm({ name: goal.name, target: goal.target, colorIdx: goal.colorIdx ?? 0 });
              }} title="Cancelar">
                <i className="bx bx-x" />
              </button>
            </>
          ) : (
            <>
              <button className="icon-btn" onClick={() => setEditingMeta(true)} title="Editar meta">
                <i className="bx bx-edit" />
              </button>
              <button className="icon-btn icon-btn--danger" onClick={() => {
                if (window.confirm(`Excluir a meta "${goal.name}"?`)) onDelete(goal.id);
              }} title="Excluir meta">
                <i className="bx bx-trash" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Formulário de edição */}
      {editingMeta && (
        <div className="goal-edit-form">
          <div className="form-field">
            <label>Valor da Meta (R$)</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={metaForm.target}
              onChange={e => setMetaForm(f => ({ ...f, target: e.target.value }))}
            />
          </div>
          <div className="form-field">
            <label>Cor do Bloco</label>
            <div className="goal-color-picker">
              {GOAL_COLORS.map((c, i) => (
                <button
                  key={i}
                  className={`goal-color-swatch ${metaForm.colorIdx === i ? 'active' : ''}`}
                  style={{ background: c.bg }}
                  onClick={() => setMetaForm(f => ({ ...f, colorIdx: i }))}
                  title={c.name}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Gráfico rosca */}
      <GoalDonut goal={goal} darkMode={darkMode} />

      {/* Aportes */}
      <div className="goal-deposits">
        <div className="goal-deposits__header">
          <span className="goal-deposits__title">
            <i className="bx bx-calendar-plus" /> Aportes
          </span>
          <button
            className="btn btn--sm goal-add-deposit-btn"
            style={{ '--btn-color': color.bg }}
            onClick={() => setAddingDeposit(v => !v)}
          >
            <i className={`bx ${addingDeposit ? 'bx-x' : 'bx-plus'}`} />
            {addingDeposit ? 'Cancelar' : 'Novo Aporte'}
          </button>
        </div>

        {addingDeposit && (
          <div className="goal-deposit-form">
            <div className="form-field">
              <label>Data</label>
              <input
                type="date"
                value={depositForm.date}
                onChange={e => setDepositForm(f => ({ ...f, date: e.target.value }))}
              />
            </div>
            <div className="form-field">
              <label>Valor (R$)</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0,00"
                value={depositForm.amount}
                onChange={e => setDepositForm(f => ({ ...f, amount: e.target.value }))}
              />
            </div>
            <button
              className="btn btn--primary btn--sm"
              style={{ background: color.bg, borderColor: color.bg }}
              onClick={handleAddDeposit}
            >
              <i className="bx bx-save" /> Registrar
            </button>
          </div>
        )}

        {deposits.length === 0 ? (
          <div className="goal-no-deposits">
            <i className="bx bx-coin-stack" />
            <span>Nenhum aporte registrado ainda</span>
          </div>
        ) : (
          <div className="goal-deposit-list">
            {deposits.map(dep => (
              <div key={dep.id} className="goal-deposit-item">
                <span className="goal-deposit-date">
                  <i className="bx bx-calendar" />
                  {fmtDate(dep.date)}
                </span>
                <span className="goal-deposit-amount" style={{ color: color.bg }}>
                  {fmt(dep.amount)}
                </span>
                <button
                  className="icon-btn icon-btn--danger icon-btn--xs"
                  onClick={() => handleDeleteDeposit(dep.id)}
                  title="Remover aporte"
                >
                  <i className="bx bx-x" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// COMPONENTS: GoalsView
// ─────────────────────────────────────────────

function GoalsView({ darkMode, toast }) {
  const [goals, setGoals]       = useState(() => loadGoals());
  const [showNewForm, setShowNewForm] = useState(false);
  const [newForm, setNewForm]   = useState({ name: '', target: '', colorIdx: 0 });

  function persistGoals(updated) {
    setGoals(updated);
    saveGoals(updated);
  }

  function handleCreateGoal() {
    if (!newForm.name.trim()) return toast('Nome da meta obrigatório', 'error');
    if (!newForm.target || parseFloat(newForm.target) <= 0) return toast('Valor da meta inválido', 'error');
    if (goals.length >= 10) return toast('Limite de 10 metas atingido', 'error');

    const goal = {
      id: newGoalId(),
      name: newForm.name.trim(),
      target: parseFloat(newForm.target),
      colorIdx: newForm.colorIdx,
      color: GOAL_COLORS[newForm.colorIdx].bg,
      deposits: [],
      createdAt: new Date().toISOString(),
    };
    persistGoals([...goals, goal]);
    setNewForm({ name: '', target: '', colorIdx: 0 });
    setShowNewForm(false);
    toast('Meta criada!');
  }

  function handleUpdateGoal(updated) {
    persistGoals(goals.map(g => g.id === updated.id ? updated : g));
  }

  function handleDeleteGoal(id) {
    persistGoals(goals.filter(g => g.id !== id));
    toast('Meta removida!');
  }

  return (
    <div className="goals-view">
      <div className="goals-header">
        <div>
          <h2 className="goals-title">
            <i className="bx bx-target-lock" /> Metas &amp; Objetivos
          </h2>
          <p className="goals-subtitle">Acompanhe seus objetivos financeiros e registre seus aportes.</p>
        </div>
        <button
          className="btn btn--primary"
          onClick={() => setShowNewForm(v => !v)}
          disabled={goals.length >= 10}
          title={goals.length >= 10 ? 'Limite de 10 metas atingido' : 'Nova meta'}
        >
          <i className={`bx ${showNewForm ? 'bx-x' : 'bx-plus'}`} />
          {showNewForm ? 'Cancelar' : `Nova Meta ${goals.length}/10`}
        </button>
      </div>

      {showNewForm && (
        <div className="goal-new-form card">
          <h3 className="card__title"><i className="bx bx-flag" /> Nova Meta</h3>
          <div className="form-grid">
            <div className="form-field form-field--full">
              <label>Nome / Objetivo</label>
              <input
                type="text"
                value={newForm.name}
                onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ex: Viagem Europa, Fundo de emergência, Notebook..."
                autoFocus
              />
            </div>
            <div className="form-field">
              <label>Valor da Meta (R$)</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={newForm.target}
                onChange={e => setNewForm(f => ({ ...f, target: e.target.value }))}
                placeholder="0,00"
              />
            </div>
            <div className="form-field">
              <label>Cor do Bloco</label>
              <div className="goal-color-picker">
                {GOAL_COLORS.map((c, i) => (
                  <button
                    key={i}
                    className={`goal-color-swatch ${newForm.colorIdx === i ? 'active' : ''}`}
                    style={{ background: c.bg }}
                    onClick={() => setNewForm(f => ({ ...f, colorIdx: i }))}
                    title={c.name}
                  />
                ))}
              </div>
            </div>
            <div className="form-actions form-field--full">
              <button className="btn btn--ghost" onClick={() => setShowNewForm(false)}>Cancelar</button>
              <button className="btn btn--primary" onClick={handleCreateGoal}>
                <i className="bx bx-plus" /> Criar Meta
              </button>
            </div>
          </div>
        </div>
      )}

      {goals.length === 0 ? (
        <div className="goals-empty">
          <i className="bx bx-target-lock" />
          <p>Nenhuma meta criada ainda.</p>
          <span>Clique em "Nova Meta" para começar a acompanhar seus objetivos financeiros.</span>
        </div>
      ) : (
        <div className="goals-grid">
          {goals.map(goal => (
            <GoalBlock
              key={goal.id}
              goal={goal}
              darkMode={darkMode}
              onUpdate={handleUpdateGoal}
              onDelete={handleDeleteGoal}
              toast={toast}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// COMPONENTS: MonthView
// ─────────────────────────────────────────────

function MonthView({ year, month, darkMode, toast }) {
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [showAdd, setShowAdd]   = useState(false);
  const [editTx, setEditTx]     = useState(null);
  const [showAddIncome, setShowAddIncome] = useState(false);
  const [editIncome, setEditIncome]       = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.getMonth(year, month);
      setData(d);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  const handleTogglePaid     = async (id) => { await api.togglePaid(id);     load(); };
  const handleToggleReceived = async (id) => { await api.toggleReceived(id); load(); };

  if (loading) return (
    <div className="month-loader">
      <i className="bx bx-loader-alt bx-spin" />
      <span>Carregando...</span>
    </div>
  );

  if (!data) return null;

  const { month: config, planned, realized, pending, transactions, incomes = [], totalIncomeReceived = 0, baseIncome = 0 } = data;
  const income        = config.income;
  const totalPending  = (pending.essential || 0) + (pending.personal || 0) + (pending.savings || 0);
  const totalRealized = (realized.essential || 0) + (realized.personal || 0) + (realized.savings || 0);
  const balance       = baseIncome - totalRealized;

  return (
    <div className="month-view">
      {/* Summary Cards */}
      <div className="summary-cards">
        <div className="summary-card summary-card--income">
          <i className="bx bx-trending-up" />
          <div>
            <span>Renda Total</span>
            <strong>{fmt(baseIncome)}</strong>
            {totalIncomeReceived > 0 && (
              <span className="summary-card__sub">+ {fmt(totalIncomeReceived)} entradas</span>
            )}
          </div>
        </div>
        <div className="summary-card summary-card--spent">
          <i className="bx bx-trending-down" />
          <div>
            <span>Gasto (pago)</span>
            <strong>{fmt(totalRealized)}</strong>
          </div>
        </div>
        <div className="summary-card summary-card--pending">
          <i className="bx bx-time" />
          <div>
            <span>Pendente</span>
            <strong>{fmt(totalPending)}</strong>
          </div>
        </div>
        <div className={`summary-card ${balance >= 0 ? 'summary-card--balance' : 'summary-card--negative'}`}>
          <i className={`bx ${balance >= 0 ? 'bx-wallet' : 'bx-error'}`} />
          <div>
            <span>Saldo</span>
            <strong>{fmt(balance)}</strong>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {[
          { key: 'overview',     icon: 'bx-bar-chart-alt-2', label: 'Visão Geral' },
          { key: 'incomes',      icon: 'bx-dollar-circle',   label: 'Entradas' },
          { key: 'transactions', icon: 'bx-list-ul',         label: 'Gastos' },
          { key: 'settings',     icon: 'bx-cog',             label: 'Configurar' },
        ].map(t => (
          <button
            key={t.key}
            className={`tab ${activeTab === t.key ? 'tab--active' : ''}`}
            onClick={() => setActiveTab(t.key)}
          >
            <i className={`bx ${t.icon}`} /> {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="overview-grid">
          <div className="card">
            <h3 className="card__title">
              <i className="bx bx-pie-chart-alt-2" /> Distribuição Real
            </h3>
            {/* FIX 2: passa o objeto data completo para DonutChart acessar baseIncome */}
            <DonutChart data={data} income={income} darkMode={darkMode} />
          </div>
          <div className="card">
            <h3 className="card__title">
              <i className="bx bx-bar-chart-alt" /> Planejado vs Realizado
            </h3>
            <BarChartComparison data={data} darkMode={darkMode} />

            <div className="planned-grid">
              {Object.entries(CATEGORIES).map(([key, cat]) => {
                const plan    = planned?.[key] || 0;
                const real    = realized?.[key] || 0;
                const overPct = plan > 0 ? Math.min((real / plan) * 100, 100) : 0;
                const over    = real > plan;
                return (
                  <div key={key} className="planned-item">
                    <div className="planned-item__header">
                      <span style={{ color: cat.color }}>
                        <i className={`bx ${cat.icon}`} /> {cat.label}
                      </span>
                      <span className={over ? 'over-budget' : ''}>{fmt(real)} / {fmt(plan)}</span>
                    </div>
                    <div className="progress-bar">
                      <div
                        className={`progress-bar__fill ${over ? 'progress-bar__fill--over' : ''}`}
                        style={{ width: `${overPct}%`, background: cat.color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'incomes' && (
        <div className="card">
          <div className="card__header">
            <h3 className="card__title">
              <i className="bx bx-dollar-circle" /> Entradas do Mês
            </h3>
            <button className="btn btn--income btn--sm" onClick={() => setShowAddIncome(true)}>
              <i className="bx bx-plus" /> Nova Entrada
            </button>
          </div>
          <IncomeTable
            incomes={incomes}
            onToggleReceived={handleToggleReceived}
            onEdit={setEditIncome}
            onDelete={load}
            toast={toast}
          />
        </div>
      )}

      {activeTab === 'transactions' && (
        <div className="card">
          <div className="card__header">
            <h3 className="card__title">
              <i className="bx bx-list-ul" /> Gastos do Mês
            </h3>
            <button className="btn btn--primary btn--sm" onClick={() => setShowAdd(true)}>
              <i className="bx bx-plus" /> Adicionar
            </button>
          </div>
          <TransactionTable
            transactions={transactions}
            onTogglePaid={handleTogglePaid}
            onEdit={setEditTx}
            onDelete={load}
            toast={toast}
          />
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="card card--narrow">
          <h3 className="card__title">
            <i className="bx bx-slider" /> Configurar Mês
          </h3>
          <p className="card__subtitle">Defina os percentuais da regra 50/30/20 para distribuição dos gastos.</p>
          <PercentEditor
            config={config}
            year={year}
            month={month}
            onSaved={load}
            toast={toast}
          />
        </div>
      )}

      {showAdd && (
        <Modal title="Nova Transação" onClose={() => setShowAdd(false)} size="md">
          <TransactionForm year={year} month={month} onSave={load} onClose={() => setShowAdd(false)} toast={toast} />
        </Modal>
      )}

      {editTx && (
        <Modal title="Editar Transação" onClose={() => setEditTx(null)} size="md">
          <EditTransactionModal tx={editTx} onSave={load} onClose={() => setEditTx(null)} toast={toast} />
        </Modal>
      )}

      {showAddIncome && (
        <Modal title="Nova Entrada" onClose={() => setShowAddIncome(false)} size="sm">
          <IncomeForm year={year} month={month} onSave={load} onClose={() => setShowAddIncome(false)} toast={toast} />
        </Modal>
      )}

      {editIncome && (
        <Modal title="Editar Entrada" onClose={() => setEditIncome(null)} size="sm">
          <EditIncomeModal entry={editIncome} onSave={load} onClose={() => setEditIncome(null)} toast={toast} />
        </Modal>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// COMPONENTS: Sidebar
// FIX 3: aba "Metas" adicionada acima da lista de meses
// ─────────────────────────────────────────────

function Sidebar({ year, month, onSelect, onYearChange, darkMode, onToggleDark, activePage, onPageChange }) {
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <i className="bx bx-leaf" />
        <span>FinFlow</span>
      </div>

      {/* FIX 3: Aba Metas acima dos meses */}
      <div className="sidebar__nav-top">
        <button
          className={`sidebar-nav-btn ${activePage === 'goals' ? 'sidebar-nav-btn--active' : ''}`}
          onClick={() => onPageChange('goals')}
        >
          <i className="bx bx-target-lock" />
          <span>Metas</span>
          {activePage === 'goals' && <i className="bx bx-chevron-right sidebar-nav-btn__arrow" />}
        </button>
      </div>

      <div className="sidebar__year">
        <button className="year-nav" onClick={() => onYearChange(year - 1)}>
          <i className="bx bx-chevron-left" />
        </button>
        <span className="year-label">{year}</span>
        <button className="year-nav" onClick={() => onYearChange(year + 1)}>
          <i className="bx bx-chevron-right" />
        </button>
      </div>

      <nav className="sidebar__months">
        {MONTHS_PT.map((name, i) => {
          const m = i + 1;
          const isActive = activePage === 'month' && m === month;
          return (
            <button
              key={m}
              className={`month-btn ${isActive ? 'month-btn--active' : ''}`}
              onClick={() => { onSelect(m); onPageChange('month'); }}
            >
              <span className="month-btn__num">{String(m).padStart(2, '0')}</span>
              <span className="month-btn__name">{name}</span>
              {isActive && <i className="bx bx-chevron-right month-btn__arrow" />}
            </button>
          );
        })}
      </nav>

      <div className="sidebar__footer">
        <button className="dark-toggle" onClick={onToggleDark} title="Alternar tema">
          <i className={`bx ${darkMode ? 'bx-sun' : 'bx-moon'}`} />
          <span>{darkMode ? 'Modo Claro' : 'Modo Escuro'}</span>
        </button>
        <span className="version">v1.0.0</span>
      </div>
    </aside>
  );
}

// ─────────────────────────────────────────────
// APP ROOT
// ─────────────────────────────────────────────

export default function App() {
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [darkMode, setDarkMode] = useState(() =>
    localStorage.getItem('finflow-theme') === 'dark' ||
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
  const [showUpcoming, setShowUpcoming] = useState(false);
  const [activePage, setActivePage]     = useState('month'); // 'month' | 'goals'
  const { toasts, add: toast } = useToast();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    localStorage.setItem('finflow-theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const isGoalsPage = activePage === 'goals';

  return (
    <div className="app">
      <Sidebar
        year={year}
        month={month}
        onSelect={setMonth}
        onYearChange={setYear}
        darkMode={darkMode}
        onToggleDark={() => setDarkMode(d => !d)}
        activePage={activePage}
        onPageChange={setActivePage}
      />

      <main className="main">
        <header className="topbar">
          <div className="topbar__title">
            {isGoalsPage ? (
              <>
                <h1>Metas <span>&amp; Objetivos</span></h1>
                <p className="topbar__rule">Acompanhe e registre seus objetivos financeiros</p>
              </>
            ) : (
              <>
                <h1>{MONTHS_PT[month - 1]} <span>{year}</span></h1>
                <p className="topbar__rule">Regra 50/30/20 — Controle Financeiro Pessoal</p>
              </>
            )}
          </div>
          {!isGoalsPage && (
            <div className="topbar__actions">
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => setShowUpcoming(v => !v)}
              >
                <i className="bx bx-calendar-check" />
                Próximos Vencimentos
              </button>
            </div>
          )}
        </header>

        {!isGoalsPage && showUpcoming && (
          <UpcomingPanel onTogglePaid={() => {}} />
        )}

        {isGoalsPage ? (
          <GoalsView darkMode={darkMode} toast={toast} />
        ) : (
          <MonthView
            key={`${year}-${month}`}
            year={year}
            month={month}
            darkMode={darkMode}
            toast={toast}
          />
        )}
      </main>

      <ToastContainer toasts={toasts} />
    </div>
  );
}