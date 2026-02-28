-- ============================================================
-- IGNIS — Schema completo para Supabase
-- Ejecuta este script en Supabase → SQL Editor → New query
-- ============================================================

-- 1. CONFIGURACIÓN DE UNIDADES
-- Guarda cuántos cofres tiene cada unidad, si tiene techo y trasera
create table if not exists unit_configs (
  unit_id     integer primary key,
  num_cofres  integer not null default 6,
  has_techo   boolean not null default true,
  has_trasera boolean not null default true,
  updated_at  timestamptz default now()
);

-- 2. ARTÍCULOS DE CADA ZONA
-- Cada fila es un artículo dentro de una zona de una unidad
create table if not exists unit_items (
  id         uuid primary key default gen_random_uuid(),
  unit_id    integer not null,
  zone_id    text    not null,  -- 'cabina', 'techo', 'cofre1'...'cofre6', 'trasera'
  name       text    not null,
  description text   default '',
  qty        integer not null default 0,
  min_qty    integer not null default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Índice para consultas rápidas por unidad
create index if not exists idx_unit_items_unit_id on unit_items(unit_id);
create index if not exists idx_unit_items_zone    on unit_items(unit_id, zone_id);

-- 3. TRIGGER para actualizar updated_at automáticamente
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_unit_items_updated on unit_items;
create trigger trg_unit_items_updated
  before update on unit_items
  for each row execute function update_updated_at();

drop trigger if exists trg_unit_configs_updated on unit_configs;
create trigger trg_unit_configs_updated
  before update on unit_configs
  for each row execute function update_updated_at();

-- 4. ROW LEVEL SECURITY (RLS)
-- Por ahora acceso libre con la clave anónima (sin login)
-- Cuando añadamos autenticación, aquí se restringirá por parque/usuario
alter table unit_configs enable row level security;
alter table unit_items   enable row level security;

create policy "Acceso total anon unit_configs"
  on unit_configs for all
  using (true)
  with check (true);

create policy "Acceso total anon unit_items"
  on unit_items for all
  using (true)
  with check (true);

-- 5. DATOS INICIALES DE CONFIGURACIÓN
-- Inserta la configuración por defecto de las 22 unidades (0-22 sin 13)
insert into unit_configs (unit_id, num_cofres, has_techo, has_trasera) values
  (0,  4, true, true),
  (1,  6, true, true),
  (2,  6, true, true),
  (3,  5, true, true),
  (4,  6, true, true),
  (5,  4, true, true),
  (6,  5, true, true),
  (7,  6, true, true),
  (8,  6, true, true),
  (9,  5, true, true),
  (10, 4, true, true),
  (11, 6, true, true),
  (12, 6, true, true),
  (14, 5, true, true),
  (15, 6, true, true),
  (16, 4, true, true),
  (17, 6, true, true),
  (18, 6, true, true),
  (19, 5, true, true),
  (20, 4, true, true),
  (21, 6, true, true),
  (22, 6, true, true)
on conflict (unit_id) do nothing;
