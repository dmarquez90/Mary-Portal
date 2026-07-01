-- ============================================================
-- SARA - Fase 3: Estados Financieros
-- Ley 822 LCT (Ley de Concertación Tributaria) Nicaragua
-- NIIF PYMES - Secciones 3, 4, 5, 6, 7
-- ============================================================

-- ──────────────────────────────────────────────────────────
-- 1. CONFIGURACIÓN DE ESTADOS FINANCIEROS
--    Define parámetros y mapeo de cuentas por empresa
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS configuracion_estados_financieros (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  -- Cuentas clave para flujo de efectivo (método indirecto)
  cuenta_utilidad_neta        VARCHAR(20), -- cuenta resultado del ejercicio
  cuenta_depreciacion         VARCHAR(20), -- cuenta depreciación acumulada
  cuenta_amortizacion         VARCHAR(20), -- cuenta amortización
  cuenta_cuentas_cobrar       VARCHAR(20), -- cuenta clientes/cxc
  cuenta_inventarios          VARCHAR(20), -- cuenta inventarios
  cuenta_cuentas_pagar        VARCHAR(20), -- cuenta proveedores/cxp
  cuenta_impuestos_pagar      VARCHAR(20), -- IVA/IR por pagar
  cuenta_caja_bancos          VARCHAR(20), -- efectivo y equiv.
  -- Periodo fiscal (Nicaragua: enero-diciembre o julio-junio)
  mes_inicio_fiscal           INTEGER DEFAULT 1,  -- 1=enero, 7=julio
  -- Configuración de presentación
  moneda                      VARCHAR(10) DEFAULT 'C$', -- Córdoba nicaragüense
  mostrar_comparativo         BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(empresa_id)
);

-- ──────────────────────────────────────────────────────────
-- 2. PERIODOS CONTABLES
--    Control de cierre mensual/anual (art. 52 Reglamento LCT)
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS periodos_contables (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nombre          VARCHAR(50) NOT NULL,    -- "Enero 2024", "Período Fiscal 2023"
  tipo            VARCHAR(20) NOT NULL CHECK (tipo IN ('mensual','trimestral','anual')),
  fecha_inicio    DATE NOT NULL,
  fecha_fin       DATE NOT NULL,
  estado          VARCHAR(20) DEFAULT 'abierto' CHECK (estado IN ('abierto','cerrado','bloqueado')),
  cerrado_por     UUID REFERENCES auth.users(id),
  fecha_cierre    TIMESTAMPTZ,
  notas           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────
-- 3. ESTADOS FINANCIEROS GENERADOS
--    Snapshots de estados en cada periodo
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS estados_financieros (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  periodo_id      UUID REFERENCES periodos_contables(id),
  tipo_estado     VARCHAR(30) NOT NULL CHECK (tipo_estado IN (
                    'estado_resultados',
                    'balance_general',
                    'flujo_efectivo',
                    'cambios_patrimonio'
                  )),
  fecha_inicio    DATE NOT NULL,
  fecha_fin       DATE NOT NULL,
  -- Datos del estado en JSON (estructura jerárquica)
  datos_json      JSONB NOT NULL DEFAULT '{}',
  -- Totales clave para búsqueda rápida
  total_ingresos          DECIMAL(18,2) DEFAULT 0,
  total_gastos            DECIMAL(18,2) DEFAULT 0,
  utilidad_neta           DECIMAL(18,2) DEFAULT 0,
  total_activos           DECIMAL(18,2) DEFAULT 0,
  total_pasivos           DECIMAL(18,2) DEFAULT 0,
  total_patrimonio        DECIMAL(18,2) DEFAULT 0,
  -- Metadatos
  generado_por    UUID REFERENCES auth.users(id),
  generado_en     TIMESTAMPTZ DEFAULT NOW(),
  notas           TEXT,
  estado          VARCHAR(20) DEFAULT 'borrador' CHECK (estado IN ('borrador','aprobado','auditado')),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────
-- 4. NOTAS A LOS ESTADOS FINANCIEROS
--    NIIF PYMES Sección 8 - Revelaciones requeridas
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notas_estados_financieros (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  estado_id       UUID REFERENCES estados_financieros(id) ON DELETE CASCADE,
  numero_nota     INTEGER NOT NULL,
  titulo          VARCHAR(200) NOT NULL,
  contenido       TEXT NOT NULL,
  tipo_nota       VARCHAR(50) DEFAULT 'informativa' CHECK (tipo_nota IN (
                    'politica_contable',
                    'informativa',
                    'contingencia',
                    'evento_posterior',
                    'segmento'
                  )),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ──────────────────────────────────────────────────────────
-- 5. ÍNDICES PARA RENDIMIENTO
-- ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_periodos_empresa_fecha
  ON periodos_contables(empresa_id, fecha_inicio, fecha_fin);

CREATE INDEX IF NOT EXISTS idx_estados_financieros_empresa_tipo
  ON estados_financieros(empresa_id, tipo_estado, fecha_fin);

CREATE INDEX IF NOT EXISTS idx_estados_financieros_periodo
  ON estados_financieros(periodo_id);

CREATE INDEX IF NOT EXISTS idx_notas_estado
  ON notas_estados_financieros(estado_id, numero_nota);

-- ──────────────────────────────────────────────────────────
-- 6. ROW LEVEL SECURITY
-- ──────────────────────────────────────────────────────────
ALTER TABLE configuracion_estados_financieros ENABLE ROW LEVEL SECURITY;
ALTER TABLE periodos_contables ENABLE ROW LEVEL SECURITY;
ALTER TABLE estados_financieros ENABLE ROW LEVEL SECURITY;
ALTER TABLE notas_estados_financieros ENABLE ROW LEVEL SECURITY;

-- Políticas: usuario solo ve datos de su empresa
CREATE POLICY "tenant_config_ef" ON configuracion_estados_financieros
  USING (empresa_id IN (
    SELECT empresa_id FROM usuarios_empresa WHERE usuario_id = auth.uid()
  ));

CREATE POLICY "tenant_periodos" ON periodos_contables
  USING (empresa_id IN (
    SELECT empresa_id FROM usuarios_empresa WHERE usuario_id = auth.uid()
  ));

CREATE POLICY "tenant_estados_financieros" ON estados_financieros
  USING (empresa_id IN (
    SELECT empresa_id FROM usuarios_empresa WHERE usuario_id = auth.uid()
  ));

CREATE POLICY "tenant_notas_ef" ON notas_estados_financieros
  USING (empresa_id IN (
    SELECT empresa_id FROM usuarios_empresa WHERE usuario_id = auth.uid()
  ));

-- ──────────────────────────────────────────────────────────
-- 7. TRIGGERS UPDATED_AT
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_config_ef_updated_at
  BEFORE UPDATE ON configuracion_estados_financieros
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_periodos_updated_at
  BEFORE UPDATE ON periodos_contables
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_ef_updated_at
  BEFORE UPDATE ON estados_financieros
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_notas_ef_updated_at
  BEFORE UPDATE ON notas_estados_financieros
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ──────────────────────────────────────────────────────────
-- 8. FUNCIÓN: CALCULAR SALDO DE CUENTA EN RANGO DE FECHAS
--    Usada por todos los estados financieros
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_saldo_cuenta(
  p_empresa_id    UUID,
  p_cuenta        VARCHAR,
  p_fecha_inicio  DATE,
  p_fecha_fin     DATE,
  p_acumulado     BOOLEAN DEFAULT FALSE  -- TRUE = desde inicio fiscal
)
RETURNS DECIMAL(18,2) AS $$
DECLARE
  v_saldo DECIMAL(18,2) := 0;
BEGIN
  IF p_acumulado THEN
    -- Saldo acumulado desde inicio del período fiscal
    SELECT COALESCE(SUM(
      CASE
        WHEN debe IS NOT NULL THEN debe
        WHEN haber IS NOT NULL THEN -haber
        ELSE 0
      END
    ), 0) INTO v_saldo
    FROM asientos_contables_detalle acd
    JOIN asientos_contables ac ON ac.id = acd.asiento_id
    WHERE ac.empresa_id = p_empresa_id
      AND acd.cuenta LIKE p_cuenta || '%'
      AND ac.fecha <= p_fecha_fin
      AND ac.estado = 'aprobado';
  ELSE
    SELECT COALESCE(SUM(
      CASE
        WHEN debe IS NOT NULL THEN debe
        WHEN haber IS NOT NULL THEN -haber
        ELSE 0
      END
    ), 0) INTO v_saldo
    FROM asientos_contables_detalle acd
    JOIN asientos_contables ac ON ac.id = acd.asiento_id
    WHERE ac.empresa_id = p_empresa_id
      AND acd.cuenta LIKE p_cuenta || '%'
      AND ac.fecha BETWEEN p_fecha_inicio AND p_fecha_fin
      AND ac.estado = 'aprobado';
  END IF;
  RETURN v_saldo;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ──────────────────────────────────────────────────────────
-- 9. VISTA: RESUMEN DE ESTADOS POR EMPRESA
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW v_resumen_estados_financieros AS
SELECT
  ef.empresa_id,
  e.nombre AS empresa_nombre,
  ef.tipo_estado,
  ef.fecha_inicio,
  ef.fecha_fin,
  ef.total_ingresos,
  ef.total_gastos,
  ef.utilidad_neta,
  ef.total_activos,
  ef.total_pasivos,
  ef.total_patrimonio,
  ef.estado,
  ef.generado_en,
  ef.id AS estado_id
FROM estados_financieros ef
JOIN empresas e ON e.id = ef.empresa_id;

-- ──────────────────────────────────────────────────────────
-- COMENTARIO FINAL
-- Cumplimiento legal:
-- - NIIF PYMES Sección 3: Presentación de Estados Financieros
-- - NIIF PYMES Sección 4: Estado de Situación Financiera
-- - NIIF PYMES Sección 5: Estado de Resultado Integral
-- - NIIF PYMES Sección 6: Estado de Cambios en el Patrimonio
-- - NIIF PYMES Sección 7: Estado de Flujos de Efectivo
-- - LCT Art. 52 Reglamento: Período fiscal Nicaragua
-- - DGI: Requerimientos de presentación anual
-- ──────────────────────────────────────────────────────────
