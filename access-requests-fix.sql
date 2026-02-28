begin;

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

create index if not exists idx_access_requests_status on public.access_requests(status);
create index if not exists idx_access_requests_created_at on public.access_requests(created_at desc);

alter table public.access_requests enable row level security;

-- Permisos SQL necesarios para PostgREST
grant usage on schema public to anon, authenticated;
grant insert on table public.access_requests to anon, authenticated;
grant select, update on table public.access_requests to authenticated;

-- Policies idempotentes
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
  using (lower(auth.jwt() ->> 'email') in ('estudiovic@gmail.com'));

 drop policy if exists "access_requests_update_admin" on public.access_requests;
create policy "access_requests_update_admin"
  on public.access_requests
  for update
  to authenticated
  using (lower(auth.jwt() ->> 'email') in ('estudiovic@gmail.com'))
  with check (lower(auth.jwt() ->> 'email') in ('estudiovic@gmail.com'));

commit;
