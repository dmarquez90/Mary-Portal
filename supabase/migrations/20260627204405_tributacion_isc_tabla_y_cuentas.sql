
-- Tabla ISC
CREATE TABLE IF NOT EXISTS declaraciones_isc (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL,
  anio            INT  NOT NULL,
  mes             INT  NOT NULL,
  fecha_vencimiento DATE NOT NULL,
  base_imponible  NUMERIC(15,2) NOT NULL DEFAULT 0,
  tasa            NUMERIC(6,4)  NOT NULL DEFAULT 0,
  monto_isc       NUMERIC(15,2) NOT NULL DEFAULT 0,
  descripcion     TEXT,
  estado          TEXT NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente','declarado','pagado','exento')),
  fecha_declaracion DATE,
  fecha_pago      DATE,
  numero_boleta   TEXT,
  notas           TEXT,
  asiento_id      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, anio, mes)
);

ALTER TABLE declaraciones_isc ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='declaraciones_isc' AND policyname='empresa_isc'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY empresa_isc ON declaraciones_isc FOR ALL USING (
        empresa_id IN (
          SELECT id FROM empresas_persona_natural WHERE user_id = auth.uid()
          UNION SELECT id FROM empresas_juridicas   WHERE user_id = auth.uid()
        )
      )
    $policy$;
  END IF;
END $$;

-- Cuentas ISC en el plan para todas las empresas existentes
INSERT INTO plan_cuentas (empresa_id, codigo, nombre, tipo, nivel, permite_movimiento, activa)
SELECT e.id, '2.1.18', 'ISC por Pagar', 'pasivo', 3, true, true
FROM (SELECT id FROM empresas_persona_natural UNION ALL SELECT id FROM empresas_juridicas) e
WHERE NOT EXISTS (SELECT 1 FROM plan_cuentas WHERE empresa_id = e.id AND codigo = '2.1.18');

INSERT INTO plan_cuentas (empresa_id, codigo, nombre, tipo, nivel, permite_movimiento, activa)
SELECT e.id, '6.1.21', 'ISC – Impuesto Selectivo al Consumo', 'gasto', 3, true, true
FROM (SELECT id FROM empresas_persona_natural UNION ALL SELECT id FROM empresas_juridicas) e
WHERE NOT EXISTS (SELECT 1 FROM plan_cuentas WHERE empresa_id = e.id AND codigo = '6.1.21');
