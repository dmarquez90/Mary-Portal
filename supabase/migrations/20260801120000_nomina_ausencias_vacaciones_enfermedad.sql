-- ============================================================
-- Nómina: bitácora de ausencias — vacaciones y enfermedad
--
-- Hasta ahora 'prestaciones_sociales' solo llevaba dos contadores
-- (dias_vacaciones_acum, dias_vacaciones_gozadas) sin historial de
-- cuándo ni por qué se tomaron, sin distinguir vacación descansada de
-- vacación pagada sin descanso, y sin ningún registro de incapacidades
-- por enfermedad. Esta migración agrega una bitácora completa.
--
-- Tipos:
--  * vacacion_descanso        — CT Art. 76-80: el empleado descansa,
--    resta de dias_vacaciones_acum y suma a dias_vacaciones_gozadas.
--  * vacacion_pagada          — pagar en vez de descansar. La ley exige
--    descanso salvo excepciones (p.ej. liquidación); el sistema lo
--    permite mostrando advertencia en el frontend, no lo bloquea aquí.
--    Resta de dias_vacaciones_acum y suma a dias_vacaciones_pagadas
--    (contador nuevo, separado de "gozadas" porque no hubo descanso).
--  * incapacidad_enfermedad   — Reglamento Ley 539: el INSS subsidia
--    el 60% del salario promedio desde el 4to día de incapacidad; los
--    primeros 3 días quedan a la política de cada empresa (por defecto
--    0 — no hay obligación legal única y clara de pagarlos). No toca
--    los acumulados de prestaciones: el efecto en vacaciones/aguinaldo/
--    indemnización ya ocurre solo al bajar 'dias_trabajados' en la
--    planilla del mes (ver calcularEmpleadoPlanilla).
-- ============================================================

CREATE TABLE IF NOT EXISTS nomina_ausencias (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id             UUID NOT NULL,
  empleado_id            UUID NOT NULL REFERENCES empleados(id) ON DELETE RESTRICT,
  tipo                   TEXT NOT NULL CHECK (tipo IN (
                           'vacacion_descanso', 'vacacion_pagada', 'incapacidad_enfermedad'
                         )),
  fecha_inicio           DATE NOT NULL,
  fecha_fin              DATE NOT NULL CHECK (fecha_fin >= fecha_inicio),
  dias                   NUMERIC(6,2) NOT NULL CHECK (dias > 0),
  salario_dia            NUMERIC(15,2) NOT NULL DEFAULT 0, -- snapshot: salario_base/30 al momento del registro
  monto                  NUMERIC(15,2) NOT NULL DEFAULT 0, -- dias * salario_dia (vacaciones) o valor de referencia
  dias_cubiertos_empresa NUMERIC(6,2) NOT NULL DEFAULT 0,  -- solo incapacidad_enfermedad
  subsidio_inss          NUMERIC(15,2) NOT NULL DEFAULT 0, -- solo incapacidad_enfermedad
  certificado_numero     TEXT,                              -- reposo/constancia INSS, si aplica
  estado                 TEXT NOT NULL DEFAULT 'registrado'
                         CHECK (estado IN ('registrado', 'pagado', 'anulado')),
  planilla_id            UUID REFERENCES planillas(id) ON DELETE SET NULL,
  notas                  TEXT,
  creado_por             UUID,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nomina_ausencias_empleado
  ON nomina_ausencias(empleado_id, fecha_inicio);
CREATE INDEX IF NOT EXISTS idx_nomina_ausencias_empresa_tipo
  ON nomina_ausencias(empresa_id, tipo, fecha_inicio);

ALTER TABLE nomina_ausencias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nomina_select" ON nomina_ausencias FOR SELECT
  USING (fn_tiene_permiso(auth.uid(), empresa_id, 'nomina_ver'));
CREATE POLICY "nomina_insert" ON nomina_ausencias FOR INSERT
  WITH CHECK (fn_tiene_permiso(auth.uid(), empresa_id, 'nomina_editar'));
CREATE POLICY "nomina_update" ON nomina_ausencias FOR UPDATE
  USING (fn_tiene_permiso(auth.uid(), empresa_id, 'nomina_editar'))
  WITH CHECK (fn_tiene_permiso(auth.uid(), empresa_id, 'nomina_editar'));
CREATE POLICY "nomina_delete" ON nomina_ausencias FOR DELETE
  USING (fn_tiene_permiso(auth.uid(), empresa_id, 'nomina_editar'));

-- Contador de días de vacación pagados SIN descanso, separado de
-- dias_vacaciones_gozadas (que representa descanso efectivo).
ALTER TABLE prestaciones_sociales
  ADD COLUMN IF NOT EXISTS dias_vacaciones_pagadas NUMERIC(8,2) NOT NULL DEFAULT 0;
