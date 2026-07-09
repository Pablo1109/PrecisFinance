-- =====================================================================
-- Pluggy (Open Finance) — tabelas para PrecisFinance
-- Rode no SQL Editor do Supabase.
-- Escritas são feitas pelas Edge Functions (service_role, bypass RLS).
-- Leitura é feita pelo app com RLS: cada usuário vê só o que é seu.
-- =====================================================================

-- ---------- Itens (conexões bancárias) --------------------------------
create table if not exists public.pluggy_items (
  item_id          text primary key,
  user_id          uuid not null references auth.users(id) on delete cascade,
  connector_id     bigint,
  connector_name   text,
  status           text,
  execution_status text,
  owner_label      text,
  last_synced_at   timestamptz,
  error            text,
  raw              jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
alter table public.pluggy_items add column if not exists owner_label text;
create index if not exists pluggy_items_user_idx on public.pluggy_items(user_id);

-- ---------- Contas (bancárias e cartões) ------------------------------
create table if not exists public.pluggy_accounts (
  account_id     text primary key,
  item_id        text not null references public.pluggy_items(item_id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  type           text,          -- BANK | CREDIT
  subtype        text,          -- CHECKING_ACCOUNT | CREDIT_CARD | ...
  name           text,
  number         text,
  marketing_name text,
  balance        numeric,
  currency_code  text,
  credit_data    jsonb,         -- limite, fatura, vencimento (cartões)
  raw            jsonb,
  updated_at     timestamptz not null default now()
);
create index if not exists pluggy_accounts_user_idx on public.pluggy_accounts(user_id);
create index if not exists pluggy_accounts_item_idx on public.pluggy_accounts(item_id);

-- ---------- Transações ------------------------------------------------
create table if not exists public.pluggy_transactions (
  tx_id          text primary key,
  account_id     text not null references public.pluggy_accounts(account_id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  date           date,
  description    text,
  amount         numeric,
  currency_code  text,
  category       text,
  type           text,          -- DEBIT | CREDIT
  raw            jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
alter table public.pluggy_transactions add column if not exists updated_at timestamptz not null default now();
create index if not exists pluggy_tx_user_idx on public.pluggy_transactions(user_id);
create index if not exists pluggy_tx_account_idx on public.pluggy_transactions(account_id);
create index if not exists pluggy_tx_date_idx on public.pluggy_transactions(date);

-- ---------- Investimentos --------------------------------------------
create table if not exists public.pluggy_investments (
  investment_id  text primary key,
  item_id        text not null references public.pluggy_items(item_id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  name           text,
  type           text,
  subtype        text,
  balance        numeric,
  amount         numeric,
  currency_code  text,
  raw            jsonb,
  updated_at     timestamptz not null default now()
);
create index if not exists pluggy_inv_user_idx on public.pluggy_investments(user_id);
create index if not exists pluggy_inv_item_idx on public.pluggy_investments(item_id);

-- ---------- RLS -------------------------------------------------------
alter table public.pluggy_items        enable row level security;
alter table public.pluggy_accounts     enable row level security;
alter table public.pluggy_transactions enable row level security;
alter table public.pluggy_investments  enable row level security;

-- Cada usuário só LÊ o que é seu. (Escrita é do service_role, que ignora RLS.)
drop policy if exists pluggy_items_select_own on public.pluggy_items;
create policy pluggy_items_select_own on public.pluggy_items
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists pluggy_accounts_select_own on public.pluggy_accounts;
create policy pluggy_accounts_select_own on public.pluggy_accounts
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists pluggy_tx_select_own on public.pluggy_transactions;
create policy pluggy_tx_select_own on public.pluggy_transactions
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists pluggy_inv_select_own on public.pluggy_investments;
create policy pluggy_inv_select_own on public.pluggy_investments
  for select to authenticated using (auth.uid() = user_id);

-- Permite o usuário desconectar (apagar) seus próprios itens.
drop policy if exists pluggy_items_delete_own on public.pluggy_items;
create policy pluggy_items_delete_own on public.pluggy_items
  for delete to authenticated using (auth.uid() = user_id);

-- Permite editar apenas campos seguros do item pela interface (ex.: rótulo do dono).
drop policy if exists pluggy_items_update_own on public.pluggy_items;
create policy pluggy_items_update_own on public.pluggy_items
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- Grants ----------------------------------------------------
grant select, delete on public.pluggy_items        to authenticated;
grant update (owner_label) on public.pluggy_items  to authenticated;
grant select          on public.pluggy_accounts     to authenticated;
grant select          on public.pluggy_transactions to authenticated;
grant select          on public.pluggy_investments  to authenticated;

grant all on public.pluggy_items        to service_role;
grant all on public.pluggy_accounts     to service_role;
grant all on public.pluggy_transactions to service_role;
grant all on public.pluggy_investments  to service_role;

-- ---------- Realtime (opcional, atualização ao vivo no app) ----------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.pluggy_accounts;
    alter publication supabase_realtime add table public.pluggy_transactions;
  end if;
exception when duplicate_object then null;
end $$;