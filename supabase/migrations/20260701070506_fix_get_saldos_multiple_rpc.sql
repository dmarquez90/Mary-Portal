
-- ============================================================
-- Fix: función RPC faltante usada por src/lib/estados-financieros.ts
-- Balance General, Estado de Resultados y Flujo de Efectivo
-- llamaban a get_saldos_multiple() vía supabase.rpc(), pero la función
-- nunca fue creada en la BD (drift entre código y esquema aplicado).
-- Como consecuencia el error se tragaba silenciosamente y todos los
-- estados financieros mostraban C$0.00 en cada línea.
--
-- Convención de signo: retorna SUM(debe) - SUM(haber) crudo por cuenta
-- (saldo "natural deudor"). El signo de presentación (activo positivo,
-- pasivo/patrimonio/ingreso positivo aunque su naturaleza sea acreedora)
-- se aplica en el código TypeScript (campo `signo` de cada línea), tal
-- como ya lo hace estados-financieros.ts.
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
    AND EXISTS (
      SELECT 1 FROM unnest(p_cuentas) AS code
      WHERE pc.codigo = code OR pc.codigo LIKE code || '.%'
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_saldos_multiple(UUID, TEXT[], DATE, DATE, BOOLEAN) TO authenticated;
