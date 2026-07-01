
-- ============================================================
-- Fix: get_libro_mayor() ignoraba el filtro de año/mes
-- ============================================================
-- El filtro de período (a.periodo_anio, a.periodo_mes, a.estado) estaba en
-- la cláusula ON del LEFT JOIN hacia asientos_contables, pero la suma se
-- calculaba sobre asientos_detalle (d), que se unía SIN ningún filtro de
-- período en su propio JOIN. Un LEFT JOIN con condiciones en el ON solo
-- decide si la fila del lado derecho "matchea" (aquí, si a.* es NULL o no);
-- no filtra las filas de d, así que SUM(d.debe)/SUM(d.haber) sumaban TODOS
-- los movimientos históricos de la cuenta sin importar el año/mes pedido.
-- Por eso el Balance de Comprobación mostraba los mismos montos en
-- cualquier año o mes seleccionado.
--
-- La corrección: primero unir asientos_detalle con asientos_contables
-- aplicando el filtro de período en esa unión (para que d solo aparezca
-- si su asiento cae en el rango pedido), y luego hacer LEFT JOIN de eso
-- hacia plan_cuentas (para seguir mostrando cuentas sin movimiento si se
-- desactiva "solo con movimiento" en el frontend).
-- ============================================================
CREATE OR REPLACE FUNCTION get_libro_mayor(
  p_empresa_id UUID, p_anio INT,
  p_mes_inicio INT DEFAULT 1, p_mes_fin INT DEFAULT 12,
  p_cuenta_id UUID DEFAULT NULL
)
RETURNS TABLE (
  cuenta_id UUID, codigo TEXT, nombre TEXT, tipo TEXT,
  total_debe NUMERIC, total_haber NUMERIC,
  saldo_deudor NUMERIC, saldo_acreedor NUMERIC,
  movimientos BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pc.id, pc.codigo, pc.nombre, pc.tipo,
    COALESCE(SUM(d.debe),0),
    COALESCE(SUM(d.haber),0),
    GREATEST(COALESCE(SUM(d.debe),0)-COALESCE(SUM(d.haber),0),0),
    GREATEST(COALESCE(SUM(d.haber),0)-COALESCE(SUM(d.debe),0),0),
    COUNT(d.id)
  FROM plan_cuentas pc
  LEFT JOIN (
    asientos_detalle d
    JOIN asientos_contables a ON a.id = d.asiento_id
      AND a.empresa_id = p_empresa_id
      AND a.periodo_anio = p_anio
      AND a.periodo_mes BETWEEN p_mes_inicio AND p_mes_fin
      AND a.estado <> 'anulado'
  ) ON d.cuenta_id = pc.id
  WHERE pc.empresa_id=p_empresa_id AND pc.activa=true AND pc.permite_movimiento=true
    AND (p_cuenta_id IS NULL OR pc.id=p_cuenta_id)
  GROUP BY pc.id,pc.codigo,pc.nombre,pc.tipo
  HAVING COALESCE(SUM(d.debe),0)>0 OR COALESCE(SUM(d.haber),0)>0
  ORDER BY pc.codigo;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
