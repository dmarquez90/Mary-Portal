
-- ══════════════════════════════════════════════════════════════
-- 1. TASA DE CAMBIO OFICIAL (USD → NIO)
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS tasa_cambio (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   uuid NOT NULL,
  fecha        date NOT NULL,
  tasa         numeric(12,4) NOT NULL CHECK (tasa > 0),
  fuente       text DEFAULT 'BCN',          -- BCN, manual, etc.
  notas        text,
  created_at   timestamptz DEFAULT now(),
  created_by   uuid,
  UNIQUE (empresa_id, fecha)
);

ALTER TABLE tasa_cambio ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'tasa_cambio' AND policyname = 'tasa_cambio_empresa'
  ) THEN
    EXECUTE $p$
      CREATE POLICY tasa_cambio_empresa ON tasa_cambio
        USING (
          empresa_id IN (
            SELECT id FROM empresas_persona_natural WHERE user_id = auth.uid()
            UNION ALL
            SELECT id FROM empresas_juridicas WHERE user_id = auth.uid()
          )
        )
    $p$;
  END IF;
END $$;

-- ══════════════════════════════════════════════════════════════
-- 2. SESIONES DE CAJA (para arqueo)
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS sesiones_caja (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      uuid NOT NULL,
  cuenta_caja_id  uuid REFERENCES cuentas_caja(id),
  fecha_apertura  timestamptz NOT NULL DEFAULT now(),
  fecha_cierre    timestamptz,
  monto_apertura  numeric(15,2) NOT NULL DEFAULT 0,
  monto_cierre_sistema  numeric(15,2) DEFAULT 0,  -- calculado
  monto_cierre_fisico   numeric(15,2),            -- contado físicamente
  diferencia      numeric(15,2) GENERATED ALWAYS AS (
    COALESCE(monto_cierre_fisico, 0) - COALESCE(monto_cierre_sistema, 0)
  ) STORED,
  estado          text DEFAULT 'abierta' CHECK (estado IN ('abierta','cerrada')),
  notas           text,
  -- Denominaciones contadas al cierre (NIO)
  denom_500       int DEFAULT 0,
  denom_200       int DEFAULT 0,
  denom_100       int DEFAULT 0,
  denom_50        int DEFAULT 0,
  denom_20        int DEFAULT 0,
  denom_10        int DEFAULT 0,
  denom_5         int DEFAULT 0,
  denom_1         int DEFAULT 0,
  denom_050       int DEFAULT 0,  -- C$0.50
  -- Denominaciones USD al cierre
  denom_usd_100   int DEFAULT 0,
  denom_usd_50    int DEFAULT 0,
  denom_usd_20    int DEFAULT 0,
  denom_usd_10    int DEFAULT 0,
  denom_usd_5     int DEFAULT 0,
  denom_usd_1     int DEFAULT 0,
  tasa_usd        numeric(12,4),  -- tasa usada al cierre
  created_at      timestamptz DEFAULT now(),
  created_by      uuid
);

ALTER TABLE sesiones_caja ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'sesiones_caja' AND policyname = 'sesiones_caja_empresa'
  ) THEN
    EXECUTE $p$
      CREATE POLICY sesiones_caja_empresa ON sesiones_caja
        USING (
          empresa_id IN (
            SELECT id FROM empresas_persona_natural WHERE user_id = auth.uid()
            UNION ALL
            SELECT id FROM empresas_juridicas WHERE user_id = auth.uid()
          )
        )
    $p$;
  END IF;
END $$;

-- ══════════════════════════════════════════════════════════════
-- 3. CAMPOS EXTRA EN FACTURAS (pago en caja / cambio / denominaciones)
-- ══════════════════════════════════════════════════════════════
ALTER TABLE facturas
  ADD COLUMN IF NOT EXISTS moneda            text DEFAULT 'NIO',
  ADD COLUMN IF NOT EXISTS tasa_cambio       numeric(12,4),   -- tasa usada si moneda=USD
  ADD COLUMN IF NOT EXISTS total_usd         numeric(15,2),   -- total en USD (si aplica)
  ADD COLUMN IF NOT EXISTS monto_recibido    numeric(15,2),   -- efectivo entregado por cliente
  ADD COLUMN IF NOT EXISTS cambio_entregado  numeric(15,2),   -- vuelto
  ADD COLUMN IF NOT EXISTS sesion_caja_id    uuid REFERENCES sesiones_caja(id);

-- ══════════════════════════════════════════════════════════════
-- 4. ÍNDICES ÚTILES PARA LOS FILTROS
-- ══════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_facturas_numero   ON facturas (empresa_id, numero_factura);
CREATE INDEX IF NOT EXISTS idx_facturas_fecha    ON facturas (empresa_id, fecha_emision);
CREATE INDEX IF NOT EXISTS idx_compras_numero    ON compras  (empresa_id, numero_compra);
CREATE INDEX IF NOT EXISTS idx_compras_fecha     ON compras  (empresa_id, fecha_compra);
CREATE INDEX IF NOT EXISTS idx_compras_proveedor ON compras  (empresa_id, proveedor_id);
CREATE INDEX IF NOT EXISTS idx_tasa_cambio_fecha ON tasa_cambio (empresa_id, fecha DESC);
