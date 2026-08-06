-- ================================================================
-- Impuesto de Bienes Inmuebles (IBI) — Decreto N°. 3-95 (La Gaceta
-- N°. 21, 31-ene-1995), municipal, ANUAL (no confundir con el IMI,
-- que es mensual sobre ingresos brutos y grava la actividad económica,
-- no la propiedad).
--
-- Tasa: 1% sobre la base imponible = 80% del valor catastral (o
-- autoevalúo, el mayor). Se paga en dos cuotas del 50%. El sistema NO
-- calcula el valor catastral (no lo tiene) — el usuario lo captura
-- manualmente, igual que hace con el monto de matrícula municipal.
-- ================================================================

CREATE TABLE IF NOT EXISTS declaraciones_ibi (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID NOT NULL,
  anio                INT NOT NULL,
  descripcion_inmueble TEXT,
  valor_catastral     NUMERIC(15,2) NOT NULL DEFAULT 0,
  base_imponible      NUMERIC(15,2) NOT NULL DEFAULT 0,  -- 80% del valor catastral
  tasa                NUMERIC(5,4) NOT NULL DEFAULT 0.01,
  monto_ibi           NUMERIC(15,2) NOT NULL DEFAULT 0,
  fecha_vencimiento_cuota1 DATE,
  fecha_vencimiento_cuota2 DATE,
  cuota1_pagada       BOOLEAN NOT NULL DEFAULT FALSE,
  cuota2_pagada       BOOLEAN NOT NULL DEFAULT FALSE,
  fecha_pago_cuota1   DATE,
  fecha_pago_cuota2   DATE,
  numero_recibo_cuota1 TEXT,
  numero_recibo_cuota2 TEXT,
  estado              TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','pagado_parcial','pagado')),
  notas               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, anio, descripcion_inmueble)
);

ALTER TABLE declaraciones_ibi ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "own_empresa" ON declaraciones_ibi;
  CREATE POLICY "own_empresa" ON declaraciones_ibi FOR ALL USING (empresa_id = ANY(get_empresa_ids()));
END$$;

CREATE INDEX IF NOT EXISTS idx_ibi_empresa ON declaraciones_ibi(empresa_id, anio);

CREATE OR REPLACE FUNCTION fn_ibi_calcular_monto()
RETURNS TRIGGER AS $$
BEGIN
  NEW.base_imponible := ROUND(NEW.valor_catastral * 0.80, 2);
  NEW.monto_ibi := ROUND(NEW.base_imponible * NEW.tasa, 2);
  NEW.estado := CASE
    WHEN NEW.cuota1_pagada AND NEW.cuota2_pagada THEN 'pagado'
    WHEN NEW.cuota1_pagada OR NEW.cuota2_pagada THEN 'pagado_parcial'
    ELSE 'pendiente'
  END;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_ibi_calcular_monto ON declaraciones_ibi;
CREATE TRIGGER trg_ibi_calcular_monto
  BEFORE INSERT OR UPDATE ON declaraciones_ibi
  FOR EACH ROW EXECUTE FUNCTION fn_ibi_calcular_monto();
