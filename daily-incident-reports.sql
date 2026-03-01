begin;

create table if not exists public.daily_incident_reports (
  id uuid primary key default gen_random_uuid(),
  report_date date not null unique,
  generated_at timestamptz not null default now(),
  generated_by text,
  total_incidents integer not null default 0,
  total_inventory_changes integer not null default 0,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists idx_daily_incident_reports_date on public.daily_incident_reports(report_date desc);

alter table public.daily_incident_reports enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update on table public.daily_incident_reports to authenticated;

-- Solo administradores pueden leer el historial completo
 drop policy if exists "daily_incident_reports_select_admin" on public.daily_incident_reports;
create policy "daily_incident_reports_select_admin"
  on public.daily_incident_reports
  for select
  to authenticated
  using (public.app_is_admin());

-- Inserción/actualización permitida a autenticados para que se pueda generar automáticamente
-- al cerrar revisión aunque el último bombero no sea admin.
 drop policy if exists "daily_incident_reports_insert_auth" on public.daily_incident_reports;
create policy "daily_incident_reports_insert_auth"
  on public.daily_incident_reports
  for insert
  to authenticated
  with check (true);

 drop policy if exists "daily_incident_reports_update_auth" on public.daily_incident_reports;
create policy "daily_incident_reports_update_auth"
  on public.daily_incident_reports
  for update
  to authenticated
  using (true)
  with check (true);

-- Borrado solo admin
 drop policy if exists "daily_incident_reports_delete_admin" on public.daily_incident_reports;
create policy "daily_incident_reports_delete_admin"
  on public.daily_incident_reports
  for delete
  to authenticated
  using (public.app_is_admin());

commit;
