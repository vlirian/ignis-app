begin;

create table if not exists public.access_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_type text not null check (event_type in ('login', 'logout', 'session_resume')),
  email text,
  user_id uuid,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists idx_access_logs_created_at on public.access_logs(created_at desc);
create index if not exists idx_access_logs_email on public.access_logs(email);
create index if not exists idx_access_logs_event_type on public.access_logs(event_type);

alter table public.access_logs enable row level security;

grant usage on schema public to authenticated;
grant insert, select on table public.access_logs to authenticated;

drop policy if exists "access_logs_insert_authenticated" on public.access_logs;
create policy "access_logs_insert_authenticated"
  on public.access_logs
  for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and lower(coalesce(auth.jwt() ->> 'email', '')) = lower(coalesce(email, ''))
  );

drop policy if exists "access_logs_select_admin" on public.access_logs;
create policy "access_logs_select_admin"
  on public.access_logs
  for select
  to authenticated
  using (public.app_is_admin());

commit;

