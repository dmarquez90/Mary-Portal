-- ============================================================
-- Historial de estados financieros guardados
--
-- La tabla legada estados_financieros exige periodo_id (cierre
-- contable) y tiene UNIQUE(periodo_id, tipo); los endpoints de
-- estados financieros guardaban con columnas que no existen
-- (tipo_estado, datos_json, totales...), por lo que "Guardar"
-- fallaba siempre. Esta tabla es el destino real de esos guardados
-- de período libre.
-- ============================================================

CREATE TABLE IF NOT EXISTS estados_financieros_guardados (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       UUID NOT NULL,
  tipo_estado      TEXT NOT NULL CHECK (tipo_estado IN
                     ('balance_general','estado_resultados','flujo_efectivo','cambios_patrimonio')),
  fecha_inicio     DATE NOT NULL,
  fecha_fin        DATE NOT NULL,
  datos_json       JSONB NOT NULL DEFAULT '{}'::JSONB,
  total_activos    NUMERIC(18,2),
  total_pasivos    NUMERIC(18,2),
  total_patrimonio NUMERIC(18,2),
  total_ingresos   NUMERIC(18,2),
  total_gastos     NUMERIC(18,2),
  utilidad_neta    NUMERIC(18,2),
  notas            TEXT,
  generado_por     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_efg_empresa_tipo
  ON estados_financieros_guardados (empresa_id, tipo_estado, fecha_fin DESC);

ALTER TABLE estados_financieros_guardados ENABLE ROW LEVEL SECURITY;

-- Los estados financieros se derivan de los asientos: mismos permisos
-- que el módulo contable (admin, contador, auxiliar).
CREATE POLICY "efg_select" ON estados_financieros_guardados FOR SELECT
  USING (fn_tiene_permiso(auth.uid(), empresa_id, 'asientos_ver'));
CREATE POLICY "efg_insert" ON estados_financieros_guardados FOR INSERT
  WITH CHECK (fn_tiene_permiso(auth.uid(), empresa_id, 'asientos_crear'));
CREATE POLICY "efg_delete" ON estados_financieros_guardados FOR DELETE
  USING (fn_tiene_permiso(auth.uid(), empresa_id, 'asientos_anular'));
