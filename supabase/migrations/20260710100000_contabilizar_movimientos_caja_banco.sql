-- ============================================================
-- SARA ERP – Contabilización automática de movimientos manuales
-- de Caja y Banco
--
-- Problema: los ingresos/egresos capturados a mano en Caja-Bancos
-- solo actualizaban el saldo del módulo; nunca generaban asiento,
-- por lo que gastos (luz, publicidad, multas) e ingresos financieros
-- no llegaban al Libro Diario ni al Estado de Resultados.
--
-- Solución:
--   1. Columna cuenta_contrapartida_id en movimientos_caja y
--      transacciones_banco (clasificación contable del movimiento).
--   2. Trigger que genera el asiento de partida doble al insertar
--      un movimiento MANUAL clasificado. Los movimientos creados por
--      los flujos de venta/compra/pagos (ref_factura_id, ref_compra_id,
--      pago_id o asiento_id ya asignado) se saltan: su asiento ya
--      existe y contabilizarlos de nuevo duplicaría la contabilidad.
--   3. Al anular el movimiento se anula su asiento vinculado.
-- ============================================================

-- ── 1. Columnas de clasificación ────────────────────────────
ALTER TABLE movimientos_caja
  ADD COLUMN IF NOT EXISTS cuenta_contrapartida_id UUID REFERENCES plan_cuentas(id) ON DELETE SET NULL;

ALTER TABLE transacciones_banco
  ADD COLUMN IF NOT EXISTS cuenta_contrapartida_id UUID REFERENCES plan_cuentas(id) ON DELETE SET NULL;

-- ── 2a. Trigger: movimientos de caja manuales ───────────────
CREATE OR REPLACE FUNCTION fn_contabilizar_mov_caja_manual()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_cuenta_caja UUID;
  v_asiento     UUID;
  v_anio INT; v_mes INT; v_numero INT;
  v_num_str TEXT;
BEGIN
  -- Solo movimientos manuales clasificados: los flujos de venta/compra
  -- ya generan su propio asiento y llegan aquí con referencias pobladas.
  IF NEW.cuenta_contrapartida_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.ref_factura_id IS NOT NULL OR NEW.ref_compra_id IS NOT NULL
     OR NEW.pago_id IS NOT NULL OR NEW.asiento_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.estado <> 'registrado' THEN RETURN NEW; END IF;

  SELECT cuenta_contable_id INTO v_cuenta_caja FROM cuentas_caja WHERE id = NEW.cuenta_caja_id;
  IF v_cuenta_caja IS NULL THEN v_cuenta_caja := get_cuenta_id(NEW.empresa_id, '1.1.01'); END IF;
  IF v_cuenta_caja IS NULL THEN RETURN NEW; END IF;

  v_anio   := EXTRACT(YEAR  FROM NEW.fecha)::INT;
  v_mes    := EXTRACT(MONTH FROM NEW.fecha)::INT;
  v_numero := get_next_numero_asiento(NEW.empresa_id, v_anio, v_mes);
  v_num_str := 'AST-' || LPAD(v_anio::TEXT,4,'0') || '-'
                      || LPAD(v_mes::TEXT,2,'0')  || '-'
                      || LPAD(v_numero::TEXT,4,'0');

  INSERT INTO asientos_contables (
    empresa_id, fecha, descripcion, concepto, tipo,
    referencia_tipo, referencia_id,
    numero_asiento, numero, periodo_anio, periodo_mes,
    estado, total_debe, total_haber, created_by
  ) VALUES (
    NEW.empresa_id, NEW.fecha, NEW.descripcion,
    'Movimiento de caja: ' || NEW.descripcion,
    NEW.tipo, 'movimiento_caja', NEW.id,
    v_num_str, v_numero, v_anio, v_mes,
    'aprobado', NEW.monto, NEW.monto, NEW.created_by
  ) RETURNING id INTO v_asiento;

  IF NEW.tipo = 'egreso' THEN
    -- Debe: cuenta de gasto/destino · Haber: caja
    INSERT INTO asientos_detalle (asiento_id, cuenta_id, descripcion, debe, haber, orden, empresa_id) VALUES
      (v_asiento, NEW.cuenta_contrapartida_id, NEW.descripcion, NEW.monto, 0, 1, NEW.empresa_id),
      (v_asiento, v_cuenta_caja,               NEW.descripcion, 0, NEW.monto, 2, NEW.empresa_id);
  ELSE
    -- Debe: caja · Haber: cuenta de ingreso/origen
    INSERT INTO asientos_detalle (asiento_id, cuenta_id, descripcion, debe, haber, orden, empresa_id) VALUES
      (v_asiento, v_cuenta_caja,               NEW.descripcion, NEW.monto, 0, 1, NEW.empresa_id),
      (v_asiento, NEW.cuenta_contrapartida_id, NEW.descripcion, 0, NEW.monto, 2, NEW.empresa_id);
  END IF;

  -- No dispara trg_saldo_caja: ese trigger solo reacciona a UPDATE OF estado.
  UPDATE movimientos_caja SET asiento_id = v_asiento WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contabilizar_mov_caja_manual ON movimientos_caja;
CREATE TRIGGER trg_contabilizar_mov_caja_manual
  AFTER INSERT ON movimientos_caja
  FOR EACH ROW EXECUTE FUNCTION fn_contabilizar_mov_caja_manual();

-- ── 2b. Trigger: transacciones bancarias manuales ───────────
CREATE OR REPLACE FUNCTION fn_contabilizar_tx_banco_manual()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_cuenta_banco UUID;
  v_moneda       TEXT;
  v_asiento      UUID;
  v_es_ingreso   BOOLEAN;
  v_monto        NUMERIC;
  v_anio INT; v_mes INT; v_numero INT;
  v_num_str TEXT;
BEGIN
  IF NEW.cuenta_contrapartida_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.ref_factura_id IS NOT NULL OR NEW.ref_compra_id IS NOT NULL
     OR NEW.pago_id IS NOT NULL OR NEW.asiento_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.estado <> 'registrado' THEN RETURN NEW; END IF;

  SELECT cuenta_contable_id, moneda INTO v_cuenta_banco, v_moneda
  FROM cuentas_banco WHERE id = NEW.cuenta_banco_id;
  IF v_cuenta_banco IS NULL THEN v_cuenta_banco := get_cuenta_id(NEW.empresa_id, '1.1.02.01'); END IF;
  IF v_cuenta_banco IS NULL THEN RETURN NEW; END IF;

  -- Dirección del dinero: 'direccion' manda; si falta, se infiere del tipo.
  IF NEW.direccion IS NOT NULL THEN
    v_es_ingreso := (NEW.direccion = 'entrada');
  ELSE
    v_es_ingreso := NEW.tipo IN ('ingreso','deposito','transferencia','cobro','deposito_cheque');
  END IF;

  -- Los libros se llevan en córdobas: cuentas USD se convierten al
  -- tipo de cambio de la transacción cuando está disponible.
  IF v_moneda = 'USD' AND NEW.tipo_cambio IS NOT NULL AND NEW.tipo_cambio > 0 THEN
    v_monto := ROUND(NEW.monto * NEW.tipo_cambio, 2);
  ELSE
    v_monto := NEW.monto;
  END IF;

  v_anio   := EXTRACT(YEAR  FROM NEW.fecha)::INT;
  v_mes    := EXTRACT(MONTH FROM NEW.fecha)::INT;
  v_numero := get_next_numero_asiento(NEW.empresa_id, v_anio, v_mes);
  v_num_str := 'AST-' || LPAD(v_anio::TEXT,4,'0') || '-'
                      || LPAD(v_mes::TEXT,2,'0')  || '-'
                      || LPAD(v_numero::TEXT,4,'0');

  INSERT INTO asientos_contables (
    empresa_id, fecha, descripcion, concepto, tipo,
    referencia_tipo, referencia_id, referencia_num,
    numero_asiento, numero, periodo_anio, periodo_mes,
    estado, total_debe, total_haber, created_by
  ) VALUES (
    NEW.empresa_id, NEW.fecha, NEW.descripcion,
    'Transacción bancaria: ' || NEW.descripcion,
    CASE WHEN v_es_ingreso THEN 'ingreso' ELSE 'egreso' END,
    'transaccion_banco', NEW.id, NEW.referencia,
    v_num_str, v_numero, v_anio, v_mes,
    'aprobado', v_monto, v_monto, NEW.created_by
  ) RETURNING id INTO v_asiento;

  IF v_es_ingreso THEN
    INSERT INTO asientos_detalle (asiento_id, cuenta_id, descripcion, debe, haber, orden, empresa_id) VALUES
      (v_asiento, v_cuenta_banco,              NEW.descripcion, v_monto, 0, 1, NEW.empresa_id),
      (v_asiento, NEW.cuenta_contrapartida_id, NEW.descripcion, 0, v_monto, 2, NEW.empresa_id);
  ELSE
    INSERT INTO asientos_detalle (asiento_id, cuenta_id, descripcion, debe, haber, orden, empresa_id) VALUES
      (v_asiento, NEW.cuenta_contrapartida_id, NEW.descripcion, v_monto, 0, 1, NEW.empresa_id),
      (v_asiento, v_cuenta_banco,              NEW.descripcion, 0, v_monto, 2, NEW.empresa_id);
  END IF;

  UPDATE transacciones_banco SET asiento_id = v_asiento WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contabilizar_tx_banco_manual ON transacciones_banco;
CREATE TRIGGER trg_contabilizar_tx_banco_manual
  AFTER INSERT ON transacciones_banco
  FOR EACH ROW EXECUTE FUNCTION fn_contabilizar_tx_banco_manual();

-- ── 3. Anulación del movimiento anula su asiento ────────────
CREATE OR REPLACE FUNCTION fn_anular_asiento_mov_manual()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.estado = 'anulado' AND OLD.estado = 'registrado' AND NEW.asiento_id IS NOT NULL THEN
    UPDATE asientos_contables SET estado = 'anulado'
    WHERE id = NEW.asiento_id
      AND referencia_tipo IN ('movimiento_caja','transaccion_banco');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_anular_asiento_mov_caja ON movimientos_caja;
CREATE TRIGGER trg_anular_asiento_mov_caja
  AFTER UPDATE OF estado ON movimientos_caja
  FOR EACH ROW EXECUTE FUNCTION fn_anular_asiento_mov_manual();

DROP TRIGGER IF EXISTS trg_anular_asiento_tx_banco ON transacciones_banco;
CREATE TRIGGER trg_anular_asiento_tx_banco
  AFTER UPDATE OF estado ON transacciones_banco
  FOR EACH ROW EXECUTE FUNCTION fn_anular_asiento_mov_manual();
