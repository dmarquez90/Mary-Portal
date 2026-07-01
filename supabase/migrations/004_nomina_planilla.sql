-- ============================================================
-- SARA ERP — Fase 4: Nómina y Planilla
-- Ley 539 INSS · LCT art. 23 · Código del Trabajo Nicaragua
-- ============================================================

CREATE TABLE IF NOT EXISTS cargos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   UUID NOT NULL,
  nombre       TEXT NOT NULL,
  descripcion  TEXT,
  departamento TEXT,
  activo       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, nombre)
);

CREATE TABLE IF NOT EXISTS empleados (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            UUID NOT NULL,
  cargo_id              UUID REFERENCES cargos(id) ON DELETE SET NULL,
  primer_nombre         TEXT NOT NULL,
  segundo_nombre        TEXT,
  primer_apellido       TEXT NOT NULL,
  segundo_apellido      TEXT,
  cedula                TEXT,
  fecha_nacimiento      DATE,
  sexo                  TEXT CHECK (sexo IN ('M', 'F')),
  direccion             TEXT,
  telefono              TEXT,
  correo                TEXT,
  fecha_ingreso         DATE NOT NULL,
  fecha_egreso          DATE,
  salario_base          NUMERIC(15,2) NOT NULL DEFAULT 0,
  tipo_pago             TEXT NOT NULL DEFAULT 'mensual'
                        CHECK (tipo_pago IN ('mensual', 'quincenal', 'semanal')),
  departamento          TEXT,
  numero_inss           TEXT,
  regimen_inss          TEXT NOT NULL DEFAULT 'integral'
                        CHECK (regimen_inss IN ('integral', 'ivm_rp', 'facultativo')),
  estado                TEXT NOT NULL DEFAULT 'activo'
                        CHECK (estado IN ('activo', 'inactivo', 'suspendido', 'retirado')),
  tipo_contrato         TEXT NOT NULL DEFAULT 'tiempo_indeterminado'
                        CHECK (tipo_contrato IN (
                          'tiempo_indeterminado',
                          'tiempo_determinado',
                          'obra_determinada',
                          'servicios_profesionales'
                        )),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS planillas (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id               UUID NOT NULL,
  periodo_mes              INT NOT NULL CHECK (periodo_mes BETWEEN 1 AND 12),
  periodo_anio             INT NOT NULL CHECK (periodo_anio >= 2020),
  fecha_pago               DATE,
  estado                   TEXT NOT NULL DEFAULT 'borrador'
                           CHECK (estado IN ('borrador', 'calculada', 'aprobada', 'pagada', 'declarada')),
  total_salarios_brutos    NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_inss_laboral       NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_inss_patronal      NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_inatec             NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_ir_laboral         NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_otros_descuentos   NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_neto_pagar         NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_prov_vacaciones    NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_prov_aguinaldo     NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_prov_indemnizacion NUMERIC(15,2) NOT NULL DEFAULT 0,
  asiento_id               UUID,
  notas                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, periodo_mes, periodo_anio)
);

CREATE TABLE IF NOT EXISTS planilla_detalle (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  planilla_id         UUID NOT NULL REFERENCES planillas(id) ON DELETE CASCADE,
  empleado_id         UUID NOT NULL REFERENCES empleados(id) ON DELETE RESTRICT,
  empresa_id          UUID NOT NULL,
  salario_base        NUMERIC(15,2) NOT NULL DEFAULT 0,
  dias_trabajados     INT NOT NULL DEFAULT 30,
  horas_extra         NUMERIC(8,2) NOT NULL DEFAULT 0,
  valor_horas_extra   NUMERIC(15,2) NOT NULL DEFAULT 0,
  comisiones          NUMERIC(15,2) NOT NULL DEFAULT 0,
  bonificaciones      NUMERIC(15,2) NOT NULL DEFAULT 0,
  otros_ingresos      NUMERIC(15,2) NOT NULL DEFAULT 0,
  salario_bruto       NUMERIC(15,2) NOT NULL DEFAULT 0,
  inss_laboral        NUMERIC(15,2) NOT NULL DEFAULT 0,
  inss_patronal       NUMERIC(15,2) NOT NULL DEFAULT 0,
  inatec              NUMERIC(15,2) NOT NULL DEFAULT 0,
  ir_laboral          NUMERIC(15,2) NOT NULL DEFAULT 0,
  adelantos           NUMERIC(15,2) NOT NULL DEFAULT 0,
  prestamos_inss      NUMERIC(15,2) NOT NULL DEFAULT 0,
  otros_descuentos    NUMERIC(15,2) NOT NULL DEFAULT 0,
  descripcion_otros   TEXT,
  total_deducciones   NUMERIC(15,2) NOT NULL DEFAULT 0,
  neto_pagar          NUMERIC(15,2) NOT NULL DEFAULT 0,
  prov_vacaciones     NUMERIC(15,2) NOT NULL DEFAULT 0,
  prov_aguinaldo      NUMERIC(15,2) NOT NULL DEFAULT 0,
  prov_indemnizacion  NUMERIC(15,2) NOT NULL DEFAULT 0,
  base_anual_ir       NUMERIC(15,2) NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (planilla_id, empleado_id)
);

CREATE TABLE IF NOT EXISTS ir_laboral_acumulado (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       UUID NOT NULL,
  empleado_id      UUID NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
  anio_fiscal      INT NOT NULL,
  mes              INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  salario_bruto    NUMERIC(15,2) NOT NULL DEFAULT 0,
  inss_laboral     NUMERIC(15,2) NOT NULL DEFAULT 0,
  renta_gravable   NUMERIC(15,2) NOT NULL DEFAULT 0,
  ir_retenido      NUMERIC(15,2) NOT NULL DEFAULT 0,
  acum_anual_bruto NUMERIC(15,2) NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, empleado_id, anio_fiscal, mes)
);

CREATE TABLE IF NOT EXISTS prestaciones_sociales (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id              UUID NOT NULL,
  empleado_id             UUID NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
  acum_vacaciones         NUMERIC(15,2) NOT NULL DEFAULT 0,
  acum_aguinaldo          NUMERIC(15,2) NOT NULL DEFAULT 0,
  acum_indemnizacion      NUMERIC(15,2) NOT NULL DEFAULT 0,
  dias_vacaciones_acum    NUMERIC(8,2) NOT NULL DEFAULT 0,
  dias_vacaciones_gozadas NUMERIC(8,2) NOT NULL DEFAULT 0,
  ultimo_periodo_mes      INT,
  ultimo_periodo_anio     INT,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, empleado_id)
);

CREATE TABLE IF NOT EXISTS liquidaciones (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id             UUID NOT NULL,
  empleado_id            UUID NOT NULL REFERENCES empleados(id) ON DELETE RESTRICT,
  fecha_liquidacion      DATE NOT NULL,
  motivo_retiro          TEXT NOT NULL
                         CHECK (motivo_retiro IN (
                           'renuncia_voluntaria','despido_justificado','despido_injustificado',
                           'mutuo_acuerdo','fin_contrato','fallecimiento'
                         )),
  salario_pendiente      NUMERIC(15,2) NOT NULL DEFAULT 0,
  vacaciones_pendientes  NUMERIC(15,2) NOT NULL DEFAULT 0,
  aguinaldo_proporcional NUMERIC(15,2) NOT NULL DEFAULT 0,
  indemnizacion          NUMERIC(15,2) NOT NULL DEFAULT 0,
  otros_beneficios       NUMERIC(15,2) NOT NULL DEFAULT 0,
  deducciones            NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_liquidacion      NUMERIC(15,2) NOT NULL DEFAULT 0,
  estado                 TEXT NOT NULL DEFAULT 'borrador'
                         CHECK (estado IN ('borrador', 'aprobada', 'pagada')),
  asiento_id             UUID,
  notas                  TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS historial_salarial (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       UUID NOT NULL,
  empleado_id      UUID NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
  fecha_cambio     DATE NOT NULL,
  salario_anterior NUMERIC(15,2) NOT NULL DEFAULT 0,
  salario_nuevo    NUMERIC(15,2) NOT NULL DEFAULT 0,
  motivo           TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_empleados_empresa') THEN
    CREATE INDEX idx_empleados_empresa ON empleados(empresa_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_empleados_estado') THEN
    CREATE INDEX idx_empleados_estado ON empleados(empresa_id, estado);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_planillas_empresa') THEN
    CREATE INDEX idx_planillas_empresa ON planillas(empresa_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_planillas_periodo') THEN
    CREATE INDEX idx_planillas_periodo ON planillas(empresa_id, periodo_anio, periodo_mes);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_planilla_det_planilla') THEN
    CREATE INDEX idx_planilla_det_planilla ON planilla_detalle(planilla_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_planilla_det_empleado') THEN
    CREATE INDEX idx_planilla_det_empleado ON planilla_detalle(empleado_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_ir_acum_empleado') THEN
    CREATE INDEX idx_ir_acum_empleado ON ir_laboral_acumulado(empresa_id, empleado_id, anio_fiscal);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_prestaciones_empleado') THEN
    CREATE INDEX idx_prestaciones_empleado ON prestaciones_sociales(empresa_id, empleado_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_cargos_empresa') THEN
    CREATE INDEX idx_cargos_empresa ON cargos(empresa_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_liquidaciones_empleado') THEN
    CREATE INDEX idx_liquidaciones_empleado ON liquidaciones(empresa_id, empleado_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_historial_sal_empleado') THEN
    CREATE INDEX idx_historial_sal_empleado ON historial_salarial(empresa_id, empleado_id);
  END IF;
END$$;

-- RLS
ALTER TABLE cargos                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE empleados              ENABLE ROW LEVEL SECURITY;
ALTER TABLE planillas              ENABLE ROW LEVEL SECURITY;
ALTER TABLE planilla_detalle       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ir_laboral_acumulado   ENABLE ROW LEVEL SECURITY;
ALTER TABLE prestaciones_sociales  ENABLE ROW LEVEL SECURITY;
ALTER TABLE liquidaciones          ENABLE ROW LEVEL SECURITY;
ALTER TABLE historial_salarial     ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "own_empresa" ON cargos;
  CREATE POLICY "own_empresa" ON cargos FOR ALL USING (empresa_id = ANY(get_empresa_ids()));

  DROP POLICY IF EXISTS "own_empresa" ON empleados;
  CREATE POLICY "own_empresa" ON empleados FOR ALL USING (empresa_id = ANY(get_empresa_ids()));

  DROP POLICY IF EXISTS "own_empresa" ON planillas;
  CREATE POLICY "own_empresa" ON planillas FOR ALL USING (empresa_id = ANY(get_empresa_ids()));

  DROP POLICY IF EXISTS "own_empresa" ON planilla_detalle;
  CREATE POLICY "own_empresa" ON planilla_detalle FOR ALL USING (empresa_id = ANY(get_empresa_ids()));

  DROP POLICY IF EXISTS "own_empresa" ON ir_laboral_acumulado;
  CREATE POLICY "own_empresa" ON ir_laboral_acumulado FOR ALL USING (empresa_id = ANY(get_empresa_ids()));

  DROP POLICY IF EXISTS "own_empresa" ON prestaciones_sociales;
  CREATE POLICY "own_empresa" ON prestaciones_sociales FOR ALL USING (empresa_id = ANY(get_empresa_ids()));

  DROP POLICY IF EXISTS "own_empresa" ON liquidaciones;
  CREATE POLICY "own_empresa" ON liquidaciones FOR ALL USING (empresa_id = ANY(get_empresa_ids()));

  DROP POLICY IF EXISTS "own_empresa" ON historial_salarial;
  CREATE POLICY "own_empresa" ON historial_salarial FOR ALL USING (empresa_id = ANY(get_empresa_ids()));
END$$;