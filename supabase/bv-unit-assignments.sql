-- Asignación dinámica de unidades a bomberos (BV1..BV7)
-- Ejecuta este SQL en Supabase (SQL Editor).

create table if not exists public.bv_unit_assignments (
  unit_id int primary key,
  bombero_id int not null check (bombero_id between 1 and 7),
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at_bv_unit_assignments()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_set_updated_at_bv_unit_assignments on public.bv_unit_assignments;
create trigger trg_set_updated_at_bv_unit_assignments
before update on public.bv_unit_assignments
for each row
execute function public.set_updated_at_bv_unit_assignments();

alter table public.bv_unit_assignments enable row level security;

drop policy if exists "bv_assignments_select_authenticated" on public.bv_unit_assignments;
create policy "bv_assignments_select_authenticated"
on public.bv_unit_assignments
for select
to authenticated
using (true);

drop policy if exists "bv_assignments_admin_write" on public.bv_unit_assignments;
create policy "bv_assignments_admin_write"
on public.bv_unit_assignments
for all
to authenticated
using (
  lower(coalesce(auth.jwt() ->> 'email', '')) = 'estudiovic@gmail.com'
  or exists (
    select 1
    from public.user_roles ur
    where lower(ur.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and ur.role = 'admin'
  )
)
with check (
  lower(coalesce(auth.jwt() ->> 'email', '')) = 'estudiovic@gmail.com'
  or exists (
    select 1
    from public.user_roles ur
    where lower(ur.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and ur.role = 'admin'
  )
);

insert into public.bv_unit_assignments (unit_id, bombero_id, updated_by)
values
  (3, 1, 'seed'),
  (7, 1, 'seed'),
  (19, 1, 'seed'),
  (0, 2, 'seed'),
  (6, 2, 'seed'),
  (14, 2, 'seed'),
  (1, 3, 'seed'),
  (16, 3, 'seed'),
  (22, 3, 'seed'),
  (10, 4, 'seed'),
  (11, 4, 'seed'),
  (15, 4, 'seed'),
  (4, 5, 'seed'),
  (9, 5, 'seed'),
  (18, 5, 'seed'),
  (21, 5, 'seed'),
  (2, 6, 'seed'),
  (12, 6, 'seed'),
  (17, 6, 'seed'),
  (5, 7, 'seed'),
  (8, 7, 'seed'),
  (20, 7, 'seed')
on conflict (unit_id) do nothing;
