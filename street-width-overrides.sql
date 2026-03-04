begin;

create table if not exists public.street_width_overrides (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text,
  street_id bigint references public.jaen_streets(id) on update cascade on delete cascade,
  street_name text,
  width_level text not null check (width_level in ('estrecha','media','ancha')),
  note text,
  constraint street_width_override_target_chk check (street_id is not null or street_name is not null)
);

create unique index if not exists uq_street_width_overrides_street_id
  on public.street_width_overrides(street_id)
  where street_id is not null;

create unique index if not exists uq_street_width_overrides_street_name
  on public.street_width_overrides((lower(street_name)))
  where street_id is null and street_name is not null;

create index if not exists idx_street_width_overrides_level
  on public.street_width_overrides(width_level);

alter table public.street_width_overrides enable row level security;

grant usage on schema public to authenticated;
grant select on table public.street_width_overrides to authenticated;
grant insert, update, delete on table public.street_width_overrides to authenticated;

drop policy if exists "street_width_overrides_select_auth" on public.street_width_overrides;
create policy "street_width_overrides_select_auth"
  on public.street_width_overrides
  for select
  to authenticated
  using (true);

drop policy if exists "street_width_overrides_insert_admin" on public.street_width_overrides;
create policy "street_width_overrides_insert_admin"
  on public.street_width_overrides
  for insert
  to authenticated
  with check (public.app_is_admin());

drop policy if exists "street_width_overrides_update_admin" on public.street_width_overrides;
create policy "street_width_overrides_update_admin"
  on public.street_width_overrides
  for update
  to authenticated
  using (public.app_is_admin())
  with check (public.app_is_admin());

drop policy if exists "street_width_overrides_delete_admin" on public.street_width_overrides;
create policy "street_width_overrides_delete_admin"
  on public.street_width_overrides
  for delete
  to authenticated
  using (public.app_is_admin());

-- Ejemplos (descomenta y ajusta según criterio operativo real del parque):
-- insert into public.street_width_overrides (street_name, width_level, note, updated_by)
-- values
--   ('Sierra Mágina', 'estrecha', 'Giros cerrados en tramo final', 'admin@parque');

commit;
