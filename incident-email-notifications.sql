begin;

create table if not exists public.incident_email_recipients (
  email text primary key,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by text
);

create index if not exists idx_incident_email_recipients_enabled
  on public.incident_email_recipients(enabled);

alter table public.incident_email_recipients enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.incident_email_recipients to authenticated;

drop policy if exists "incident_email_recipients_select_admin" on public.incident_email_recipients;
create policy "incident_email_recipients_select_admin"
  on public.incident_email_recipients
  for select
  to authenticated
  using (public.app_is_admin());

drop policy if exists "incident_email_recipients_insert_admin" on public.incident_email_recipients;
create policy "incident_email_recipients_insert_admin"
  on public.incident_email_recipients
  for insert
  to authenticated
  with check (public.app_is_admin());

drop policy if exists "incident_email_recipients_update_admin" on public.incident_email_recipients;
create policy "incident_email_recipients_update_admin"
  on public.incident_email_recipients
  for update
  to authenticated
  using (public.app_is_admin())
  with check (public.app_is_admin());

drop policy if exists "incident_email_recipients_delete_admin" on public.incident_email_recipients;
create policy "incident_email_recipients_delete_admin"
  on public.incident_email_recipients
  for delete
  to authenticated
  using (public.app_is_admin());

insert into public.incident_email_recipients(email, enabled, updated_by)
values ('estudiovic@gmail.com', true, 'bootstrap')
on conflict (email) do update set enabled = true, updated_by = excluded.updated_by, updated_at = now();

commit;

