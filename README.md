# Precis Finance — v2 (Fase 1: núcleo arquitetural)

Plataforma de gestão financeira construída sobre Open Finance, com Data Resolution Engine próprio.

## Stack

- React 18 + Vite + TypeScript (strict)
- Supabase (Auth, Postgres com RLS, Realtime, Edge Functions em Deno)
- Vercel (frontend)
- Pluggy (Open Finance)

## O que a Fase 1 entrega

1. Nova arquitetura em camadas: **Engines → Services → Repositories**.
2. Migration `003_data_resolution.sql` com:
   - `precis_field_overrides` (override por campo)
   - `precis_field_history` (auditoria)
   - `precis_entries` (lançamentos unificados)
   - `precis_cards` (cartões com colunas dedicadas — sem reuso ambíguo)
   - `precis_learned_categories`, `precis_review_queue`, `precis_sync_runs`
3. `DataResolutionEngine`, `ClassificationEngine`, `ReconciliationEngine`, `ConfidenceEngine`.
4. `CardService` completo (o padrão para os demais services das próximas fases).
5. Edge Function `pluggy-sync` reescrita: popula `precis_cards` + `precis_entries` com hash determinístico, cria itens em `precis_review_queue`, respeita overrides.
6. UI mínima (React) mostrando: lista de cartões com badges de origem, detalhe com edição manual de qualquer campo, tela "Correção Open Finance" que lista cartões com dados fracos.

## Como rodar

```bash
cp .env.example .env      # preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

Ver `docs/DEPLOY.md` para produção e `docs/ARCHITECTURE.md` para o modelo mental.

## Não incluído nesta fase (por escolha)

- Reescrita das telas de dashboard/fluxo/orçamento/metas: essas devem ser migradas na Fase 2 consumindo `precis_entries` via novos services.
- Módulos de investimentos e empréstimos com override por campo (mesma receita do `CardService`).
- Multi-provider (o design já suporta — hoje só há adaptador Pluggy).
