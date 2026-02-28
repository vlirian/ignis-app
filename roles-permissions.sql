begin;

-- ==============================
-- Jerarquía de roles
-- admin > operador > lector
-- ==============================

create table if not exists public.user_roles (
  email text primary key,
  role text not null check (role in ('admin','operador','lector')),
  updated_by text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_roles_role on public.user_roles(role);

-- Admin bootstrap (tu usuario actual)
insert into public.user_roles(email, role, updated_by)
values ('estudiovic@gmail.com', 'admin', 'bootstrap')
on conflict (email) do update set role = excluded.role, updated_by = excluded.updated_by, updated_at = now();

create or replace function public.app_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    lower(coalesce(auth.jwt() ->> 'email', '')) in ('estudiovic@gmail.com')
    or exists (
      select 1
      from public.user_roles ur
      where lower(ur.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and ur.role = 'admin'
    );
$$;

alter table public.user_roles enable row level security;

grant usage on schema public to anon, authenticated;
grant select on table public.user_roles to authenticated;
grant insert, update, delete on table public.user_roles to authenticated;

-- Lee su propio rol
 drop policy if exists "user_roles_select_own" on public.user_roles;
create policy "user_roles_select_own"
  on public.user_roles
  for select
  to authenticated
  using (lower(email) = lower(auth.jwt() ->> 'email'));

-- Admin lee todos
 drop policy if exists "user_roles_select_admin" on public.user_roles;
create policy "user_roles_select_admin"
  on public.user_roles
  for select
  to authenticated
  using (public.app_is_admin());

-- Admin gestiona todos
 drop policy if exists "user_roles_insert_admin" on public.user_roles;
create policy "user_roles_insert_admin"
  on public.user_roles
  for insert
  to authenticated
  with check (public.app_is_admin());

 drop policy if exists "user_roles_update_admin" on public.user_roles;
create policy "user_roles_update_admin"
  on public.user_roles
  for update
  to authenticated
  using (public.app_is_admin())
  with check (public.app_is_admin());

 drop policy if exists "user_roles_delete_admin" on public.user_roles;
create policy "user_roles_delete_admin"
  on public.user_roles
  for delete
  to authenticated
  using (public.app_is_admin());

-- ==============================
-- Ajuste de access_requests para usar admin por rol
-- ==============================

create table if not exists public.access_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text not null,
  notes text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.access_requests enable row level security;

grant insert on table public.access_requests to anon, authenticated;
grant select, update on table public.access_requests to authenticated;

 drop policy if exists "access_requests_insert_anon" on public.access_requests;
create policy "access_requests_insert_anon"
  on public.access_requests
  for insert
  to anon, authenticated
  with check (true);

 drop policy if exists "access_requests_select_admin" on public.access_requests;
create policy "access_requests_select_admin"
  on public.access_requests
  for select
  to authenticated
  using (public.app_is_admin());

 drop policy if exists "access_requests_update_admin" on public.access_requests;
create policy "access_requests_update_admin"
  on public.access_requests
  for update
  to authenticated
  using (public.app_is_admin())
  with check (public.app_is_admin());

commit;
