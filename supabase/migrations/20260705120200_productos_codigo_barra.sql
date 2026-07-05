-- ============================================================
-- Punto de Venta (2/5): código de barras en productos
-- ============================================================
ALTER TABLE productos ADD COLUMN IF NOT EXISTS codigo_barra TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_productos_codigo_barra_unico
  ON productos (empresa_id, codigo_barra)
  WHERE codigo_barra IS NOT NULL;
