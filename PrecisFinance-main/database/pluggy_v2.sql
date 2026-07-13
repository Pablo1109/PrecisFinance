-- =====================================================================
-- Pluggy (Open Finance) — MIGRAÇÃO V2 para o PrecisFinance
-- Rode no SQL Editor do Supabase DEPOIS do database/pluggy.sql.
-- É idempotente: seguro rodar mais de uma vez (usa IF NOT EXISTS).
-- Escritas são feitas pelas Edge Functions (service_role, bypass RLS).
-- Leitura + edição de overrides é feita pelo app com RLS por usuário.
-- =====================================================================

-- ---------- Colunas novas em tabelas existentes -----------------------
-- Sincronização incremental de transações.
alter table public.pluggy_accounts add column if not exists last_tx_synced_at timestamptz;

-- Overrides editáveis pelo usuário (não são sobrescritos pela sync).
alter table public.pluggy_accounts add column if not exists display_name    text;
alter table public.pluggy_accounts add column if not exists user_due_day     int;
alter table public.pluggy_accounts add column if not exists user_closing_day int;
alter table public.pluggy_accounts add column if not exists hidden           boolean not null default false;

alter table public.pluggy_transactions add column if not exists user_category    text;
alter table public.pluggy_transactions add column if not exists user_subcategory text;
alter table public.pluggy_transactions add column if not exists pending          boolean not null default false;

alter table public.pluggy_items add column if not exists last_tx_synced_at timestamptz;

-- ---------- Histórico de sincronização --------------------------------
create table if not exists public.pluggy_sync_logs (
  id          bigint generated always as identity primary key,
  item_id     text not null,
  user_id     uuid not null references auth.users(id) on delete cascade,
  step        text not null,          -- item | accounts | transactions:<acc> | investments | loans | bills | done
  status      text not null,          -- ok | error | skip
  counts      jsonb,
  message     text,
  created_at  timestamptz not null default now()
);
create index if not exists pluggy_sync_logs_user_idx on public.pluggy_sync_logs(user_id);
create index if not exists pluggy_sync_logs_item_idx on public.pluggy_sync_logs(item_id);
create index if not exists pluggy_sync_logs_created_idx on public.pluggy_sync_logs(created_at desc);

-- ---------- Faturas de cartão -----------------------------------------
create table if not exists public.pluggy_bills (
  bill_id         text primary key,
  account_id      text not null references public.pluggy_accounts(account_id) on delete cascade,
  item_id         text not null references public.pluggy_items(item_id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  due_date        date,
  closing_date    date,
  total_amount    numeric,
  minimum_payment numeric,
  currency_code   text,
  raw             jsonb,
  updated_at      timestamptz not null default now()
);
create index if not exists pluggy_bills_user_idx on public.pluggy_bills(user_id);
create index if not exists pluggy_bills_account_idx on public.pluggy_bills(account_id);

-- ---------- Empréstimos / financiamentos ------------------------------
create table if not exists public.pluggy_loans (
  loan_id             text primary key,
  item_id             text not null references public.pluggy_items(item_id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  contract_number     text,
  product_name        text,
  outstanding_balance numeric,
  installment_amount  numeric,
  due_date            date,
  currency_code       text,
  raw                 jsonb,
  updated_at          timestamptz not null default now()
);
create index if not exists pluggy_loans_user_idx on public.pluggy_loans(user_id);
create index if not exists pluggy_loans_item_idx on public.pluggy_loans(item_id);

-- ---------- Regras de categorização (aprendizado) ---------------------
-- Guarda como o usuário classifica transações para aplicar em futuras syncs.
create table if not exists public.pluggy_category_rules (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  match_type    text not null default 'keyword',   -- keyword | pluggy_category | exact
  pattern       text not null,                      -- palavra-chave / categoria do Pluggy / descrição exata
  category_id   text,                               -- id da categoria no app
  subcategory   text,
  hits          int not null default 1,
  updated_at    timestamptz not null default now(),
  unique (user_id, match_type, pattern)
);
create index if not exists pluggy_cat_rules_user_idx on public.pluggy_category_rules(user_id);

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.pluggy_sync_logs       enable row level security;
alter table public.pluggy_bills           enable row level security;
alter table public.pluggy_loans           enable row level security;
alter table public.pluggy_category_rules  enable row level security;

-- Leitura: cada usuário só vê o que é seu.
drop policy if exists pluggy_sync_logs_select_own on public.pluggy_sync_logs;
create policy pluggy_sync_logs_select_own on public.pluggy_sync_logs
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists pluggy_bills_select_own on public.pluggy_bills;
create policy pluggy_bills_select_own on public.pluggy_bills
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists pluggy_loans_select_own on public.pluggy_loans;
create policy pluggy_loans_select_own on public.pluggy_loans
  for select to authenticated using (auth.uid() = user_id);

-- Regras de categoria: usuário lê e ESCREVE as próprias.
drop policy if exists pluggy_cat_rules_select_own on public.pluggy_category_rules;
create policy pluggy_cat_rules_select_own on public.pluggy_category_rules
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists pluggy_cat_rules_insert_own on public.pluggy_category_rules;
create policy pluggy_cat_rules_insert_own on public.pluggy_category_rules
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists pluggy_cat_rules_update_own on public.pluggy_category_rules;
create policy pluggy_cat_rules_update_own on public.pluggy_category_rules
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists pluggy_cat_rules_delete_own on public.pluggy_category_rules;
create policy pluggy_cat_rules_delete_own on public.pluggy_category_rules
  for delete to authenticated using (auth.uid() = user_id);

-- Overrides editáveis nas contas/transações já existentes.
drop policy if exists pluggy_accounts_update_own on public.pluggy_accounts;
create policy pluggy_accounts_update_own on public.pluggy_accounts
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists pluggy_tx_update_own on public.pluggy_transactions;
create policy pluggy_tx_update_own on public.pluggy_transactions
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- =====================================================================
-- GRANTS (obrigatório: sem GRANT a Data API não enxerga a tabela)
-- =====================================================================
grant select on public.pluggy_sync_logs to authenticated;
grant select on public.pluggy_bills     to authenticated;
grant select on public.pluggy_loans     to authenticated;
grant select, insert, update, delete on public.pluggy_category_rules to authenticated;

-- Usuário pode atualizar apenas campos seguros (overrides) nas contas/tx.
grant update (display_name, user_due_day, user_closing_day, hidden) on public.pluggy_accounts to authenticated;
grant update (user_category, user_subcategory) on public.pluggy_transactions to authenticated;

grant all on public.pluggy_sync_logs      to service_role;
grant all on public.pluggy_bills          to service_role;
grant all on public.pluggy_loans          to service_role;
grant all on public.pluggy_category_rules to service_role;

-- =====================================================================
-- Realtime (opcional — atualização ao vivo no app)
-- =====================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.pluggy_bills;
    alter publication supabase_realtime add table public.pluggy_loans;
    alter publication supabase_realtime add table public.pluggy_investments;
  end if;
exception when duplicate_object then null;
end $$;
