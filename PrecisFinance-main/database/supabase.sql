create table if not exists public.finance_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.finance_states enable row level security;

drop policy if exists "finance_states_select_own" on public.finance_states;
drop policy if exists "finance_states_insert_own" on public.finance_states;
drop policy if exists "finance_states_update_own" on public.finance_states;
drop policy if exists "finance_states_delete_own" on public.finance_states;

create policy "finance_states_select_own"
on public.finance_states
for select
to authenticated
using (auth.uid() = user_id);

create policy "finance_states_insert_own"
on public.finance_states
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "finance_states_update_own"
on public.finance_states
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "finance_states_delete_own"
on public.finance_states
for delete
to authenticated
using (auth.uid() = user_id);

grant select, insert, update, delete on public.finance_states to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.finance_states;
  end if;
exception
  when duplicate_object then null;
end $$;
