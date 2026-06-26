-- ============================================================
-- SARA ERP — Fase 5: Activos Fijos y Depreciación
-- Ley 822 LCT Art. 45 — Tasas de depreciación fiscal Nicaragua
-- ============================================================

-- ============================================================
-- TABLA 1: ACTIVOS FIJOS
-- ============================================================
CREATE TABLE IF NOT EXISTS activos_fijos (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            UUID NOT NULL,

  -- Identificación
  codigo                TEXT NOT NULL,
  nombre                TEXT NOT NULL,
  descripcion           TEXT,

  -- Clasificación LCT Art. 45
  categoria             TEXT NOT NULL
                        CHECK (categoria IN (
                          'edificio',           -- 5%  anual (20 años)
                          'equipo_produccion',  -- 20% anual (5 años)
                          'vehiculo',           -- 20% anual (5 años)
                          'mobiliario',         -- 20% anual (5 años)
                          'equipo_tic',         -- 50% anual (2 años)
                          'otro'                -- 10-20% según reglamento
                        )),
  tasa_depreciacion_anual NUMERIC(5,4) NOT NULL,  -- Ej: 0.20 = 20%

  -- Valores
  costo_adquisicion     NUMERIC(15,2) NOT NULL,
  valor_residual        NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_en_libros       NUMERIC(15,2) NOT NULL,  -- se actualiza con cada dep.

  -- Fechas
  fecha_adquisicion     DATE NOT NULL,
  fecha_inicio_dep      DATE NOT NULL,            -- cuando inicia a depreciar
  vida_util_anios       NUMERIC(5,2) NOT NULL,    -- vida útil fiscal
  vida_util_meses       INT NOT NULL,             -- calculado: vida_util_anios * 12

  -- Método
  metodo_depreciacion   TEXT NOT NULL DEFAULT 'linea_recta'
                        CHECK (metodo_depreciacion IN ('linea_recta')),

  -- Proveedor / compra
  proveedor_id          UUID REFERENCES proveedores(id) ON DELETE SET NULL,
  ref_compra_id         UUID REFERENCES compras(id) ON DELETE SET NULL,
  numero_factura_compra TEXT,
  ubicacion             TEXT,

  -- Cuentas contables
  cuenta_activo_id      UUID REFERENCES plan_cuentas(id) ON DELETE SET NULL,
  cuenta_dep_acum_id    UUID REFERENCES plan_cuentas(id) ON DELETE SET NULL,
  cuenta_gasto_dep_id   UUID REFERENCES plan_cuentas(id) ON DELETE SET NULL,

  -- Estado
  estado                TEXT NOT NULL DEFAULT 'activo'
                        CHECK (estado IN ('activo', 'depreciado', 'vendido', 'dado_de_baja')),
  fecha_baja            DATE,
  motivo_baja           TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, codigo)
);

-- ============================================================
-- TABLA 2: DEPRECIACIONES MENSUALES
-- Cada fila = cuota mensual de un activo en un período
-- ============================================================
CREATE TABLE IF NOT EXISTS depreciaciones (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID NOT NULL,
  activo_id           UUID NOT NULL REFERENCES activos_fijos(id) ON DELETE CASCADE,
  periodo_id          UUID REFERENCES periodos_contables(id) ON DELETE SET NULL,
  asiento_id          UUID REFERENCES asientos_contables(id) ON DELETE SET NULL,

  -- Período
  anio                INT NOT NULL,
  mes                 INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  fecha_dep           DATE NOT NULL,

  -- Montos
  cuota_mensual       NUMERIC(15,2) NOT NULL,    -- costo-residual / vida_util_meses
  dep_acumulada_ant   NUMERIC(15,2) NOT NULL DEFAULT 0,  -- antes de esta cuota
  dep_acumulada_post  NUMERIC(15,2) NOT NULL DEFAULT 0,  -- después de esta cuota
  valor_en_libros     NUMERIC(15,2) NOT NULL,            -- después de esta cuota

  estado              TEXT NOT NULL DEFAULT 'calculada'
                      CHECK (estado IN ('calculada', 'contabilizada', 'anulada')),

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (activo_id, anio, mes)
);

-- ============================================================
-- TABLA 3: ACTIVOS INTANGIBLES (LCT Art. 45 lit. 6-8)
-- Patentes, marcas, gastos organización y preoperativos
-- Amortizables en 3 años (33.33% anual)
-- ============================================================
CREATE TABLE IF NOT EXISTS activos_intangibles (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id              UUID NOT NULL,

  codigo                  TEXT NOT NULL,
  nombre                  TEXT NOT NULL,
  descripcion             TEXT,

  tipo                    TEXT NOT NULL
                          CHECK (tipo IN (
                            'patente',
                            'marca',
                            'gastos_organizacion',
                            'gastos_preoperativos',
                            'licencia_software',
                            'otro'
                          )),

  costo_adquisicion       NUMERIC(15,2) NOT NULL,
  valor_en_libros         NUMERIC(15,2) NOT NULL,

  fecha_adquisicion       DATE NOT NULL,
  fecha_inicio_amort      DATE NOT NULL,
  vida_util_anios         NUMERIC(5,2) NOT NULL DEFAULT 3,   -- LCT: 3 años
  vida_util_meses         INT NOT NULL DEFAULT 36,

  tasa_amortizacion_anual NUMERIC(5,4) NOT NULL DEFAULT 0.3333,

  cuenta_activo_id        UUID REFERENCES plan_cuentas(id) ON DELETE SET NULL,
  cuenta_amort_acum_id    UUID REFERENCES plan_cuentas(id) ON DELETE SET NULL,
  cuenta_gasto_amort_id   UUID REFERENCES plan_cuentas(id) ON DELETE SET NULL,

  estado                  TEXT NOT NULL DEFAULT 'activo'
                          CHECK (estado IN ('activo', 'amortizado', 'dado_de_baja')),

  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, codigo)
);

-- ============================================================
-- TABLA 4: AMORTIZACIONES DE INTANGIBLES
-- ============================================================
CREATE TABLE IF NOT EXISTS amortizaciones (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            UUID NOT NULL,
  intangible_id         UUID NOT NULL REFERENCES activos_intangibles(id) ON DELETE CASCADE,
  periodo_id            UUID REFERENCES periodos_contables(id) ON DELETE SET NULL,
  asiento_id            UUID REFERENCES asientos_contables(id) ON DELETE SET NULL,

  anio                  INT NOT NULL,
  mes                   INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  fecha_amort           DATE NOT NULL,

  cuota_mensual         NUMERIC(15,2) NOT NULL,
  amort_acumulada_ant   NUMERIC(15,2) NOT NULL DEFAULT 0,
  amort_acumulada_post  NUMERIC(15,2) NOT NULL DEFAULT 0,
  valor_en_libros       NUMERIC(15,2) NOT NULL,

  estado                TEXT NOT NULL DEFAULT 'calculada'
                        CHECK (estado IN ('calculada', 'contabilizada', 'anulada')),

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (intangible_id, anio, mes)
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE activos_fijos        ENABLE ROW LEVEL SECURITY;
ALTER TABLE depreciaciones        ENABLE ROW LEVEL SECURITY;
ALTER TABLE activos_intangibles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE amortizaciones        ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "own_empresa" ON activos_fijos;
  CREATE POLICY "own_empresa" ON activos_fijos
    FOR ALL USING (empresa_id = ANY(get_empresa_ids()));

  DROP POLICY IF EXISTS "own_empresa" ON depreciaciones;
  CREATE POLICY "own_empresa" ON depreciaciones
    FOR ALL USING (empresa_id = ANY(get_empresa_ids()));

  DROP POLICY IF EXISTS "own_empresa" ON activos_intangibles;
  CREATE POLICY "own_empresa" ON activos_intangibles
    FOR ALL USING (empresa_id = ANY(get_empresa_ids()));

  DROP POLICY IF EXISTS "own_empresa" ON amortizaciones;
  CREATE POLICY "own_empresa" ON amortizaciones
    FOR ALL USING (empresa_id = ANY(get_empresa_ids()));
END$$;

-- ============================================================
-- ÍNDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_activos_empresa  ON activos_fijos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_activos_estado   ON activos_fijos(estado);
CREATE INDEX IF NOT EXISTS idx_dep_activo       ON depreciaciones(activo_id);
CREATE INDEX IF NOT EXISTS idx_dep_periodo      ON depreciaciones(anio, mes);
CREATE INDEX IF NOT EXISTS idx_intang_empresa   ON activos_intangibles(empresa_id);
CREATE INDEX IF NOT EXISTS idx_amort_intangible ON amortizaciones(intangible_id);

-- ============================================================
-- FUNCIÓN: Calcular cuota mensual de depreciación línea recta
-- ============================================================
CREATE OR REPLACE FUNCTION calcular_cuota_depreciacion(
  p_costo          NUMERIC,
  p_residual       NUMERIC,
  p_vida_meses     INT
) RETURNS NUMERIC AS $$
  SELECT ROUND((p_costo - p_residual) / NULLIF(p_vida_meses, 0), 2);
$$ LANGUAGE sql IMMUTABLE;

-- ============================================================
-- FUNCIÓN: Tasa estándar LCT Art. 45 según categoría
-- ============================================================
CREATE OR REPLACE FUNCTION tasa_depreciacion_lct(p_categoria TEXT)
RETURNS NUMERIC AS $$
  SELECT CASE p_categoria
    WHEN 'edificio'          THEN 0.05
    WHEN 'equipo_produccion' THEN 0.20
    WHEN 'vehiculo'          THEN 0.20
    WHEN 'mobiliario'        THEN 0.20
    WHEN 'equipo_tic'        THEN 0.50
    ELSE                          0.10  -- mínimo para 'otro'
  END;
$$ LANGUAGE sql IMMUTABLE;
