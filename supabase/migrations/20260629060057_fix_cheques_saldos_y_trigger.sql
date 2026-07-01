
-- ============================================================
-- FIX 1: Reemplazar fn_contabilizar_compra para que al tipo_pago='cheque'
--         también inserte un registro en la tabla cheques
-- ============================================================
CREATE OR REPLACE FUNCTION fn_contabilizar_compra()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_asiento_id            UUID;
  v_numero                INT; v_anio INT; v_mes INT;
  v_num_str               TEXT;
  v_inventario_id         UUID; v_iva_cred_id UUID;
  v_cxp_id                UUID; v_caja_id UUID;
  v_haber_id              UUID;
  v_retencion_ir_id       UUID;
  v_cuenta_caja_id        UUID;
  v_cuenta_banco_id       UUID;
  v_cuenta_contable_banco UUID;
  v_tipo_persona          TEXT;
  v_retencion_ir          NUMERIC;
  v_total_a_pagar         NUMERIC;
  v_transaccion_id        UUID;
  v_num_cheque            TEXT;
  v_proveedor_nombre      TEXT;
BEGIN
  IF NEW.estado <> 'recibida' THEN RETURN NEW; END IF;
  IF OLD.estado = 'recibida'  THEN RETURN NEW; END IF;
  IF EXISTS (
    SELECT 1 FROM asientos_contables
    WHERE empresa_id=NEW.empresa_id AND referencia_tipo='compra'
      AND referencia_id=NEW.id AND estado<>'anulado'
  ) THEN RETURN NEW; END IF;

  v_anio    := EXTRACT(YEAR  FROM NEW.fecha_compra)::INT;
  v_mes     := EXTRACT(MONTH FROM NEW.fecha_compra)::INT;
  v_numero  := get_next_numero_asiento(NEW.empresa_id, v_anio, v_mes);
  v_num_str := 'AST-' || LPAD(v_anio::TEXT,4,'0') || '-'
                       || LPAD(v_mes::TEXT,2,'0')  || '-'
                       || LPAD(v_numero::TEXT,4,'0');

  SELECT id INTO v_inventario_id FROM plan_cuentas WHERE empresa_id=NEW.empresa_id AND codigo='1.1.08' AND activa=true LIMIT 1;
  SELECT id INTO v_iva_cred_id   FROM plan_cuentas WHERE empresa_id=NEW.empresa_id AND codigo='1.1.09' AND activa=true LIMIT 1;
  SELECT id INTO v_cxp_id        FROM plan_cuentas WHERE empresa_id=NEW.empresa_id AND codigo='2.1.01' AND activa=true LIMIT 1;
  SELECT id INTO v_caja_id       FROM plan_cuentas WHERE empresa_id=NEW.empresa_id AND codigo='1.1.01' AND activa=true LIMIT 1;
  SELECT id INTO v_retencion_ir_id FROM plan_cuentas
  WHERE empresa_id=NEW.empresa_id
    AND (codigo='2.1.06' OR nombre ILIKE '%retenci%ir%enterar%' OR nombre ILIKE '%retenci%ir%pagar%')
    AND activa=true LIMIT 1;

  IF v_inventario_id IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(tipo_persona,'juridica') INTO v_tipo_persona
  FROM proveedores WHERE id = NEW.proveedor_id;

  IF v_tipo_persona = 'natural' THEN
    v_retencion_ir  := ROUND(NEW.subtotal * 0.02, 2);
    v_total_a_pagar := NEW.total - v_retencion_ir;
  ELSE
    v_retencion_ir  := 0;
    v_total_a_pagar := NEW.total;
  END IF;

  UPDATE compras SET retencion_ir=v_retencion_ir, total_a_pagar=v_total_a_pagar WHERE id=NEW.id;

  IF NEW.tipo_pago IN ('transferencia','cheque','tarjeta') THEN
    IF NEW.cuenta_banco_id IS NOT NULL THEN
      SELECT cuenta_contable_id INTO v_cuenta_contable_banco FROM cuentas_banco WHERE id=NEW.cuenta_banco_id;
    END IF;
    IF v_cuenta_contable_banco IS NULL THEN
      SELECT cuenta_contable_id INTO v_cuenta_contable_banco FROM cuentas_banco
      WHERE empresa_id=NEW.empresa_id AND activa=true ORDER BY created_at LIMIT 1;
    END IF;
    IF v_cuenta_contable_banco IS NULL THEN
      SELECT id INTO v_cuenta_contable_banco FROM plan_cuentas
      WHERE empresa_id=NEW.empresa_id AND codigo='1.1.02.01' AND activa=true LIMIT 1;
    END IF;
  END IF;

  CASE NEW.tipo_pago
    WHEN 'credito'       THEN v_haber_id := COALESCE(v_cxp_id, v_caja_id);
    WHEN 'contado'       THEN v_haber_id := COALESCE(v_caja_id, v_cxp_id);
    WHEN 'transferencia' THEN v_haber_id := COALESCE(v_cuenta_contable_banco, v_caja_id);
    WHEN 'cheque'        THEN v_haber_id := COALESCE(v_cuenta_contable_banco, v_caja_id);
    WHEN 'tarjeta'       THEN v_haber_id := COALESCE(v_cuenta_contable_banco, v_caja_id);
    ELSE                      v_haber_id := COALESCE(v_caja_id, v_cxp_id);
  END CASE;

  IF v_haber_id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO asientos_contables (
    empresa_id, fecha, descripcion, concepto, tipo,
    referencia_tipo, referencia_id, referencia_num,
    numero_asiento, numero, periodo_anio, periodo_mes,
    ref_compra_id, estado, total_debe, total_haber
  ) VALUES (
    NEW.empresa_id, NEW.fecha_compra,
    'Compra ' || NEW.numero_compra,
    'Compra ' || NEW.numero_compra || ' (' || NEW.tipo_pago || ')',
    'egreso','compra',NEW.id,NEW.numero_compra,
    v_num_str,v_numero,v_anio,v_mes,
    NEW.id,'aprobado',NEW.total,NEW.total
  ) RETURNING id INTO v_asiento_id;

  INSERT INTO asientos_detalle (asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
  VALUES (v_asiento_id, v_inventario_id, 'Inventario - '||NEW.numero_compra, NEW.subtotal, 0, 1, NEW.empresa_id);

  IF NEW.iva_total > 0 AND v_iva_cred_id IS NOT NULL THEN
    INSERT INTO asientos_detalle (asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
    VALUES (v_asiento_id, v_iva_cred_id, 'IVA CF 15% - '||NEW.numero_compra, NEW.iva_total, 0, 2, NEW.empresa_id);
  END IF;

  INSERT INTO asientos_detalle (asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
  VALUES (v_asiento_id, v_haber_id,
    CASE NEW.tipo_pago
      WHEN 'credito'       THEN 'CxP proveedor - '
      WHEN 'contado'       THEN 'Pago contado - '
      WHEN 'transferencia' THEN 'Transferencia bancaria - '
      WHEN 'cheque'        THEN 'Cheque emitido - '
      WHEN 'tarjeta'       THEN 'Tarjeta - '
      ELSE 'Pago - '
    END || NEW.numero_compra,
    0, v_total_a_pagar, 3, NEW.empresa_id);

  IF v_retencion_ir > 0 AND v_retencion_ir_id IS NOT NULL THEN
    INSERT INTO asientos_detalle (asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
    VALUES (v_asiento_id, v_retencion_ir_id, 'Retención IR 2% - '||NEW.numero_compra, 0, v_retencion_ir, 4, NEW.empresa_id);
  END IF;

  -- ── Movimiento operativo ──────────────────────────────────
  IF NEW.tipo_pago = 'contado' THEN
    v_cuenta_caja_id := NEW.cuenta_caja_id;
    IF v_cuenta_caja_id IS NULL THEN
      SELECT id INTO v_cuenta_caja_id FROM cuentas_caja
      WHERE empresa_id=NEW.empresa_id AND activa=true
      ORDER BY tipo='caja_general' DESC, created_at LIMIT 1;
    END IF;
    IF v_cuenta_caja_id IS NOT NULL THEN
      INSERT INTO movimientos_caja(empresa_id,cuenta_caja_id,tipo,monto,descripcion,ref_compra_id,asiento_id,fecha)
      VALUES(NEW.empresa_id, v_cuenta_caja_id, 'egreso', v_total_a_pagar,
        'Pago contado '||NEW.numero_compra, NEW.id, v_asiento_id, NEW.fecha_compra);
    END IF;

  ELSIF NEW.tipo_pago IN ('transferencia','cheque','tarjeta') THEN
    v_cuenta_banco_id := NEW.cuenta_banco_id;
    IF v_cuenta_banco_id IS NULL THEN
      SELECT id INTO v_cuenta_banco_id FROM cuentas_banco
      WHERE empresa_id=NEW.empresa_id AND activa=true ORDER BY created_at LIMIT 1;
    END IF;
    IF v_cuenta_banco_id IS NOT NULL THEN
      INSERT INTO transacciones_banco(empresa_id,cuenta_banco_id,tipo,monto,descripcion,ref_compra_id,asiento_id,fecha)
      VALUES(NEW.empresa_id, v_cuenta_banco_id,
        CASE NEW.tipo_pago WHEN 'cheque' THEN 'cheque' WHEN 'tarjeta' THEN 'tarjeta' ELSE 'transferencia' END,
        v_total_a_pagar,
        'Pago '||NEW.tipo_pago||' - '||NEW.numero_compra,
        NEW.id, v_asiento_id, NEW.fecha_compra)
      RETURNING id INTO v_transaccion_id;

      -- ── NUEVO: Si es cheque, registrar en tabla cheques ──
      IF NEW.tipo_pago = 'cheque' THEN
        SELECT COALESCE(nombre, 'Sin nombre') INTO v_proveedor_nombre
        FROM proveedores WHERE id = NEW.proveedor_id LIMIT 1;

        v_num_cheque := 'CHQ-' || NEW.numero_compra;

        INSERT INTO cheques(
          empresa_id, cuenta_banco_id, numero_cheque, tipo,
          monto, beneficiario, fecha_emision,
          ref_compra_id, transaccion_banco_id, estado, notas
        ) VALUES (
          NEW.empresa_id, v_cuenta_banco_id, v_num_cheque, 'emitido',
          v_total_a_pagar, v_proveedor_nombre, NEW.fecha_compra,
          NEW.id, v_transaccion_id, 'activo',
          'Cheque emitido por compra '||NEW.numero_compra
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- FIX 2: Eliminar transacción bancaria duplicada de F-000004
-- ============================================================
DELETE FROM transacciones_banco
WHERE id = '691a35c2-586e-4618-9ecf-aa3ba7ef898d'
  AND empresa_id = '1c71f63d-3979-4639-a81c-7e6df095841d';

-- ============================================================
-- FIX 3: Recalcular saldo_actual de todas las cuentas banco de la empresa
--         basado en las transacciones reales (sin el duplicado)
-- ============================================================
UPDATE cuentas_banco cb
SET saldo_actual = cb.saldo_inicial + COALESCE((
  SELECT SUM(
    CASE
      WHEN tb.ref_factura_id IS NOT NULL THEN  tb.monto
      WHEN tb.ref_compra_id  IS NOT NULL THEN -tb.monto
      ELSE 0
    END
  )
  FROM transacciones_banco tb
  WHERE tb.cuenta_banco_id = cb.id
    AND tb.estado = 'registrado'
), 0)
WHERE cb.empresa_id = '1c71f63d-3979-4639-a81c-7e6df095841d';

-- ============================================================
-- FIX 4: Recalcular saldo_actual de cuentas_caja de la empresa
--         el movimiento CxC por C$90 no actualizó el saldo via trigger
-- ============================================================
UPDATE cuentas_caja cc
SET saldo_actual = cc.saldo_inicial + COALESCE((
  SELECT SUM(
    CASE WHEN mc.tipo = 'ingreso' THEN mc.monto ELSE -mc.monto END
  )
  FROM movimientos_caja mc
  WHERE mc.cuenta_caja_id = cc.id
    AND mc.estado = 'registrado'
), 0)
WHERE cc.empresa_id = '1c71f63d-3979-4639-a81c-7e6df095841d';

-- ============================================================
-- FIX 5: Insertar retroactivamente el cheque de C-000003
--         que no fue registrado en tabla cheques por el bug anterior
-- ============================================================
INSERT INTO cheques(
  empresa_id, cuenta_banco_id, numero_cheque, tipo,
  monto, beneficiario, fecha_emision,
  ref_compra_id, transaccion_banco_id, estado, notas
)
SELECT
  '1c71f63d-3979-4639-a81c-7e6df095841d',
  '34482172-afc6-47ff-a79e-e613e6a1ca58',
  'CHQ-C-000003',
  'emitido',
  253.00,
  COALESCE(p.nombre, 'Sin nombre'),
  '2026-06-29'::date,
  'e80e24b7-29ea-47fb-ba0f-a2af3a9682bb',
  'a5bc5dc8-2222-490b-8150-2eb9c4af263b',
  'activo',
  'Cheque emitido por compra C-000003 (registro retroactivo)'
FROM proveedores p
JOIN compras c ON c.proveedor_id = p.id
WHERE c.id = 'e80e24b7-29ea-47fb-ba0f-a2af3a9682bb'
  AND NOT EXISTS (
    SELECT 1 FROM cheques WHERE ref_compra_id = 'e80e24b7-29ea-47fb-ba0f-a2af3a9682bb'
  );
