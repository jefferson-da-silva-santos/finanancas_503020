# FinFlow — Controle Financeiro Pessoal (Regra 50/30/20)

> Aplicativo desktop para controle financeiro pessoal, com suporte a modo claro/escuro, gráficos interativos e distribuição automática de parcelas.

---

## 🏗️ Arquitetura: Por que Electron e não Tauri?

### Decisão técnica justificada

| Critério             | Tauri + Node Sidecar         | **Electron (escolhido)**         |
|----------------------|------------------------------|----------------------------------|
| Integração Node.js   | Complexa (sidecar externo)  | **Nativa — Node roda internamente** |
| SQLite (binário nativo) | Problemático com pkg      | **`better-sqlite3` direto, sem pkg** |
| Estabilidade produção | Instável em cross-platform  | **Madura, battle-tested**         |
| Empacotamento .exe    | Dois binários + sidecar IPC | **`electron-builder` → NSIS .exe** |
| Tamanho final         | ~5–10 MB                    | ~80–120 MB (tradeoff aceitável)  |
| Curva de aprendizado  | Alta (Rust necessário)      | **Baixa — puro JS/Node**         |

**Conclusão**: Para um produto desktop com Node.js + SQLite + React + .exe, Electron é a escolha correta. Tauri só vale a pena se tamanho for crítico e você dominar Rust para reescrever o backend.

### Por que `better-sqlite3` e não `sqlite3`?

- `sqlite3` usa callbacks assíncronos e binários nativos que **frequentemente quebram** durante empacotamento
- `better-sqlite3` é **síncrono** (mais simples no Express), 3x mais rápido em benchmarks, e empacota perfeitamente com `electron-builder`
- A única desvantagem: não suporta `.serialize()` (não precisamos disso)

---

## 📁 Estrutura de Pastas

```
finflow/
├── electron/
│   ├── main.js          # Processo principal do Electron
│   └── preload.js       # Bridge segura renderer ↔ main
├── src/
│   ├── App.jsx          # Frontend React (todos os componentes)
│   ├── App.css          # Estilos (dark/light, paleta verde/amber/orange)
│   └── main.jsx         # Entry point React
├── public/
│   └── favicon.svg
├── server.js            # Backend Express + better-sqlite3
├── package.json
├── vite.config.js
└── index.html
```

---

## 🗄️ Modelagem do Banco de Dados (SQLite)

### Tabela `months`
```sql
CREATE TABLE months (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  year         INTEGER NOT NULL,
  month        INTEGER NOT NULL,          -- 1-12
  income       REAL    NOT NULL DEFAULT 0,
  pct_essential REAL   NOT NULL DEFAULT 50,
  pct_personal  REAL   NOT NULL DEFAULT 30,
  pct_savings   REAL   NOT NULL DEFAULT 20,
  UNIQUE(year, month)
);
```

### Tabela `transactions`
```sql
CREATE TABLE transactions (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  month_id             INTEGER NOT NULL REFERENCES months(id) ON DELETE CASCADE,
  description          TEXT    NOT NULL,
  amount               REAL    NOT NULL,
  payment_method       TEXT    NOT NULL DEFAULT 'money',  -- money|debit|credit|pix|boleto|transfer
  payment_type         TEXT    NOT NULL DEFAULT 'cash',   -- cash|installment
  category             TEXT    NOT NULL,                  -- essential|personal|savings
  due_date             TEXT,                              -- YYYY-MM-DD
  paid                 INTEGER NOT NULL DEFAULT 0,        -- 0|1
  is_installment       INTEGER NOT NULL DEFAULT 0,
  installment_group_id TEXT,                              -- UUID do grupo de parcelas
  installment_number   INTEGER,
  installment_total    INTEGER,
  created_at           TEXT    NOT NULL DEFAULT (datetime('now'))
);
```

**Decisão de design**: meses são criados sob demanda (`getOrCreateMonth`). Apenas transações com `paid=1` entram nos cálculos realizados.

---

## 🔌 API Endpoints

| Método   | Rota                                    | Descrição                              |
|----------|-----------------------------------------|----------------------------------------|
| GET      | `/api/months/:year/:month`              | Dados do mês (cria se não existir)     |
| PUT      | `/api/months/:year/:month`              | Atualiza renda e percentuais           |
| GET      | `/api/months/:year/:month/transactions` | Lista transações do mês                |
| POST     | `/api/transactions`                     | Cria transação (simples ou parcelada)  |
| PUT      | `/api/transactions/:id`                 | Edita transação                        |
| DELETE   | `/api/transactions/:id`                 | Remove transação                       |
| DELETE   | `/api/transactions/group/:groupId`      | Remove todas as parcelas de um grupo   |
| PATCH    | `/api/transactions/:id/toggle-paid`     | Alterna status pago/pendente           |
| GET      | `/api/upcoming`                         | Contas a vencer nos próximos 30 dias   |
| GET      | `/api/year/:year`                       | Resumo de todos os meses do ano        |

---

## 🚀 Como Rodar em Desenvolvimento

### 1. Instalar dependências

```bash
npm install
```

> **Atenção**: `better-sqlite3` compila código nativo (C++). Você precisa do **Node.js 18+** e das **build tools**:
> - Windows: `npm install --global windows-build-tools` (como administrador) ou instalar Visual Studio Build Tools
> - Linux: `sudo apt install build-essential`
> - macOS: `xcode-select --install`

### 2. Rodar em desenvolvimento (servidor + frontend separados)

**Terminal 1 — Backend:**
```bash
node server.js
```

**Terminal 2 — Frontend:**
```bash
npm run dev
```

**Ou usar concurrently:**
```bash
npm run dev:full
```

**Terminal 3 — Electron (opcional, para ver como fica no desktop):**
```bash
NODE_ENV=development npm run electron
```

### 3. Testar a API
```bash
# Verificar se o servidor subiu
curl http://localhost:3333/api/months/2024/1

# Criar transação de teste
curl -X POST http://localhost:3333/api/transactions \
  -H "Content-Type: application/json" \
  -d '{"year":2024,"month":1,"description":"Aluguel","amount":1500,"category":"essential","due_date":"2024-01-10","paid":true,"payment_method":"pix"}'
```

---

## 📦 Gerar o Executável .exe

### 1. Build do frontend React
```bash
npm run build
```
Isso gera a pasta `dist/` com o frontend compilado.

### 2. Gerar o instalador .exe
```bash
npm run electron:build
```
O executável ficará em `dist-electron/`.

**O que o `electron-builder` faz:**
- Empacota o Electron + Node.js runtime + seu código
- Inclui `server.js` como recurso (path ajustado automaticamente)
- Gera instalador NSIS (`.exe`) configurável
- `better-sqlite3` é compilado durante `npm install` e incluído automaticamente

### ⚠️ Cuidados Críticos no Build

1. **Rebuild de módulos nativos**: O `better-sqlite3` precisa ser recompilado para a versão do Electron:
   ```bash
   npx electron-rebuild
   ```
   Execute isso **antes** do `electron:build` se tiver problemas.

2. **Ícone obrigatório**: O `electron-builder` requer `public/icon.ico` para Windows. Use um conversor online (PNG 256x256 → ICO) e coloque em `public/icon.ico`.

3. **Caminho do banco em produção**: O banco `finflow.db` é salvo em `os.homedir()` (ex: `C:\Users\SeuNome\finflow.db`). Nunca salve dentro do diretório de instalação — ele pode ser deletado no update.

4. **Antivírus falso positivo**: Executáveis Electron às vezes são bloqueados. Assinar o `.exe` com um certificado EV resolve definitivamente para distribuição comercial.

---

## 🎨 Sistema de Design

- **Fonte**: DM Sans (texto) + DM Mono (números/valores)
- **Cor primária**: Verde (`#16a34a`) — representa finanças
- **Destaque 1**: Âmbar (`#f59e0b`) — gastos pessoais, alertas
- **Destaque 2**: Laranja (`#f97316`) — economias/dívidas, urgência
- **Dark mode**: Fundo `#0d1117` (GitHub-like), cards `#161b22`
- **Light mode**: Fundo `#f8fafc`, cards `#ffffff`
- **Sidebar**: Sempre escura (contraste máximo com os meses)

---

## 🔒 Erros Comuns e Como Evitar

| Problema | Causa | Solução |
|----------|-------|---------|
| `Error: Cannot find module 'better-sqlite3'` | Módulo não instalado ou não rebuild | `npm install` + `npx electron-rebuild` |
| Janela branca no Electron | Vite não rodando ou porta errada | Verificar se `npm run dev` está ativo |
| `EADDRINUSE port 3333` | Processo anterior ainda ativo | `kill -9 $(lsof -ti:3333)` (Linux/Mac) ou fechar no Gerenciador de Tarefas |
| Banco não encontrado em produção | Caminho hardcoded errado | Usar sempre `os.homedir()` |
| Build falha no Windows | Build tools ausentes | Instalar Visual Studio Build Tools 2022 |
| Percentuais não salvam | Soma ≠ 100% | O sistema já valida e exibe erro |

---

## 💰 Potencial Comercial

Para evoluir para um produto vendável:
- [ ] Tela de onboarding (primeira vez)
- [ ] Exportação para PDF/Excel (relatório mensal)
- [ ] Metas de economia por categoria
- [ ] Notificações nativas do sistema (Electron Notification API)
- [ ] Sincronização via Google Drive/Dropbox (SQLite → arquivo na nuvem)
- [ ] Modo multi-perfil (casal, família)
- [ ] Gráficos de evolução anual
- [ ] Auto-update via `electron-updater`
#   f i n a n a n c a s _ 5 0 3 0 2 0  
 