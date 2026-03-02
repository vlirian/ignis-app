begin;

create table if not exists public.installation_incidents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text not null,
  location text,
  description text,
  severity text not null default 'media' check (severity in ('baja','media','alta','critica')),
  status text not null default 'activa' check (status in ('activa','resuelta')),
  reported_by text,
  resolved_at timestamptz,
  resolved_by text
);

create index if not exists idx_installation_incidents_created_at on public.installation_incidents(created_at desc);
create index if not exists idx_installation_incidents_status on public.installation_incidents(status);

alter table public.installation_incidents enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update on table public.installation_incidents to authenticated;
grant delete on table public.installation_incidents to authenticated;

drop policy if exists "installation_incidents_select_auth" on public.installation_incidents;
create policy "installation_incidents_select_auth"
  on public.installation_incidents
  for select
  to authenticated
  using (true);

drop policy if exists "installation_incidents_insert_auth" on public.installation_incidents;
create policy "installation_incidents_insert_auth"
  on public.installation_incidents
  for insert
  to authenticated
  with check (true);

drop policy if exists "installation_incidents_update_auth" on public.installation_incidents;
create policy "installation_incidents_update_auth"
  on public.installation_incidents
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "installation_incidents_delete_admin" on public.installation_incidents;
create policy "installation_incidents_delete_admin"
  on public.installation_incidents
  for delete
  to authenticated
  using (public.app_is_admin());

commit;
