-- ============================================================
-- SARA ERP — Fase 6: Tributación Ampliada y Declaraciones
-- LCT art. 52, 55, 63-64, 87, 150+ · Plan Arbitrios Municipal
-- Compatible con portal VET de la DGI Nicaragua
-- ============================================================

-- ============================================================
-- ALTERAR PRODUCTOS: agregar ISC
-- ============================================================
ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS aplica_isc    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tasa_isc      NUMERIC(5,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS aplica_imi    BOOLEAN NOT NULL DEFAULT TRUE;

-- ============================================================
-- TABLA 1: IR ANUAL — DECLARACIÓN FORMULARIO 106
-- LCT art. 52 y 55
-- ============================================================
CREATE TABLE IF NOT EXISTS declaraciones_ir_anual (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id                  UUID NOT NULL,

  -- Período fiscal
  anio_fiscal                 INT NOT NULL,
  fecha_inicio_periodo        DATE NOT NULL,
  fecha_fin_periodo           DATE NOT NULL,
  fecha_presentacion          DATE,          -- límite: 28 febrero año siguiente
  fecha_pago                  DATE,

  -- Rentas brutas (ingresos totales del período)
  renta_bruta_actividades     NUMERIC(15,2) NOT NULL DEFAULT 0,  -- ventas + servicios
  otras_rentas_gravables      NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_renta_bruta           NUMERIC(15,2) GENERATED ALWAYS AS
                              (renta_bruta_actividades + otras_rentas_gravables) STORED,

  -- Costos y gastos deducibles
  costo_ventas                NUMERIC(15,2) NOT NULL DEFAULT 0,
  gastos_administracion       NUMERIC(15,2) NOT NULL DEFAULT 0,
  gastos_ventas               NUMERIC(15,2) NOT NULL DEFAULT 0,
  gastos_financieros          NUMERIC(15,2) NOT NULL DEFAULT 0,
  depreciacion_fiscal         NUMERIC(15,2) NOT NULL DEFAULT 0,   -- de tabla depreciaciones
  gastos_nomina               NUMERIC(15,2) NOT NULL DEFAULT 0,   -- de tabla planillas
  otros_gastos_deducibles     NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_costos_gastos         NUMERIC(15,2) GENERATED ALWAYS AS
                              (costo_ventas + gastos_administracion + gastos_ventas +
                               gastos_financieros + depreciacion_fiscal + gastos_nomina +
                               otros_gastos_deducibles) STORED,

  -- Renta neta gravable
  renta_neta_gravable         NUMERIC(15,2) GENERATED ALWAYS AS
                              (GREATEST(0, renta_bruta_actividades + otras_rentas_gravables -
                               (costo_ventas + gastos_administracion + gastos_ventas +
                                gastos_financieros + depreciacion_fiscal + gastos_nomina +
                                otros_gastos_deducibles))) STORED,

  -- Cálculo IR (LCT art. 52: 30% sobre renta neta)
  ir_30_pct                   NUMERIC(15,2) NOT NULL DEFAULT 0,   -- renta_neta * 0.30
  pago_minimo_definitivo      NUMERIC(15,2) NOT NULL DEFAULT 0,   -- ingresos_brutos * 0.01
  ir_a_pagar                  NUMERIC(15,2) NOT NULL DEFAULT 0,   -- max(ir_30, pmd)

  -- Acreditaciones
  anticipos_pagados           NUMERIC(15,2) NOT NULL DEFAULT 0,   -- suma de anticipos_ir
  retenciones_recibidas       NUMERIC(15,2) NOT NULL DEFAULT 0,
  ir_neto_pagar               NUMERIC(15,2) NOT NULL DEFAULT 0,   -- ir_a_pagar - acreditaciones

  -- Estado
  estado                      TEXT NOT NULL DEFAULT 'borrador'
                              CHECK (estado IN ('borrador', 'presentada', 'pagada', 'auditada')),
  numero_declaracion          TEXT,     -- número asignado por DGI VET
  notas                       TEXT,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by                  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (empresa_id, anio_fiscal)
);

-- ============================================================
-- TABLA 2: ANTICIPOS MENSUALES IR
-- LCT art. 63-64: 1% ingresos brutos, declarar al día 5
-- ============================================================
CREATE TABLE IF NOT EXISTS anticipos_ir (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            UUID NOT NULL,

  anio                  INT NOT NULL,
  mes                   INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  fecha_vencimiento     DATE NOT NULL,   -- día 5 del mes siguiente

  -- Base de cálculo
  ingresos_brutos_mes   NUMERIC(15,2) NOT NULL DEFAULT 0,
  tasa                  NUMERIC(5,4) NOT NULL DEFAULT 0.01,   -- 1%
  monto_anticipo        NUMERIC(15,2) NOT NULL DEFAULT 0,     -- ingresos * tasa

  -- Retenciones IR recibidas en el mes (acreditable)
  retenciones_recibidas NUMERIC(15,2) NOT NULL DEFAULT 0,
  monto_a_pagar         NUMERIC(15,2) NOT NULL DEFAULT 0,     -- anticipo - retenciones

  -- Pago
  estado                TEXT NOT NULL DEFAULT 'pendiente'
                        CHECK (estado IN ('pendiente', 'declarado', 'pagado', 'exento')),
  fecha_declaracion     DATE,
  fecha_pago            DATE,
  numero_boleta         TEXT,           -- código VET DGI
  asiento_id            UUID REFERENCES asientos_contables(id) ON DELETE SET NULL,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, anio, mes)
);

-- ============================================================
-- TABLA 3: ISC — Impuesto Selectivo al Consumo
-- LCT art. 150+: bebidas, tabaco, combustibles, vehículos
-- ============================================================
CREATE TABLE IF NOT EXISTS declaraciones_isc (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            UUID NOT NULL,

  anio                  INT NOT NULL,
  mes                   INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  semana                INT,            -- grandes contribuyentes: declaración semanal
  fecha_vencimiento     DATE NOT NULL,

  -- Totales del período
  base_imponible        NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_isc             NUMERIC(15,2) NOT NULL DEFAULT 0,

  estado                TEXT NOT NULL DEFAULT 'pendiente'
                        CHECK (estado IN ('pendiente', 'declarado', 'pagado')),
  fecha_declaracion     DATE,
  numero_boleta         TEXT,
  notas                 TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, anio, mes)
);

-- ============================================================
-- TABLA 4: IMI — Impuesto Municipal sobre Ingresos
-- Plan de Arbitrios Municipal: 1% ingresos brutos mensuales
-- ============================================================
CREATE TABLE IF NOT EXISTS declaraciones_imi (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            UUID NOT NULL,

  anio                  INT NOT NULL,
  mes                   INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  fecha_vencimiento     DATE NOT NULL,

  ingresos_brutos_mes   NUMERIC(15,2) NOT NULL DEFAULT 0,
  tasa                  NUMERIC(5,4) NOT NULL DEFAULT 0.01,
  monto_imi             NUMERIC(15,2) NOT NULL DEFAULT 0,

  -- Matrícula anual: 2% sobre promedio mensual del año anterior
  es_matricula          BOOLEAN NOT NULL DEFAULT FALSE,
  monto_matricula       NUMERIC(15,2) DEFAULT 0,

  estado                TEXT NOT NULL DEFAULT 'pendiente'
                        CHECK (estado IN ('pendiente', 'declarado', 'pagado')),
  fecha_pago            DATE,
  numero_recibo         TEXT,           -- recibo de la Alcaldía
  notas                 TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, anio, mes)
);

-- ============================================================
-- TABLA 5: RETENCIONES DEFINITIVAS
-- LCT art. 87: IR capital y ganancias
-- ============================================================
CREATE TABLE IF NOT EXISTS retenciones_definitivas (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            UUID NOT NULL,

  tipo_retencion        TEXT NOT NULL
                        CHECK (tipo_retencion IN (
                          'dividendos',             -- 5-10%
                          'donaciones',             -- 10%
                          'servicios_no_residente', -- 10-20%
                          'premios_loteria',        -- 10%
                          'utilidades_sociedad',    -- 10%
                          'otro'
                        )),
  tasa                  NUMERIC(5,4) NOT NULL,
  base_imponible        NUMERIC(15,2) NOT NULL,
  monto_retenido        NUMERIC(15,2) NOT NULL,

  -- Beneficiario
  nombre_beneficiario   TEXT NOT NULL,
  ruc_beneficiario      TEXT,
  cedula_beneficiario   TEXT,

  fecha_pago            DATE NOT NULL,
  fecha_declaracion     DATE,          -- dentro de 5 días hábiles mes siguiente

  anio                  INT NOT NULL,
  mes                   INT NOT NULL CHECK (mes BETWEEN 1 AND 12),

  -- Referencia
  ref_pago_id           UUID REFERENCES pagos(id) ON DELETE SET NULL,
  asiento_id            UUID REFERENCES asientos_contables(id) ON DELETE SET NULL,

  estado                TEXT NOT NULL DEFAULT 'pendiente'
                        CHECK (estado IN ('pendiente', 'declarada', 'pagada')),
  numero_constancia     TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLA 6: CALENDARIO TRIBUTARIO
-- Obligaciones fijas por empresa y año
-- ============================================================
CREATE TABLE IF NOT EXISTS calendario_tributario (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            UUID NOT NULL,

  anio                  INT NOT NULL,

  -- Tipo de obligación
  tipo_obligacion       TEXT NOT NULL
                        CHECK (tipo_obligacion IN (
                          'iva_mensual',          -- día 15 cada mes
                          'anticipo_ir',          -- día 5 cada mes
                          'inss',                 -- día 17 cada mes
                          'inatec',               -- día 17 cada mes
                          'imi',                  -- mensual (variable)
                          'ir_anual',             -- 28 febrero
                          'matricula_alcaldia',   -- enero
                          'isc',                  -- mensual/semanal
                          'retencion_definitiva', -- 5 días hábiles
                          'otro'
                        )),
  descripcion           TEXT NOT NULL,
  fecha_vencimiento     DATE NOT NULL,
  monto_estimado        NUMERIC(15,2) DEFAULT 0,

  -- Estado
  estado                TEXT NOT NULL DEFAULT 'pendiente'
                        CHECK (estado IN ('pendiente', 'presentado', 'pagado', 'exento', 'vencido')),
  fecha_cumplimiento    DATE,
  alerta_dias_antes     INT NOT NULL DEFAULT 5,  -- alertar X días antes del vencimiento
  alerta_enviada        BOOLEAN NOT NULL DEFAULT FALSE,
  notas                 TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- FUNCIÓN: Generar calendario tributario para un año
-- ============================================================
CREATE OR REPLACE FUNCTION generar_calendario_tributario(
  p_empresa_id UUID,
  p_anio       INT
) RETURNS INT AS $$
DECLARE
  v_mes INT;
  v_count INT := 0;
  v_fecha DATE;
BEGIN
  -- Generar obligaciones mensuales (enero a diciembre)
  FOR v_mes IN 1..12 LOOP

    -- IVA mensual: día 15 del mes siguiente
    v_fecha := make_date(p_anio, v_mes, 1) + INTERVAL '1 month' - INTERVAL '1 day';
    v_fecha := make_date(
      EXTRACT(YEAR  FROM make_date(p_anio, v_mes, 1) + INTERVAL '1 month')::INT,
      EXTRACT(MONTH FROM make_date(p_anio, v_mes, 1) + INTERVAL '1 month')::INT,
      15
    );
    INSERT INTO calendario_tributario (empresa_id, anio, tipo_obligacion, descripcion, fecha_vencimiento)
    VALUES (p_empresa_id, p_anio, 'iva_mensual',
            'Declaración IVA mes ' || v_mes || '/' || p_anio, v_fecha)
    ON CONFLICT DO NOTHING;
    v_count := v_count + 1;

    -- Anticipo IR: día 5 del mes siguiente
    v_fecha := make_date(
      EXTRACT(YEAR  FROM make_date(p_anio, v_mes, 1) + INTERVAL '1 month')::INT,
      EXTRACT(MONTH FROM make_date(p_anio, v_mes, 1) + INTERVAL '1 month')::INT,
      5
    );
    INSERT INTO calendario_tributario (empresa_id, anio, tipo_obligacion, descripcion, fecha_vencimiento)
    VALUES (p_empresa_id, p_anio, 'anticipo_ir',
            'Anticipo IR mes ' || v_mes || '/' || p_anio, v_fecha)
    ON CONFLICT DO NOTHING;
    v_count := v_count + 1;

    -- INSS: día 17 del mes siguiente
    v_fecha := make_date(
      EXTRACT(YEAR  FROM make_date(p_anio, v_mes, 1) + INTERVAL '1 month')::INT,
      EXTRACT(MONTH FROM make_date(p_anio, v_mes, 1) + INTERVAL '1 month')::INT,
      17
    );
    INSERT INTO calendario_tributario (empresa_id, anio, tipo_obligacion, descripcion, fecha_vencimiento)
    VALUES (p_empresa_id, p_anio, 'inss',
            'INSS mes ' || v_mes || '/' || p_anio, v_fecha)
    ON CONFLICT DO NOTHING;
    v_count := v_count + 1;

    -- INATEC: mismo día que INSS
    INSERT INTO calendario_tributario (empresa_id, anio, tipo_obligacion, descripcion, fecha_vencimiento)
    VALUES (p_empresa_id, p_anio, 'inatec',
            'INATEC mes ' || v_mes || '/' || p_anio, v_fecha)
    ON CONFLICT DO NOTHING;
    v_count := v_count + 1;

    -- IMI: día 15 del mes siguiente
    v_fecha := make_date(
      EXTRACT(YEAR  FROM make_date(p_anio, v_mes, 1) + INTERVAL '1 month')::INT,
      EXTRACT(MONTH FROM make_date(p_anio, v_mes, 1) + INTERVAL '1 month')::INT,
      15
    );
    INSERT INTO calendario_tributario (empresa_id, anio, tipo_obligacion, descripcion, fecha_vencimiento)
    VALUES (p_empresa_id, p_anio, 'imi',
            'IMI mes ' || v_mes || '/' || p_anio, v_fecha)
    ON CONFLICT DO NOTHING;
    v_count := v_count + 1;

  END LOOP;

  -- IR Anual: 28 febrero del año siguiente
  INSERT INTO calendario_tributario (empresa_id, anio, tipo_obligacion, descripcion, fecha_vencimiento)
  VALUES (p_empresa_id, p_anio, 'ir_anual',
          'Declaración IR Anual ' || p_anio, make_date(p_anio + 1, 2, 28))
  ON CONFLICT DO NOTHING;
  v_count := v_count + 1;

  -- Matrícula Alcaldía: enero año en curso
  INSERT INTO calendario_tributario (empresa_id, anio, tipo_obligacion, descripcion, fecha_vencimiento)
  VALUES (p_empresa_id, p_anio, 'matricula_alcaldia',
          'Matrícula Alcaldía ' || p_anio, make_date(p_anio, 1, 31))
  ON CONFLICT DO NOTHING;
  v_count := v_count + 1;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE declaraciones_ir_anual  ENABLE ROW LEVEL SECURITY;
ALTER TABLE anticipos_ir            ENABLE ROW LEVEL SECURITY;
ALTER TABLE declaraciones_isc       ENABLE ROW LEVEL SECURITY;
ALTER TABLE declaraciones_imi       ENABLE ROW LEVEL SECURITY;
ALTER TABLE retenciones_definitivas ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendario_tributario   ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "own_empresa" ON declaraciones_ir_anual;
  CREATE POLICY "own_empresa" ON declaraciones_ir_anual
    FOR ALL USING (empresa_id = ANY(get_empresa_ids()));

  DROP POLICY IF EXISTS "own_empresa" ON anticipos_ir;
  CREATE POLICY "own_empresa" ON anticipos_ir
    FOR ALL USING (empresa_id = ANY(get_empresa_ids()));

  DROP POLICY IF EXISTS "own_empresa" ON declaraciones_isc;
  CREATE POLICY "own_empresa" ON declaraciones_isc
    FOR ALL USING (empresa_id = ANY(get_empresa_ids()));

  DROP POLICY IF EXISTS "own_empresa" ON declaraciones_imi;
  CREATE POLICY "own_empresa" ON declaraciones_imi
    FOR ALL USING (empresa_id = ANY(get_empresa_ids()));

  DROP POLICY IF EXISTS "own_empresa" ON retenciones_definitivas;
  CREATE POLICY "own_empresa" ON retenciones_definitivas
    FOR ALL USING (empresa_id = ANY(get_empresa_ids()));

  DROP POLICY IF EXISTS "own_empresa" ON calendario_tributario;
  CREATE POLICY "own_empresa" ON calendario_tributario
    FOR ALL USING (empresa_id = ANY(get_empresa_ids()));
END$$;

-- ============================================================
-- ÍNDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_ir_anual_empresa     ON declaraciones_ir_anual(empresa_id, anio_fiscal);
CREATE INDEX IF NOT EXISTS idx_anticipo_empresa     ON anticipos_ir(empresa_id, anio, mes);
CREATE INDEX IF NOT EXISTS idx_imi_empresa          ON declaraciones_imi(empresa_id, anio, mes);
CREATE INDEX IF NOT EXISTS idx_ret_def_empresa      ON retenciones_definitivas(empresa_id, anio, mes);
CREATE INDEX IF NOT EXISTS idx_calendario_venc      ON calendario_tributario(empresa_id, fecha_vencimiento);
CREATE INDEX IF NOT EXISTS idx_calendario_estado    ON calendario_tributario(estado);
