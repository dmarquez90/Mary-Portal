
-- ============================================================
-- MIGRACIÓN 1: Ampliar movimientos_inventario
-- Agrega columnas necesarias para trazabilidad completa
-- ============================================================

-- 1. Agregar columnas faltantes a movimientos_inventario
ALTER TABLE movimientos_inventario
  ADD COLUMN IF NOT EXISTS costo_unitario  NUMERIC(15,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stock_antes     NUMERIC(15,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stock_despues   NUMERIC(15,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ref_factura_id  UUID REFERENCES facturas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ref_compra_id   UUID REFERENCES compras(id) ON DELETE SET NULL;

-- 2. Agregar CHECK: tipo solo puede ser 'entrada' o 'salida' (o 'ajuste')
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'movimientos_inventario_tipo_check'
  ) THEN
    ALTER TABLE movimientos_inventario
      ADD CONSTRAINT movimientos_inventario_tipo_check
      CHECK (tipo IN ('entrada', 'salida', 'ajuste'));
  END IF;
END $$;

-- 3. Índices para búsqueda rápida por referencia
CREATE INDEX IF NOT EXISTS idx_mov_inv_factura  ON movimientos_inventario(ref_factura_id) WHERE ref_factura_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mov_inv_compra   ON movimientos_inventario(ref_compra_id)  WHERE ref_compra_id  IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mov_inv_producto ON movimientos_inventario(producto_id, empresa_id, created_at DESC);

-- 4. RLS: asegurar que la tabla tiene RLS habilitado
ALTER TABLE movimientos_inventario ENABLE ROW LEVEL SECURITY;

-- Política de lectura (si no existe)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'movimientos_inventario'
      AND policyname = 'movimientos_inventario_select'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY movimientos_inventario_select ON movimientos_inventario
        FOR SELECT USING (
          empresa_id IN (
            SELECT id FROM empresas_persona_natural WHERE user_id = auth.uid()
            UNION ALL
            SELECT id FROM empresas_juridicas WHERE user_id = auth.uid()
          )
        )
    $policy$;
  END IF;
END $$;

-- Política de inserción (si no existe)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'movimientos_inventario'
      AND policyname = 'movimientos_inventario_insert'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY movimientos_inventario_insert ON movimientos_inventario
        FOR INSERT WITH CHECK (
          empresa_id IN (
            SELECT id FROM empresas_persona_natural WHERE user_id = auth.uid()
            UNION ALL
            SELECT id FROM empresas_juridicas WHERE user_id = auth.uid()
          )
        )
    $policy$;
  END IF;
END $$;
