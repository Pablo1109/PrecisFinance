-- Adiciona rótulo do dono da conexão (ex.: "Eu", "Namorada").
-- Rode no SQL Editor do Supabase.
alter table public.pluggy_items
  add column if not exists owner_label text;
