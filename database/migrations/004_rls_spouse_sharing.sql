-- ==========================================
-- MIGRATION: 004_rls_spouse_sharing.sql
-- Description: Libera acesso de leitura (SELECT) entre contas vinculadas (cônjuges)
--              para viabilizar a Visão Geral Família.
-- ==========================================

-- 1. Liberar leitura compartilhada na tabela finance_states
drop policy if exists "finance_states_select_own" on public.finance_states;
drop policy if exists "finance_states_select_shared" on public.finance_states;

create policy "finance_states_select_shared"
on public.finance_states
for select
to authenticated
using (
  auth.uid() = user_id 
  or (state -> 'settings' ->> 'spouseId')::uuid = auth.uid()
);


-- 2. Liberar leitura compartilhada na tabela precis_entries (Transações Manuais)
drop policy if exists precis_entries_all_own on public.precis_entries;
drop policy if exists precis_entries_select_shared on public.precis_entries;
drop policy if exists precis_entries_insert_own on public.precis_entries;
drop policy if exists precis_entries_update_own on public.precis_entries;
drop policy if exists precis_entries_delete_own on public.precis_entries;

create policy "precis_entries_select_shared"
on public.precis_entries
for select
to authenticated
using (
  auth.uid() = user_id
  or exists (
    select 1 from public.finance_states fs
    where fs.user_id = precis_entries.user_id
    and (fs.state -> 'settings' ->> 'spouseId')::uuid = auth.uid()
  )
);

create policy "precis_entries_insert_own"
on public.precis_entries
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "precis_entries_update_own"
on public.precis_entries
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "precis_entries_delete_own"
on public.precis_entries
for delete
to authenticated
using (auth.uid() = user_id);


-- 3. Liberar leitura compartilhada na tabela precis_recurring_bills (Contas Fixas)
drop policy if exists precis_recurring_bills_all_own on public.precis_recurring_bills;
drop policy if exists precis_recurring_bills_select_own on public.precis_recurring_bills;
drop policy if exists precis_recurring_bills_select_shared on public.precis_recurring_bills;
drop policy if exists precis_recurring_bills_insert_own on public.precis_recurring_bills;
drop policy if exists precis_recurring_bills_update_own on public.precis_recurring_bills;
drop policy if exists precis_recurring_bills_delete_own on public.precis_recurring_bills;

create policy "precis_recurring_bills_select_shared"
on public.precis_recurring_bills
for select
to authenticated
using (
  auth.uid() = user_id
  or exists (
    select 1 from public.finance_states fs
    where fs.user_id = precis_recurring_bills.user_id
    and (fs.state -> 'settings' ->> 'spouseId')::uuid = auth.uid()
  )
);

create policy "precis_recurring_bills_insert_own"
on public.precis_recurring_bills
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "precis_recurring_bills_update_own"
on public.precis_recurring_bills
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "precis_recurring_bills_delete_own"
on public.precis_recurring_bills
for delete
to authenticated
using (auth.uid() = user_id);
