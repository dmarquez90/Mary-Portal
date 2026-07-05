-- ============================================================
-- Multi-moneda (2/4): tasa de cambio vigente
-- ============================================================
-- Centraliza lo que hoy repiten por su cuenta 4 pantallas distintas
-- (ventas/page.tsx, ventas/[id]/page.tsx, compras/page.tsx,
-- caja-bancos/arqueos/page.tsx): la última tasa registrada en
-- tasa_cambio con fecha <= p_fecha. La usan los triggers de
-- contabilización cuando el documento no trae ya una tasa explícita.
-- ============================================================

CREATE OR REPLACE FUNCTION fn_tasa_cambio_vigente(p_empresa_id UUID, p_fecha DATE DEFAULT CURRENT_DATE)
RETURNS NUMERIC
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  SELECT tasa FROM tasa_cambio
  WHERE empresa_id = p_empresa_id AND fecha <= p_fecha
  ORDER BY fecha DESC
  LIMIT 1;
$$;
