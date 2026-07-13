# Deploy — Precis Finance v2 (Fase 1)

## 1. Banco (Supabase)

Rode as migrations **em ordem** no SQL Editor:

```
database/pluggy.sql
database/pluggy_v2.sql
database/pluggy_owner_label.sql
database/supabase.sql
database/migrations/003_data_resolution.sql
```

Todas são idempotentes.

## 2. Edge Functions (Supabase CLI)

Secrets necessários no projeto Supabase:

```bash
supabase secrets set \
  PLUGGY_CLIENT_ID=... \
  PLUGGY_CLIENT_SECRET=... \
  SUPABASE_ANON_KEY=...
# SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já vêm por padrão
```

Deploy:

```bash
supabase functions deploy pluggy-connect-token
supabase functions deploy pluggy-list-items
supabase functions deploy pluggy-sync
supabase functions deploy pluggy-sync-all
supabase functions deploy pluggy-webhook
```

## 3. Frontend (Vercel)

Variáveis de ambiente no projeto Vercel:

```
VITE_SUPABASE_URL=https://<seu-projeto>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

Comando de build: `npm run build`
Output: `dist`

O `vercel.json` já está configurado com rewrite SPA e headers de segurança.

## 4. Migração de dados existentes

A migration 003 é **aditiva** — não deleta nada de `pluggy_accounts`. A tabela `precis_cards` é populada pela próxima execução de `pluggy-sync`. Rode manualmente uma vez para cada item:

```bash
curl -X POST https://<projeto>.supabase.co/functions/v1/pluggy-sync-all \
  -H "Authorization: Bearer <access_token_do_usuario>"
```

Após esse backfill, `precis_entries` também estará populado a partir do histórico de `pluggy_transactions` (via UPSERT por `external_hash`).
