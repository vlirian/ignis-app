begin;

create table if not exists public.app_ui_settings (
  key text primary key,
  value_json jsonb not null default '{}'::jsonb,
  updated_by text,
  updated_at timestamptz not null default now()
);

alter table public.app_ui_settings enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update on table public.app_ui_settings to authenticated;

drop policy if exists "app_ui_settings_select_auth" on public.app_ui_settings;
create policy "app_ui_settings_select_auth"
  on public.app_ui_settings
  for select
  to authenticated
  using (true);

drop policy if exists "app_ui_settings_insert_admin" on public.app_ui_settings;
create policy "app_ui_settings_insert_admin"
  on public.app_ui_settings
  for insert
  to authenticated
  with check (public.app_is_admin());

drop policy if exists "app_ui_settings_update_admin" on public.app_ui_settings;
create policy "app_ui_settings_update_admin"
  on public.app_ui_settings
  for update
  to authenticated
  using (public.app_is_admin())
  with check (public.app_is_admin());

insert into public.app_ui_settings(key, value_json, updated_by)
values ('material_menu', '{"enabled": true}'::jsonb, 'bootstrap')
on conflict (key) do nothing;

commit;
