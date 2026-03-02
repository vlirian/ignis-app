begin;

create table if not exists public.vehicle_incidents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  unit_id int not null,
  title text not null,
  description text,
  severity text not null default 'media' check (severity in ('baja','media','alta','critica')),
  status text not null default 'activa' check (status in ('activa','resuelta')),
  reported_by text,
  resolved_at timestamptz,
  resolved_by text
);

create index if not exists idx_vehicle_incidents_created_at on public.vehicle_incidents(created_at desc);
create index if not exists idx_vehicle_incidents_status on public.vehicle_incidents(status);
create index if not exists idx_vehicle_incidents_unit on public.vehicle_incidents(unit_id);

alter table public.vehicle_incidents enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update on table public.vehicle_incidents to authenticated;
grant delete on table public.vehicle_incidents to authenticated;

drop policy if exists "vehicle_incidents_select_auth" on public.vehicle_incidents;
create policy "vehicle_incidents_select_auth"
  on public.vehicle_incidents
  for select
  to authenticated
  using (true);

drop policy if exists "vehicle_incidents_insert_auth" on public.vehicle_incidents;
create policy "vehicle_incidents_insert_auth"
  on public.vehicle_incidents
  for insert
  to authenticated
  with check (true);

drop policy if exists "vehicle_incidents_update_auth" on public.vehicle_incidents;
create policy "vehicle_incidents_update_auth"
  on public.vehicle_incidents
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "vehicle_incidents_delete_admin" on public.vehicle_incidents;
create policy "vehicle_incidents_delete_admin"
  on public.vehicle_incidents
  for delete
  to authenticated
  using (public.app_is_admin());

commit;
