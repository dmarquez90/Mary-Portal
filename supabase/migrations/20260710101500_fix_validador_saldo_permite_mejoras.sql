-- ============================================================
-- Fix: el validador de saldo negativo bloqueaba TODO movimiento
-- sobre una cuenta de activo ya en negativo, incluso los débitos
-- (depósitos/entradas) que la mejoran — dejando la cuenta
-- irrecuperable por vías normales.
--
-- Regla corregida: solo se bloquea la línea que EMPEORA el saldo
-- y lo deja (o mantiene) por debajo de cero. Un débito que acerca
-- la cuenta a cero siempre se permite.
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

  -- Bloquea solo si queda negativo Y el movimiento empeoró el saldo:
  -- las entradas de dinero a una cuenta ya negativa deben permitirse
  -- para poder sanearla.
  IF v_saldo_nuevo < -0.01 AND v_saldo_nuevo < v_saldo_previo THEN
    RAISE EXCEPTION 'SALDO_NEGATIVO: el movimiento dejaría la cuenta % - % con saldo negativo (C$ %). Saldo disponible antes de este movimiento: C$ %',
      v_codigo, v_nombre, to_char(v_saldo_nuevo, 'FM999G999G990D00'), to_char(v_saldo_previo, 'FM999G999G990D00');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
