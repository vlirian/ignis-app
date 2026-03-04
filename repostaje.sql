begin;

create or replace function public.app_can_edit()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.app_is_admin()
    or exists (
      select 1
      from public.user_roles ur
      where lower(ur.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and ur.role in ('admin', 'operador')
    );
$$;

create table if not exists public.refuel_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  unit_id int not null,
  funcionario_number text not null,
  ticket_url text not null,
  signature_url text not null,
  created_by text
);

create index if not exists idx_refuel_logs_created_at on public.refuel_logs(created_at desc);
create index if not exists idx_refuel_logs_unit on public.refuel_logs(unit_id);

alter table public.refuel_logs enable row level security;

grant usage on schema public to authenticated;
grant select, insert on table public.refuel_logs to authenticated;
grant delete on table public.refuel_logs to authenticated;

drop policy if exists "refuel_logs_select_auth" on public.refuel_logs;
create policy "refuel_logs_select_auth"
  on public.refuel_logs
  for select
  to authenticated
  using (true);

drop policy if exists "refuel_logs_insert_edit" on public.refuel_logs;
create policy "refuel_logs_insert_edit"
  on public.refuel_logs
  for insert
  to authenticated
  with check (public.app_can_edit());

drop policy if exists "refuel_logs_delete_admin" on public.refuel_logs;
create policy "refuel_logs_delete_admin"
  on public.refuel_logs
  for delete
  to authenticated
  using (public.app_is_admin());

commit;
