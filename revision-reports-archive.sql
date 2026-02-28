begin;

create table if not exists public.revision_reports_archive (
  id uuid primary key default gen_random_uuid(),
  original_id uuid,
  report_date date not null,
  bombero_id integer not null,
  unit_id integer not null,
  is_ok boolean not null default false,
  incidents jsonb default '[]'::jsonb,
  general_notes text,
  reviewed_by text,
  created_at timestamptz,
  deleted_at timestamptz not null default now(),
  deleted_by text
);

create index if not exists idx_revision_reports_archive_date on public.revision_reports_archive(report_date desc);
create index if not exists idx_revision_reports_archive_bv on public.revision_reports_archive(bombero_id);
create index if not exists idx_revision_reports_archive_unit on public.revision_reports_archive(unit_id);

alter table public.revision_reports_archive enable row level security;

grant usage on schema public to authenticated;
grant select, insert, delete on table public.revision_reports_archive to authenticated;

-- Solo admin gestiona archivo
 drop policy if exists "revision_reports_archive_select_admin" on public.revision_reports_archive;
create policy "revision_reports_archive_select_admin"
  on public.revision_reports_archive
  for select
  to authenticated
  using (public.app_is_admin());

 drop policy if exists "revision_reports_archive_insert_admin" on public.revision_reports_archive;
create policy "revision_reports_archive_insert_admin"
  on public.revision_reports_archive
  for insert
  to authenticated
  with check (public.app_is_admin());

 drop policy if exists "revision_reports_archive_delete_admin" on public.revision_reports_archive;
create policy "revision_reports_archive_delete_admin"
  on public.revision_reports_archive
  for delete
  to authenticated
  using (public.app_is_admin());

commit;
