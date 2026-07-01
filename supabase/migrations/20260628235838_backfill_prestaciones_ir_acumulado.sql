
-- ============================================================
-- SARA ERP — Backfill prestaciones_sociales e ir_laboral_acumulado
-- Reconstruye acumulados históricos desde planilla_detalle
-- ============================================================

-- 1. Backfill prestaciones_sociales
INSERT INTO prestaciones_sociales (
  empresa_id,
  empleado_id,
  acum_vacaciones,
  acum_aguinaldo,
  acum_indemnizacion,
  dias_vacaciones_acum,
  dias_vacaciones_gozadas,
  ultimo_periodo_mes,
  ultimo_periodo_anio
)
SELECT
  pd.empresa_id,
  pd.empleado_id,
  SUM(pd.prov_vacaciones),
  SUM(pd.prov_aguinaldo),
  SUM(pd.prov_indemnizacion),
  SUM(pd.dias_trabajados::numeric / 30),
  0,
  MAX(p.periodo_mes),
  MAX(p.periodo_anio)
FROM planilla_detalle pd
JOIN planillas p ON p.id = pd.planilla_id
GROUP BY pd.empresa_id, pd.empleado_id
ON CONFLICT (empresa_id, empleado_id) DO UPDATE SET
  acum_vacaciones      = EXCLUDED.acum_vacaciones,
  acum_aguinaldo       = EXCLUDED.acum_aguinaldo,
  acum_indemnizacion   = EXCLUDED.acum_indemnizacion,
  dias_vacaciones_acum = EXCLUDED.dias_vacaciones_acum,
  ultimo_periodo_mes   = EXCLUDED.ultimo_periodo_mes,
  ultimo_periodo_anio  = EXCLUDED.ultimo_periodo_anio,
  updated_at           = NOW();

-- 2. Backfill ir_laboral_acumulado
INSERT INTO ir_laboral_acumulado (
  empresa_id,
  empleado_id,
  anio_fiscal,
  mes,
  salario_bruto,
  inss_laboral,
  renta_gravable,
  ir_retenido,
  acum_anual_bruto
)
SELECT
  pd.empresa_id,
  pd.empleado_id,
  p.periodo_anio,
  p.periodo_mes,
  pd.salario_bruto,
  pd.inss_laboral,
  pd.salario_bruto - pd.inss_laboral,
  pd.ir_laboral,
  SUM(pd.salario_bruto) OVER (
    PARTITION BY pd.empresa_id, pd.empleado_id, p.periodo_anio
    ORDER BY p.periodo_mes
    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
  )
FROM planilla_detalle pd
JOIN planillas p ON p.id = pd.planilla_id
ON CONFLICT (empresa_id, empleado_id, anio_fiscal, mes) DO UPDATE SET
  salario_bruto    = EXCLUDED.salario_bruto,
  inss_laboral     = EXCLUDED.inss_laboral,
  renta_gravable   = EXCLUDED.renta_gravable,
  ir_retenido      = EXCLUDED.ir_retenido,
  acum_anual_bruto = EXCLUDED.acum_anual_bruto;
