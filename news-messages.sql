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

create table if not exists public.news_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text not null,
  message text not null,
  priority int not null default 2 check (priority between 1 and 4),
  created_by text
);

create index if not exists idx_news_messages_priority_created on public.news_messages(priority desc, created_at desc);

alter table public.news_messages enable row level security;

grant usage on schema public to authenticated;
grant select, insert on table public.news_messages to authenticated;
grant update, delete on table public.news_messages to authenticated;

drop policy if exists "news_messages_select_auth" on public.news_messages;
create policy "news_messages_select_auth"
  on public.news_messages
  for select
  to authenticated
  using (true);

drop policy if exists "news_messages_insert_edit" on public.news_messages;
create policy "news_messages_insert_edit"
  on public.news_messages
  for insert
  to authenticated
  with check (public.app_can_edit());

drop policy if exists "news_messages_update_edit" on public.news_messages;
create policy "news_messages_update_edit"
  on public.news_messages
  for update
  to authenticated
  using (public.app_can_edit())
  with check (public.app_can_edit());

drop policy if exists "news_messages_delete_admin" on public.news_messages;
create policy "news_messages_delete_admin"
  on public.news_messages
  for delete
  to authenticated
  using (public.app_is_admin());

commit;
