-- Tabla para solicitudes de acceso desde Login
create table if not exists access_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text not null,
  notes text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_access_requests_status on access_requests(status);
create index if not exists idx_access_requests_created_at on access_requests(created_at desc);

alter table access_requests enable row level security;

-- Cualquiera puede crear una solicitud desde la pantalla de login
create policy "access_requests_insert_anon"
  on access_requests for insert
  to anon, authenticated
  with check (true);

-- Solo admin ve solicitudes
create policy "access_requests_select_admin"
  on access_requests for select
  to authenticated
  using (lower(auth.jwt() ->> 'email') in ('estudiovic@gmail.com'));

-- Solo admin aprueba/rechaza solicitudes
create policy "access_requests_update_admin"
  on access_requests for update
  to authenticated
  using (lower(auth.jwt() ->> 'email') in ('estudiovic@gmail.com'))
  with check (lower(auth.jwt() ->> 'email') in ('estudiovic@gmail.com'));
