-- ============================================================
-- IGNIS — Tabla de revisiones de unidades
-- Ejecuta en Supabase → SQL Editor → New query
-- ============================================================

CREATE TABLE IF NOT EXISTS unit_reviews (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  unit_id     integer NOT NULL,
  reviewed_at timestamptz DEFAULT now(),
  reviewed_by text NOT NULL,        -- email del usuario que revisó
  notes       text DEFAULT '',      -- observaciones opcionales
  is_ok       boolean DEFAULT true  -- si la revisión fue satisfactoria
);

-- Índice para consultas por unidad
CREATE INDEX IF NOT EXISTS idx_unit_reviews_unit_id ON unit_reviews(unit_id);
CREATE INDEX IF NOT EXISTS idx_unit_reviews_date ON unit_reviews(reviewed_at DESC);

-- RLS (Row Level Security) — solo usuarios autenticados pueden leer/escribir
ALTER TABLE unit_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados pueden leer revisiones"
  ON unit_reviews FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Autenticados pueden insertar revisiones"
  ON unit_reviews FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Asegurar también que unit_items y unit_configs requieren autenticación
-- (si no tienes políticas ya, añade estas)
DO $$
BEGIN
  -- unit_items
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'unit_items' AND policyname = 'Autenticados leen items'
  ) THEN
    ALTER TABLE unit_items ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Autenticados leen items" ON unit_items FOR SELECT TO authenticated USING (true);
    CREATE POLICY "Autenticados modifican items" ON unit_items FOR ALL TO authenticated USING (true);
  END IF;

  -- unit_configs
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'unit_configs' AND policyname = 'Autenticados leen configs'
  ) THEN
    ALTER TABLE unit_configs ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Autenticados leen configs" ON unit_configs FOR SELECT TO authenticated USING (true);
    CREATE POLICY "Autenticados modifican configs" ON unit_configs FOR ALL TO authenticated USING (true);
  END IF;
END $$;
