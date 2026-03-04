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

create table if not exists public.shift_change_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  requester_email text not null,
  partner_email text not null,
  current_shift_date date not null,
  requested_shift_date date not null,
  notes text,
  status text not null default 'pendiente' check (status in ('pendiente', 'aceptado', 'rechazado', 'cancelado')),
  resolved_at timestamptz,
  resolved_by text
);

create index if not exists idx_shift_change_created_at on public.shift_change_requests(created_at desc);
create index if not exists idx_shift_change_requester on public.shift_change_requests(lower(requester_email));
create index if not exists idx_shift_change_partner on public.shift_change_requests(lower(partner_email));
create index if not exists idx_shift_change_status on public.shift_change_requests(status);

alter table public.shift_change_requests enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update on table public.shift_change_requests to authenticated;
grant delete on table public.shift_change_requests to authenticated;

drop policy if exists "shift_change_select_scoped" on public.shift_change_requests;
create policy "shift_change_select_scoped"
  on public.shift_change_requests
  for select
  to authenticated
  using (
    public.app_is_admin()
    or lower(requester_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or lower(partner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

drop policy if exists "shift_change_insert_edit" on public.shift_change_requests;
create policy "shift_change_insert_edit"
  on public.shift_change_requests
  for insert
  to authenticated
  with check (
    public.app_can_edit()
    and (
      public.app_is_admin()
      or lower(requester_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    )
  );

drop policy if exists "shift_change_update_scoped" on public.shift_change_requests;
create policy "shift_change_update_scoped"
  on public.shift_change_requests
  for update
  to authenticated
  using (
    public.app_is_admin()
    or lower(requester_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or lower(partner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
  with check (
    public.app_is_admin()
    or lower(requester_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    or lower(partner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

drop policy if exists "shift_change_delete_admin" on public.shift_change_requests;
create policy "shift_change_delete_admin"
  on public.shift_change_requests
  for delete
  to authenticated
  using (public.app_is_admin());

commit;
