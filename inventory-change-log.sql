-- Registro de cambios de inventario (altas, bajas, edición, cantidad, estado)
create table if not exists public.inventory_change_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  unit_id int not null,
  unit_label text,
  zone_id text,
  item_id text,
  item_name text,
  change_type text not null,
  detail text,
  previous_value jsonb,
  new_value jsonb,
  changed_by text,
  metadata jsonb
);

create index if not exists idx_inventory_change_log_created_at on public.inventory_change_log(created_at desc);
create index if not exists idx_inventory_change_log_unit_id on public.inventory_change_log(unit_id);

alter table public.inventory_change_log enable row level security;

-- Lectura para usuarios autenticados
create policy if not exists "inventory_change_log_read_auth"
on public.inventory_change_log
for select
to authenticated
using (true);

-- Inserción para usuarios autenticados (la app cliente escribe el log)
create policy if not exists "inventory_change_log_insert_auth"
on public.inventory_change_log
for insert
to authenticated
with check (true);

-- Sin updates/deletes desde cliente
