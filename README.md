# Precis Finance — React + Vite

App financeiro completo em **React 18 + TypeScript + Vite**, com motor de tratamento Open Finance.

## Rodar local

```bash
cp env.example .env   # VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

Abre `http://localhost:5173`

## Rotas

| Rota | Tela |
|------|------|
| `/dashboard` | Visão geral |
| `/lancamentos` | Lançamentos manuais + OF importados |
| `/extrato` | Extrato unificado (`precis_entries`) |
| `/contas` | Contas |
| `/cartoes` | Cartões (controle manual) |
| `/cartoes-of` | Cartões Open Finance (motor DRE) |
| `/orcamentos` | Orçamentos |
| `/metas` | Metas |
| `/relatorios` | Relatórios |
| `/automacoes` | Regras de categorização |
| `/open-finance` | Conectar bancos (Pluggy) |
| `/correcao/open-finance` | Correção OF + fila de revisão |
| `/seguranca` | Backup, sync, conta |

## Arquitetura

```
src/
  app/AppRoutes.tsx      # React Router
  context/               # Auth, Finance (blob), Toast
  domain/                # Tipos, cálculos financeiros, seed
  engines/               # DRE, classificação, conciliação
  services/              # CardService, EntryService
  repositories/          # Supabase
  pages/                 # Telas principais
  routes/                # Telas do motor OF
  components/layout/     # Shell (sidebar, topbar)
```

## Stack

- React 18 + Vite + TypeScript
- Supabase (auth + `finance_states` + tabelas `precis_*` / `pluggy_*`)
- Pluggy Open Finance
- TanStack Query

## Legado

`src/app.js` permanece no repo como referência da migração — **não é mais o entry point**.

Ver `docs/PROXIMOS_PASSOS.md` para deploy e fase 2.
