
-- ============================================================
-- Fix: get_saldos_multiple() sumaba los asientos de tipo 'cierre'
-- (generados por cerrar_periodo_contable) al calcular Estado de
-- Resultados / Flujo de Efectivo para rangos de fecha que abarcan
-- un período ya cerrado.
--
-- El asiento de cierre debita las cuentas de ingreso (4.x) y
-- acredita costo/gasto (5.x/6.x) para dejarlas en cero y trasladar
-- el resultado a patrimonio (3.2.03). Eso es correcto para el mes
-- que se cierra, pero si el reporte pide un rango más amplio (ej.
-- todo el año) que incluye ese cierre, la reversión se resta DE
-- NUEVO sobre las ventas/gastos reales, dejando saldos absurdos
-- (ventas en negativo, utilidad inflada).
--
-- Fix: excluir asientos tipo='cierre' únicamente para cuentas de
-- resultado (códigos que empiezan en 4, 5 o 6). Las cuentas de
-- balance (1.x, 2.x, 3.x) SIGUEN incluyendo el cierre, porque el
-- Balance General y el Flujo de Efectivo (método indirecto) dependen
-- de que el cierre acredite/debite 3.2.03 Utilidad del Ejercicio.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_saldos_multiple(
  p_empresa_id    UUID,
  p_cuentas       TEXT[],
  p_fecha_inicio  DATE,
  p_fecha_fin     DATE,
  p_acumulado     BOOLEAN DEFAULT FALSE
)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(ad.debe - ad.haber), 0)
  FROM asientos_detalle ad
  JOIN asientos_contables ac ON ac.id = ad.asiento_id
  JOIN plan_cuentas pc ON pc.id = ad.cuenta_id
  WHERE ac.empresa_id = p_empresa_id
    AND p_empresa_id = ANY (get_empresa_ids())
    AND ac.estado IN ('aprobado', 'contabilizado')
    AND ac.fecha <= p_fecha_fin
    AND (p_acumulado OR ac.fecha >= p_fecha_inicio)
    AND NOT (ac.tipo = 'cierre' AND pc.codigo ~ '^[456]')
    AND EXISTS (
      SELECT 1 FROM unnest(p_cuentas) AS code
      WHERE pc.codigo = code OR pc.codigo LIKE code || '.%'
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_saldos_multiple(UUID, TEXT[], DATE, DATE, BOOLEAN) TO authenticated;
