-- =====================================================================
-- Precis Finance — Migration 003: Data Resolution Engine
-- Idempotente. Rode DEPOIS de pluggy.sql e pluggy_v2.sql.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Enum de origem (source-of-truth) reutilizado por overrides/histórico
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'precis_field_source') then
    create type public.precis_field_source as enum ('openfinance', 'calculated', 'manual', 'imported', 'inferred');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. Overrides por campo (chave: user_id + entity + entity_id + field)
--    Qualquer campo financeiro pode ter override individual do usuário.
-- ---------------------------------------------------------------------
create table if not exists public.precis_field_overrides (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  entity       text not null,        -- 'account' | 'card' | 'bill' | 'transaction' | 'loan' | 'investment'
  entity_id    text not null,        -- ex: account_id, tx_id, bill_id
  field        text not null,        -- ex: 'credit_limit', 'due_day', 'category', 'description'
  value        jsonb not null,       -- valor arbitrário (número, string, data ISO)
  source       public.precis_field_source not null default 'manual',
  confidence   int not null default 100 check (confidence between 0 and 100),
  reason       text,
  updated_at   timestamptz not null default now(),
  unique (user_id, entity, entity_id, field)
);
create index if not exists precis_overrides_user_idx  on public.precis_field_overrides(user_id);
create index if not exists precis_overrides_entity_idx on public.precis_field_overrides(entity, entity_id);

-- ---------------------------------------------------------------------
-- 3. Histórico de alterações (auditoria de todo campo resolvido)
-- ---------------------------------------------------------------------
create table if not exists public.precis_field_history (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  entity       text not null,
  entity_id    text not null,
  field        text not null,
  old_value    jsonb,
  new_value    jsonb,
  old_source   public.precis_field_source,
  new_source   public.precis_field_source,
  reason       text,
  created_at   timestamptz not null default now()
);
create index if not exists precis_history_user_idx   on public.precis_field_history(user_id);
create index if not exists precis_history_entity_idx on public.precis_field_history(entity, entity_id);
create index if not exists precis_history_created_idx on public.precis_field_history(created_at desc);

-- ---------------------------------------------------------------------
-- 4. Lançamentos unificados (coração do sistema)
--    Todo débito/crédito passa a existir aqui, independente da origem.
--    Ligado opcionalmente a uma transação Pluggy via source_ref.
-- ---------------------------------------------------------------------
create table if not exists public.precis_entries (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  account_id         text references public.pluggy_accounts(account_id) on delete set null,
  card_id            text,               -- account_id de um cartão, opcional
  date               date not null,
  posted_at          timestamptz,
  amount             numeric(18,2) not null,
  currency_code      text not null default 'BRL',
  direction          text not null check (direction in ('debit','credit')),
  description        text not null,
  merchant           text,
  category_id        text,
  subcategory        text,
  tags               text[] not null default '{}',
  cost_center        text,
  notes              text,
  is_installment     boolean not null default false,
  installment_number int,
  installment_total  int,
  bill_id            text references public.pluggy_bills(bill_id) on delete set null,
  source             public.precis_field_source not null default 'openfinance',
  source_ref         text,               -- ex: tx_id do Pluggy
  external_hash      text,               -- hash determinístico para dedupe
  reconciled_with    uuid references public.precis_entries(id) on delete set null,
  confidence         int not null default 90 check (confidence between 0 and 100),
  raw                jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (user_id, external_hash)
);
create index if not exists precis_entries_user_date_idx on public.precis_entries(user_id, date desc);
create index if not exists precis_entries_account_idx   on public.precis_entries(account_id);
create index if not exists precis_entries_card_idx      on public.precis_entries(card_id);
create index if not exists precis_entries_bill_idx      on public.precis_entries(bill_id);
create index if not exists precis_entries_source_ref_idx on public.precis_entries(source_ref);

-- ---------------------------------------------------------------------
-- 5. Refactor de cartões — separar limites/fatura em colunas dedicadas.
--    Aditivo: colunas antigas permanecem em pluggy_accounts.credit_data (jsonb).
--    Uma tabela dedicada evita reuso ambíguo do mesmo campo.
-- ---------------------------------------------------------------------
create table if not exists public.precis_cards (
  card_id              text primary key references public.pluggy_accounts(account_id) on delete cascade,
  user_id              uuid not null references auth.users(id) on delete cascade,
  item_id              text not null references public.pluggy_items(item_id) on delete cascade,
  display_name         text,
  brand                text,                -- VISA | MASTER | ELO | AMEX...
  last_four            text,
  credit_limit         numeric(18,2),       -- limite total
  available_limit      numeric(18,2),       -- disponível (Open Finance)
  used_limit           numeric(18,2),       -- utilizado (calc)
  current_bill_amount  numeric(18,2),       -- fatura atual (aberta)
  closed_bill_amount   numeric(18,2),       -- fatura fechada (pendente pagamento)
  minimum_payment      numeric(18,2),
  due_day              int check (due_day between 1 and 31),
  closing_day          int check (closing_day between 1 and 31),
  best_purchase_day    int check (best_purchase_day between 1 and 31),
  next_due_date        date,
  next_closing_date    date,
  future_installments  numeric(18,2) not null default 0,   -- soma parcelas futuras
  current_installments numeric(18,2) not null default 0,   -- parcelas do ciclo atual
  currency_code        text not null default 'BRL',
  updated_at           timestamptz not null default now()
);
create index if not exists precis_cards_user_idx on public.precis_cards(user_id);
create index if not exists precis_cards_item_idx on public.precis_cards(item_id);

-- ---------------------------------------------------------------------
-- 6. Categorias aprendidas (complementa pluggy_category_rules com peso)
-- ---------------------------------------------------------------------
create table if not exists public.precis_learned_categories (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  signature    text not null,                 -- normalized(merchant|description|pluggy_category)
  category_id  text not null,
  subcategory  text,
  weight       int not null default 1,
  last_seen_at timestamptz not null default now(),
  unique (user_id, signature)
);
create index if not exists precis_learned_user_idx on public.precis_learned_categories(user_id);

-- ---------------------------------------------------------------------
-- 7. Painel de revisão pós-sync
-- ---------------------------------------------------------------------
create table if not exists public.precis_review_queue (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  sync_run_id  uuid not null,
  kind         text not null,       -- 'new_entry' | 'reconcile_candidate' | 'category_learned' | 'card_incomplete' | 'conflict'
  entity       text not null,
  entity_id    text not null,
  payload      jsonb not null,
  resolved_at  timestamptz,
  resolved_by  text,                 -- 'user' | 'auto'
  created_at   timestamptz not null default now()
);
create index if not exists precis_review_user_open_idx on public.precis_review_queue(user_id) where resolved_at is null;
create index if not exists precis_review_run_idx on public.precis_review_queue(sync_run_id);

-- ---------------------------------------------------------------------
-- 8. Runs de sincronização (agrupa etapas em pluggy_sync_logs)
-- ---------------------------------------------------------------------
create table if not exists public.precis_sync_runs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  item_id       text,
  scope         text not null,       -- 'item' | 'all'
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  status        text not null default 'running', -- running | ok | partial | error
  counts        jsonb not null default '{}'::jsonb,
  message       text
);
create index if not exists precis_sync_runs_user_idx on public.precis_sync_runs(user_id, started_at desc);

-- =====================================================================
-- RLS + GRANTS
-- =====================================================================
alter table public.precis_field_overrides    enable row level security;
alter table public.precis_field_history      enable row level security;
alter table public.precis_entries            enable row level security;
alter table public.precis_cards              enable row level security;
alter table public.precis_learned_categories enable row level security;
alter table public.precis_review_queue       enable row level security;
alter table public.precis_sync_runs          enable row level security;

-- Overrides: usuário lê/escreve os próprios
drop policy if exists precis_overrides_all_own on public.precis_field_overrides;
create policy precis_overrides_all_own on public.precis_field_overrides
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Histórico: leitura própria (escrita via service_role/trigger)
drop policy if exists precis_history_select_own on public.precis_field_history;
create policy precis_history_select_own on public.precis_field_history
  for select to authenticated using (auth.uid() = user_id);

-- Entries: usuário CRUD próprio (lançamentos manuais)
drop policy if exists precis_entries_all_own on public.precis_entries;
create policy precis_entries_all_own on public.precis_entries
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Cards: leitura + update de campos manuais
drop policy if exists precis_cards_select_own on public.precis_cards;
create policy precis_cards_select_own on public.precis_cards
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists precis_cards_update_own on public.precis_cards;
create policy precis_cards_update_own on public.precis_cards
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Learned categories: CRUD próprio
drop policy if exists precis_learned_all_own on public.precis_learned_categories;
create policy precis_learned_all_own on public.precis_learned_categories
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Review queue: leitura + update próprio (marcar como resolvido)
drop policy if exists precis_review_select_own on public.precis_review_queue;
create policy precis_review_select_own on public.precis_review_queue
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists precis_review_update_own on public.precis_review_queue;
create policy precis_review_update_own on public.precis_review_queue
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Sync runs: leitura própria
drop policy if exists precis_sync_runs_select_own on public.precis_sync_runs;
create policy precis_sync_runs_select_own on public.precis_sync_runs
  for select to authenticated using (auth.uid() = user_id);

-- GRANTS (Data API)
grant select, insert, update, delete on public.precis_field_overrides    to authenticated;
grant select                          on public.precis_field_history      to authenticated;
grant select, insert, update, delete on public.precis_entries            to authenticated;
grant select, update                  on public.precis_cards              to authenticated;
grant select, insert, update, delete on public.precis_learned_categories to authenticated;
grant select, update                  on public.precis_review_queue       to authenticated;
grant select                          on public.precis_sync_runs          to authenticated;

grant all on public.precis_field_overrides    to service_role;
grant all on public.precis_field_history      to service_role;
grant all on public.precis_entries            to service_role;
grant all on public.precis_cards              to service_role;
grant all on public.precis_learned_categories to service_role;
grant all on public.precis_review_queue       to service_role;
grant all on public.precis_sync_runs          to service_role;

-- =====================================================================
-- Triggers utilitários
-- =====================================================================
create or replace function public.precis_touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists precis_entries_touch on public.precis_entries;
create trigger precis_entries_touch before update on public.precis_entries
  for each row execute function public.precis_touch_updated_at();

drop trigger if exists precis_cards_touch on public.precis_cards;
create trigger precis_cards_touch before update on public.precis_cards
  for each row execute function public.precis_touch_updated_at();

drop trigger if exists precis_overrides_touch on public.precis_field_overrides;
create trigger precis_overrides_touch before update on public.precis_field_overrides
  for each row execute function public.precis_touch_updated_at();

-- =====================================================================
-- Realtime
-- =====================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.precis_entries;
    alter publication supabase_realtime add table public.precis_cards;
    alter publication supabase_realtime add table public.precis_review_queue;
    alter publication supabase_realtime add table public.precis_sync_runs;
  end if;
exception when duplicate_object then null;
end $$;
