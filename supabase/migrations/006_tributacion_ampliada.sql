-- SARA ERP — Fase 6: Tributación Ampliada
ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS aplica_isc    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS tasa_isc      NUMERIC(5,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS aplica_imi    BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS declaraciones_ir_anual (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id                  UUID NOT NULL,
  anio_fiscal                 INT NOT NULL,
  fecha_inicio_periodo        DATE NOT NULL,
  fecha_fin_periodo           DATE NOT NULL,
  fecha_presentacion          DATE,
  fecha_pago                  DATE,
  renta_bruta_actividades     NUMERIC(15,2) NOT NULL DEFAULT 0,
  otras_rentas_gravables      NUMERIC(15,2) NOT NULL DEFAULT 0,
  costo_ventas                NUMERIC(15,2) NOT NULL DEFAULT 0,
  gastos_administracion       NUMERIC(15,2) NOT NULL DEFAULT 0,
  gastos_ventas               NUMERIC(15,2) NOT NULL DEFAULT 0,
  gastos_financieros          NUMERIC(15,2) NOT NULL DEFAULT 0,
  depreciacion_fiscal         NUMERIC(15,2) NOT NULL DEFAULT 0,
  gastos_nomina               NUMERIC(15,2) NOT NULL DEFAULT 0,
  otros_gastos_deducibles     NUMERIC(15,2) NOT NULL DEFAULT 0,
  ir_30_pct                   NUMERIC(15,2) NOT NULL DEFAULT 0,
  pago_minimo_definitivo      NUMERIC(15,2) NOT NULL DEFAULT 0,
  ir_a_pagar                  NUMERIC(15,2) NOT NULL DEFAULT 0,
  anticipos_pagados           NUMERIC(15,2) NOT NULL DEFAULT 0,
  retenciones_recibidas       NUMERIC(15,2) NOT NULL DEFAULT 0,
  ir_neto_pagar               NUMERIC(15,2) NOT NULL DEFAULT 0,
  estado                      TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','presentada','pagada','auditada')),
  numero_declaracion          TEXT,
  notas                       TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by                  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (empresa_id, anio_fiscal)
);

CREATE TABLE IF NOT EXISTS anticipos_ir (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            UUID NOT NULL,
  anio                  INT NOT NULL,
  mes                   INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  fecha_vencimiento     DATE NOT NULL,
  ingresos_brutos_mes   NUMERIC(15,2) NOT NULL DEFAULT 0,
  tasa                  NUMERIC(5,4) NOT NULL DEFAULT 0.01,
  monto_anticipo        NUMERIC(15,2) NOT NULL DEFAULT 0,
  retenciones_recibidas NUMERIC(15,2) NOT NULL DEFAULT 0,
  monto_a_pagar         NUMERIC(15,2) NOT NULL DEFAULT 0,
  estado                TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','declarado','pagado','exento')),
  fecha_declaracion     DATE,
  fecha_pago            DATE,
  numero_boleta         TEXT,
  asiento_id            UUID REFERENCES asientos_contables(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, anio, mes)
);

CREATE TABLE IF NOT EXISTS declaraciones_isc (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            UUID NOT NULL,
  anio                  INT NOT NULL,
  mes                   INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  semana                INT,
  fecha_vencimiento     DATE NOT NULL,
  base_imponible        NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_isc             NUMERIC(15,2) NOT NULL DEFAULT 0,
  estado                TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','declarado','pagado')),
  fecha_declaracion     DATE,
  numero_boleta         TEXT,
  notas                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, anio, mes)
);

CREATE TABLE IF NOT EXISTS declaraciones_imi (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            UUID NOT NULL,
  anio                  INT NOT NULL,
  mes                   INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  fecha_vencimiento     DATE NOT NULL,
  ingresos_brutos_mes   NUMERIC(15,2) NOT NULL DEFAULT 0,
  tasa                  NUMERIC(5,4) NOT NULL DEFAULT 0.01,
  monto_imi             NUMERIC(15,2) NOT NULL DEFAULT 0,
  es_matricula          BOOLEAN NOT NULL DEFAULT FALSE,
  monto_matricula       NUMERIC(15,2) DEFAULT 0,
  estado                TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','declarado','pagado')),
  fecha_pago            DATE,
  numero_recibo         TEXT,
  notas                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, anio, mes)
);

CREATE TABLE IF NOT EXISTS retenciones_definitivas (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            UUID NOT NULL,
  tipo_retencion        TEXT NOT NULL CHECK (tipo_retencion IN ('dividendos','donaciones','servicios_no_residente','premios_loteria','utilidades_sociedad','otro')),
  tasa                  NUMERIC(5,4) NOT NULL,
  base_imponible        NUMERIC(15,2) NOT NULL,
  monto_retenido        NUMERIC(15,2) NOT NULL,
  nombre_beneficiario   TEXT NOT NULL,
  ruc_beneficiario      TEXT,
  cedula_beneficiario   TEXT,
  fecha_pago            DATE NOT NULL,
  fecha_declaracion     DATE,
  anio                  INT NOT NULL,
  mes                   INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  ref_pago_id           UUID REFERENCES pagos(id) ON DELETE SET NULL,
  asiento_id            UUID REFERENCES asientos_contables(id) ON DELETE SET NULL,
  estado                TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','declarada','pagada')),
  numero_constancia     TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS calendario_tributario (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            UUID NOT NULL,
  anio                  INT NOT NULL,
  tipo_obligacion       TEXT NOT NULL CHECK (tipo_obligacion IN ('iva_mensual','anticipo_ir','inss','inatec','imi','ir_anual','matricula_alcaldia','isc','retencion_definitiva','otro')),
  descripcion           TEXT NOT NULL,
  fecha_vencimiento     DATE NOT NULL,
  monto_estimado        NUMERIC(15,2) DEFAULT 0,
  estado                TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','presentado','pagado','exento','vencido')),
  fecha_cumplimiento    DATE,
  alerta_dias_antes     INT NOT NULL DEFAULT 5,
  alerta_enviada        BOOLEAN NOT NULL DEFAULT FALSE,
  notas                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE declaraciones_ir_anual  ENABLE ROW LEVEL SECURITY;
ALTER TABLE anticipos_ir            ENABLE ROW LEVEL SECURITY;
ALTER TABLE declaraciones_isc       ENABLE ROW LEVEL SECURITY;
ALTER TABLE declaraciones_imi       ENABLE ROW LEVEL SECURITY;
ALTER TABLE retenciones_definitivas ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendario_tributario   ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "own_empresa" ON declaraciones_ir_anual;
  CREATE POLICY "own_empresa" ON declaraciones_ir_anual FOR ALL USING (empresa_id = ANY(get_empresa_ids()));
  DROP POLICY IF EXISTS "own_empresa" ON anticipos_ir;
  CREATE POLICY "own_empresa" ON anticipos_ir FOR ALL USING (empresa_id = ANY(get_empresa_ids()));
  DROP POLICY IF EXISTS "own_empresa" ON declaraciones_isc;
  CREATE POLICY "own_empresa" ON declaraciones_isc FOR ALL USING (empresa_id = ANY(get_empresa_ids()));
  DROP POLICY IF EXISTS "own_empresa" ON declaraciones_imi;
  CREATE POLICY "own_empresa" ON declaraciones_imi FOR ALL USING (empresa_id = ANY(get_empresa_ids()));
  DROP POLICY IF EXISTS "own_empresa" ON retenciones_definitivas;
  CREATE POLICY "own_empresa" ON retenciones_definitivas FOR ALL USING (empresa_id = ANY(get_empresa_ids()));
  DROP POLICY IF EXISTS "own_empresa" ON calendario_tributario;
  CREATE POLICY "own_empresa" ON calendario_tributario FOR ALL USING (empresa_id = ANY(get_empresa_ids()));
END$$;

CREATE INDEX IF NOT EXISTS idx_ir_anual_empresa  ON declaraciones_ir_anual(empresa_id, anio_fiscal);
CREATE INDEX IF NOT EXISTS idx_anticipo_empresa  ON anticipos_ir(empresa_id, anio, mes);
CREATE INDEX IF NOT EXISTS idx_imi_empresa       ON declaraciones_imi(empresa_id, anio, mes);
CREATE INDEX IF NOT EXISTS idx_ret_def_empresa   ON retenciones_definitivas(empresa_id, anio, mes);
CREATE INDEX IF NOT EXISTS idx_calendario_venc   ON calendario_tributario(empresa_id, fecha_vencimiento);
CREATE INDEX IF NOT EXISTS idx_calendario_estado ON calendario_tributario(estado);

CREATE OR REPLACE FUNCTION generar_calendario_tributario(p_empresa_id UUID, p_anio INT)
RETURNS INT AS $$
DECLARE v_mes INT; v_count INT := 0; v_fecha DATE; v_anio_sig INT; v_mes_sig INT;
BEGIN
  FOR v_mes IN 1..12 LOOP
    v_mes_sig := CASE WHEN v_mes = 12 THEN 1 ELSE v_mes + 1 END;
    v_anio_sig := CASE WHEN v_mes = 12 THEN p_anio + 1 ELSE p_anio END;
    INSERT INTO calendario_tributario (empresa_id,anio,tipo_obligacion,descripcion,fecha_vencimiento)
    VALUES (p_empresa_id,p_anio,'iva_mensual','IVA mes '||v_mes||'/'||p_anio, make_date(v_anio_sig,v_mes_sig,15)) ON CONFLICT DO NOTHING;
    INSERT INTO calendario_tributario (empresa_id,anio,tipo_obligacion,descripcion,fecha_vencimiento)
    VALUES (p_empresa_id,p_anio,'anticipo_ir','Anticipo IR mes '||v_mes||'/'||p_anio, make_date(v_anio_sig,v_mes_sig,5)) ON CONFLICT DO NOTHING;
    INSERT INTO calendario_tributario (empresa_id,anio,tipo_obligacion,descripcion,fecha_vencimiento)
    VALUES (p_empresa_id,p_anio,'inss','INSS mes '||v_mes||'/'||p_anio, make_date(v_anio_sig,v_mes_sig,17)) ON CONFLICT DO NOTHING;
    INSERT INTO calendario_tributario (empresa_id,anio,tipo_obligacion,descripcion,fecha_vencimiento)
    VALUES (p_empresa_id,p_anio,'inatec','INATEC mes '||v_mes||'/'||p_anio, make_date(v_anio_sig,v_mes_sig,17)) ON CONFLICT DO NOTHING;
    INSERT INTO calendario_tributario (empresa_id,anio,tipo_obligacion,descripcion,fecha_vencimiento)
    VALUES (p_empresa_id,p_anio,'imi','IMI mes '||v_mes||'/'||p_anio, make_date(v_anio_sig,v_mes_sig,15)) ON CONFLICT DO NOTHING;
    v_count := v_count + 5;
  END LOOP;
  INSERT INTO calendario_tributario (empresa_id,anio,tipo_obligacion,descripcion,fecha_vencimiento)
  VALUES (p_empresa_id,p_anio,'ir_anual','IR Anual '||p_anio, make_date(p_anio+1,2,28)) ON CONFLICT DO NOTHING;
  INSERT INTO calendario_tributario (empresa_id,anio,tipo_obligacion,descripcion,fecha_vencimiento)
  VALUES (p_empresa_id,p_anio,'matricula_alcaldia','Matrícula Alcaldía '||p_anio, make_date(p_anio,1,31)) ON CONFLICT DO NOTHING;
  RETURN v_count + 2;
END;
$$ LANGUAGE plpgsql;