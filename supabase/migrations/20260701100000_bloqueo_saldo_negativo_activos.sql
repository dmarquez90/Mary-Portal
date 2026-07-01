-- ============================================================
-- Regla contable: impedir saldos negativos en cuentas de activo
-- ============================================================
-- Un activo (caja, bancos, CxC, inventario, etc.) tiene naturaleza deudora:
-- su saldo (debe - haber) nunca debería quedar por debajo de cero, porque
-- eso significaría, por ejemplo, pagar con dinero que el banco/caja no tiene.
-- Las cuentas contra-activo (ej. "Dep. Acum. ...") tienen naturaleza
-- acreedora y se excluyen a propósito: para ellas un saldo "negativo" en
-- términos de debe es justamente lo esperado.
--
-- Esta migración agrega:
--   1) Un trigger BEFORE INSERT/UPDATE en asientos_detalle que bloquea
--      cualquier línea (manual, o generada por ventas/compras/nómina/
--      cheques/abonos, ya que todos esos flujos insertan en esta misma
--      tabla) que deje una cuenta de activo (naturaleza deudora) en
--      negativo.
--   2) Una función get_alertas_saldos_negativos() que expone, para el
--      panel de alertas del dashboard, las cuentas de activo que ya están
--      en negativo (dato histórico que el trigger no puede corregir
--      retroactivamente, pero sí se debe alertar).
-- ============================================================

CREATE OR REPLACE FUNCTION fn_validar_saldo_no_negativo()
RETURNS TRIGGER AS $$
DECLARE
  v_tipo             TEXT;
  v_naturaleza       TEXT;
  v_nombre           TEXT;
  v_codigo           TEXT;
  v_estado_asiento   TEXT;
  v_saldo_previo     NUMERIC;
  v_saldo_nuevo      NUMERIC;
BEGIN
  SELECT tipo, naturaleza, nombre, codigo
    INTO v_tipo, v_naturaleza, v_nombre, v_codigo
  FROM plan_cuentas
  WHERE id = NEW.cuenta_id;

  -- Solo aplica a cuentas de activo de naturaleza deudora
  IF v_tipo IS DISTINCT FROM 'activo' OR v_naturaleza IS DISTINCT FROM 'deudora' THEN
    RETURN NEW;
  END IF;

  SELECT estado INTO v_estado_asiento
  FROM asientos_contables
  WHERE id = NEW.asiento_id;

  -- Un asiento anulado no debe poder validarse contra el saldo (no aplica)
  IF v_estado_asiento = 'anulado' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(d.debe), 0) - COALESCE(SUM(d.haber), 0)
    INTO v_saldo_previo
  FROM asientos_detalle d
  JOIN asientos_contables a ON a.id = d.asiento_id AND a.estado <> 'anulado'
  WHERE d.cuenta_id = NEW.cuenta_id
    AND d.id <> NEW.id;

  v_saldo_nuevo := v_saldo_previo + COALESCE(NEW.debe, 0) - COALESCE(NEW.haber, 0);

  IF v_saldo_nuevo < -0.01 THEN
    RAISE EXCEPTION 'SALDO_NEGATIVO: el movimiento dejaría la cuenta % - % con saldo negativo (C$ %). Saldo disponible antes de este movimiento: C$ %',
      v_codigo, v_nombre, to_char(v_saldo_nuevo, 'FM999G999G990D00'), to_char(v_saldo_previo, 'FM999G999G990D00');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validar_saldo_no_negativo ON asientos_detalle;
CREATE TRIGGER trg_validar_saldo_no_negativo
  BEFORE INSERT OR UPDATE OF debe, haber, cuenta_id ON asientos_detalle
  FOR EACH ROW EXECUTE FUNCTION fn_validar_saldo_no_negativo();

-- ── Alertas: cuentas de activo actualmente en negativo ──────────
CREATE OR REPLACE FUNCTION get_alertas_saldos_negativos(p_empresa_id UUID)
RETURNS TABLE (
  cuenta_id UUID, codigo TEXT, nombre TEXT, tipo TEXT, saldo NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pc.id, pc.codigo, pc.nombre, pc.tipo,
    COALESCE(SUM(d.debe), 0) - COALESCE(SUM(d.haber), 0) AS saldo
  FROM plan_cuentas pc
  LEFT JOIN (
    asientos_detalle d
    JOIN asientos_contables a ON a.id = d.asiento_id AND a.estado <> 'anulado'
  ) ON d.cuenta_id = pc.id
  WHERE pc.empresa_id = p_empresa_id
    AND pc.tipo = 'activo' AND pc.naturaleza = 'deudora'
    AND pc.permite_movimiento = true AND pc.activa = true
  GROUP BY pc.id, pc.codigo, pc.nombre, pc.tipo
  HAVING COALESCE(SUM(d.debe), 0) - COALESCE(SUM(d.haber), 0) < -0.01
  ORDER BY saldo ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_alertas_saldos_negativos(UUID) TO authenticated;
