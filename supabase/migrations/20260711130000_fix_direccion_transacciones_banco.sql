-- ================================================================
-- FIX: Cobros/pagos con tarjeta, transferencia y cheque no llenaban
-- la columna transacciones_banco.direccion (quedaba NULL).
--
-- La UI de Caja y Bancos (src/app/dashboard/caja-bancos/page.tsx)
-- pinta el monto en rojo con "-" cuando direccion es NULL y el tipo
-- no está en su whitelist ['ingreso','deposito','cobro','transferencia'].
-- Como 'tarjeta' nunca estuvo en esa lista, todo cobro de venta pagado
-- con tarjeta se mostraba como si fuera un egreso/monto negativo,
-- aunque el monto guardado y el asiento contable siempre fueron
-- correctos (positivos).
--
-- Este fix:
--   1. Hace que fn_contabilizar_factura() marque direccion='entrada'.
--   2. Hace que fn_contabilizar_compra() marque direccion='salida'.
--   3. Rellena retroactivamente las filas que ya quedaron con
--      direccion NULL por este bug.
-- ================================================================

CREATE OR REPLACE FUNCTION public.fn_contabilizar_factura()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_asiento_id      UUID;
  v_numero          INT;
  v_anio            INT; v_mes INT;
  v_num_str         TEXT;
  v_caja_id         UUID; v_cxc_id UUID;
  v_banco_id        UUID; v_tarjeta_id UUID;
  v_ventas_id       UUID; v_iva_deb_id UUID;
  v_debe_id         UUID;
  v_cuenta_caja_id  UUID;
  v_cuenta_banco_id UUID;
  v_cuenta_contable_banco UUID;
  v_cuenta_moneda   TEXT;
  v_tasa            NUMERIC;
  v_monto_operativo NUMERIC;
BEGIN
  IF NEW.estado <> 'emitida' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.estado = 'emitida' THEN RETURN NEW; END IF;
  IF EXISTS (
    SELECT 1 FROM asientos_contables
    WHERE empresa_id = NEW.empresa_id
      AND referencia_tipo = 'factura'
      AND referencia_id = NEW.id
      AND estado <> 'anulado'
  ) THEN RETURN NEW; END IF;

  v_anio    := EXTRACT(YEAR  FROM NEW.fecha_emision)::INT;
  v_mes     := EXTRACT(MONTH FROM NEW.fecha_emision)::INT;
  v_numero  := get_next_numero_asiento(NEW.empresa_id, v_anio, v_mes);
  v_num_str := 'AST-' || LPAD(v_anio::TEXT,4,'0') || '-'
                       || LPAD(v_mes::TEXT,2,'0')  || '-'
                       || LPAD(v_numero::TEXT,4,'0');

  SELECT id INTO v_caja_id    FROM plan_cuentas WHERE empresa_id=NEW.empresa_id AND codigo='1.1.01' AND activa=true LIMIT 1;
  SELECT id INTO v_cxc_id     FROM plan_cuentas WHERE empresa_id=NEW.empresa_id AND codigo='1.1.05' AND activa=true LIMIT 1;
  SELECT id INTO v_tarjeta_id FROM plan_cuentas WHERE empresa_id=NEW.empresa_id AND codigo='1.1.02.02' AND activa=true LIMIT 1;
  SELECT id INTO v_ventas_id  FROM plan_cuentas WHERE empresa_id=NEW.empresa_id AND codigo='4.1.01' AND activa=true LIMIT 1;
  SELECT id INTO v_iva_deb_id FROM plan_cuentas WHERE empresa_id=NEW.empresa_id AND codigo='2.1.03' AND activa=true LIMIT 1;

  IF v_ventas_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.tipo_pago IN ('transferencia','cheque','tarjeta') THEN
    IF NEW.cuenta_banco_id IS NOT NULL THEN
      SELECT cuenta_contable_id INTO v_cuenta_contable_banco
      FROM cuentas_banco WHERE id = NEW.cuenta_banco_id;
    END IF;

    IF v_cuenta_contable_banco IS NULL THEN
      SELECT cuenta_contable_id INTO v_cuenta_contable_banco
      FROM cuentas_banco
      WHERE empresa_id = NEW.empresa_id AND activa = true
      ORDER BY created_at LIMIT 1;
    END IF;

    IF v_cuenta_contable_banco IS NULL THEN
      SELECT id INTO v_cuenta_contable_banco
      FROM plan_cuentas WHERE empresa_id=NEW.empresa_id AND codigo='1.1.02.01' AND activa=true LIMIT 1;
    END IF;

    v_banco_id := v_cuenta_contable_banco;
  END IF;

  CASE NEW.tipo_pago
    WHEN 'contado'       THEN v_debe_id := COALESCE(v_caja_id,   v_cxc_id);
    WHEN 'credito'       THEN v_debe_id := COALESCE(v_cxc_id,    v_caja_id);
    WHEN 'transferencia' THEN v_debe_id := COALESCE(v_banco_id,  v_caja_id);
    WHEN 'cheque'        THEN v_debe_id := COALESCE(v_banco_id,  v_caja_id);
    WHEN 'tarjeta'       THEN v_debe_id := COALESCE(v_tarjeta_id, v_banco_id, v_caja_id);
    ELSE                      v_debe_id := COALESCE(v_caja_id,   v_cxc_id);
  END CASE;

  IF v_debe_id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO asientos_contables (
    empresa_id, fecha, descripcion, concepto, tipo,
    referencia_tipo, referencia_id, referencia_num,
    numero_asiento, numero, periodo_anio, periodo_mes,
    ref_factura_id, estado, total_debe, total_haber
  ) VALUES (
    NEW.empresa_id, NEW.fecha_emision,
    'Venta ' || NEW.numero_factura || ' - ' || NEW.cliente_nombre,
    'Factura ' || NEW.numero_factura || ' (' || NEW.tipo_pago || ')',
    'ingreso','factura',NEW.id,NEW.numero_factura,
    v_num_str,v_numero,v_anio,v_mes,
    NEW.id,'aprobado',NEW.total,NEW.total
  ) RETURNING id INTO v_asiento_id;

  INSERT INTO asientos_detalle (asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
  VALUES (v_asiento_id, v_debe_id,
    CASE NEW.tipo_pago
      WHEN 'contado'       THEN 'Cobro contado - '
      WHEN 'credito'       THEN 'CxC - '
      WHEN 'transferencia' THEN 'Transferencia bancaria - '
      WHEN 'cheque'        THEN 'Cheque recibido - '
      WHEN 'tarjeta'       THEN 'Tarjeta POS - '
      ELSE 'Cobro - '
    END || NEW.numero_factura,
    NEW.total, 0, 1, NEW.empresa_id);

  INSERT INTO asientos_detalle (asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
  VALUES (v_asiento_id, v_ventas_id,
    'Venta - ' || NEW.numero_factura, 0, NEW.subtotal, 2, NEW.empresa_id);

  IF NEW.iva_total > 0 AND v_iva_deb_id IS NOT NULL THEN
    INSERT INTO asientos_detalle (asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
    VALUES (v_asiento_id, v_iva_deb_id,
      'IVA 15% - ' || NEW.numero_factura, 0, NEW.iva_total, 3, NEW.empresa_id);
  END IF;

  IF NEW.tipo_pago = 'contado' THEN
    v_cuenta_caja_id := NEW.cuenta_caja_id;
    IF v_cuenta_caja_id IS NULL THEN
      SELECT id INTO v_cuenta_caja_id FROM cuentas_caja
      WHERE empresa_id=NEW.empresa_id AND activa=true
      ORDER BY tipo='caja_general' DESC, created_at LIMIT 1;
    END IF;
    IF v_cuenta_caja_id IS NOT NULL THEN
      SELECT moneda INTO v_cuenta_moneda FROM cuentas_caja WHERE id = v_cuenta_caja_id;
      v_tasa := NULL;
      v_monto_operativo := NEW.total;
      IF v_cuenta_moneda = 'USD' THEN
        v_tasa := COALESCE(NEW.tasa_cambio, fn_tasa_cambio_vigente(NEW.empresa_id, NEW.fecha_emision));
        IF v_tasa IS NULL OR v_tasa <= 0 THEN
          RAISE EXCEPTION 'No hay tasa de cambio registrada para convertir el cobro de % (C$%) a la caja en USD. Registra la tasa del día en Tasa de Cambio.', NEW.numero_factura, NEW.total;
        END IF;
        v_monto_operativo := ROUND(NEW.total / v_tasa, 2);
        UPDATE facturas SET moneda = 'USD', tasa_cambio = v_tasa, total_usd = v_monto_operativo WHERE id = NEW.id;
      END IF;

      INSERT INTO movimientos_caja(empresa_id,cuenta_caja_id,tipo,monto,descripcion,ref_factura_id,asiento_id,fecha,sesion_caja_id)
      VALUES(NEW.empresa_id, v_cuenta_caja_id, 'ingreso', v_monto_operativo,
        'Venta contado ' || NEW.numero_factura || ' - ' || NEW.cliente_nombre ||
        CASE WHEN v_tasa IS NOT NULL THEN ' (C$' || NEW.total || ' @ ' || v_tasa || ')' ELSE '' END,
        NEW.id, v_asiento_id, NEW.fecha_emision, NEW.sesion_caja_id);
    END IF;

  ELSIF NEW.tipo_pago IN ('transferencia','cheque','tarjeta') THEN
    v_cuenta_banco_id := NEW.cuenta_banco_id;
    IF v_cuenta_banco_id IS NULL THEN
      SELECT id INTO v_cuenta_banco_id FROM cuentas_banco
      WHERE empresa_id=NEW.empresa_id AND activa=true ORDER BY created_at LIMIT 1;
    END IF;
    IF v_cuenta_banco_id IS NOT NULL THEN
      SELECT moneda INTO v_cuenta_moneda FROM cuentas_banco WHERE id = v_cuenta_banco_id;
      v_tasa := NULL;
      v_monto_operativo := NEW.total;
      IF v_cuenta_moneda = 'USD' THEN
        v_tasa := COALESCE(NEW.tasa_cambio, fn_tasa_cambio_vigente(NEW.empresa_id, NEW.fecha_emision));
        IF v_tasa IS NULL OR v_tasa <= 0 THEN
          RAISE EXCEPTION 'No hay tasa de cambio registrada para convertir el cobro de % (C$%) a la cuenta bancaria en USD. Registra la tasa del día en Tasa de Cambio.', NEW.numero_factura, NEW.total;
        END IF;
        v_monto_operativo := ROUND(NEW.total / v_tasa, 2);
        UPDATE facturas SET moneda = 'USD', tasa_cambio = v_tasa, total_usd = v_monto_operativo WHERE id = NEW.id;
      END IF;

      -- FIX: se agrega direccion='entrada'. Antes quedaba NULL y la UI
      -- de Caja/Bancos mostraba el cobro con tarjeta como si fuera un
      -- egreso (rojo, con signo negativo) porque 'tarjeta' no estaba en
      -- el whitelist de tipos que esa pantalla trata como ingreso.
      INSERT INTO transacciones_banco(empresa_id,cuenta_banco_id,tipo,monto,descripcion,ref_factura_id,asiento_id,fecha,direccion)
      VALUES(NEW.empresa_id, v_cuenta_banco_id,
        CASE NEW.tipo_pago WHEN 'cheque' THEN 'cheque' WHEN 'tarjeta' THEN 'tarjeta' ELSE 'transferencia' END,
        v_monto_operativo,
        'Cobro ' || NEW.tipo_pago || ' - ' || NEW.numero_factura || ' - ' || NEW.cliente_nombre ||
        CASE WHEN v_tasa IS NOT NULL THEN ' (C$' || NEW.total || ' @ ' || v_tasa || ')' ELSE '' END,
        NEW.id, v_asiento_id, NEW.fecha_emision, 'entrada');
    END IF;
  END IF;

  PERFORM fn_costear_linea_venta(df.id)
  FROM detalle_facturas df
  WHERE df.factura_id = NEW.id;

  RETURN NEW;
END;
$function$;


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
  v_cuenta_moneda         TEXT;
  v_tasa                  NUMERIC;
  v_monto_operativo       NUMERIC;
BEGIN
  IF NEW.estado <> 'recibida' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.estado = 'recibida' THEN RETURN NEW; END IF;
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

  IF COALESCE(NEW.retencion_ir, 0) > 0 THEN
    v_retencion_ir := NEW.retencion_ir;
  ELSIF v_tipo_persona = 'natural' AND NEW.retencion_codigo IS NULL AND NEW.subtotal > 1000 THEN
    v_retencion_ir := ROUND(NEW.subtotal * 0.02, 2);
  ELSE
    v_retencion_ir := 0;
  END IF;
  v_total_a_pagar := NEW.total - v_retencion_ir;

  UPDATE compras SET retencion_ir=v_retencion_ir, total_a_pagar=v_total_a_pagar,
    retencion_codigo = COALESCE(NEW.retencion_codigo, CASE WHEN v_retencion_ir > 0 THEN '22' ELSE NULL END)
  WHERE id=NEW.id;

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
    VALUES (v_asiento_id, v_retencion_ir_id, 'Retención IR - '||NEW.numero_compra, 0, v_retencion_ir, 4, NEW.empresa_id);
  END IF;

  IF NEW.tipo_pago = 'contado' THEN
    v_cuenta_caja_id := NEW.cuenta_caja_id;
    IF v_cuenta_caja_id IS NULL THEN
      SELECT id INTO v_cuenta_caja_id FROM cuentas_caja
      WHERE empresa_id=NEW.empresa_id AND activa=true
      ORDER BY tipo='caja_general' DESC, created_at LIMIT 1;
    END IF;
    IF v_cuenta_caja_id IS NOT NULL THEN
      SELECT moneda INTO v_cuenta_moneda FROM cuentas_caja WHERE id = v_cuenta_caja_id;
      v_tasa := NULL;
      v_monto_operativo := v_total_a_pagar;
      IF v_cuenta_moneda = 'USD' THEN
        v_tasa := COALESCE(NEW.tasa_cambio, fn_tasa_cambio_vigente(NEW.empresa_id, NEW.fecha_compra));
        IF v_tasa IS NULL OR v_tasa <= 0 THEN
          RAISE EXCEPTION 'No hay tasa de cambio registrada para convertir el pago de % (C$%) a la caja en USD. Registra la tasa del día en Tasa de Cambio.', NEW.numero_compra, v_total_a_pagar;
        END IF;
        v_monto_operativo := ROUND(v_total_a_pagar / v_tasa, 2);
        UPDATE compras SET moneda = 'USD', tasa_cambio = v_tasa WHERE id = NEW.id;
      END IF;

      INSERT INTO movimientos_caja(empresa_id,cuenta_caja_id,tipo,monto,descripcion,ref_compra_id,asiento_id,fecha)
      VALUES(NEW.empresa_id, v_cuenta_caja_id, 'egreso', v_monto_operativo,
        'Pago contado '||NEW.numero_compra ||
        CASE WHEN v_tasa IS NOT NULL THEN ' (C$' || v_total_a_pagar || ' @ ' || v_tasa || ')' ELSE '' END,
        NEW.id, v_asiento_id, NEW.fecha_compra);
    END IF;

  ELSIF NEW.tipo_pago IN ('transferencia','cheque','tarjeta') THEN
    v_cuenta_banco_id := NEW.cuenta_banco_id;
    IF v_cuenta_banco_id IS NULL THEN
      SELECT id INTO v_cuenta_banco_id FROM cuentas_banco
      WHERE empresa_id=NEW.empresa_id AND activa=true ORDER BY created_at LIMIT 1;
    END IF;
    IF v_cuenta_banco_id IS NOT NULL THEN
      SELECT moneda INTO v_cuenta_moneda FROM cuentas_banco WHERE id = v_cuenta_banco_id;
      v_tasa := NULL;
      v_monto_operativo := v_total_a_pagar;
      IF v_cuenta_moneda = 'USD' THEN
        v_tasa := COALESCE(NEW.tasa_cambio, fn_tasa_cambio_vigente(NEW.empresa_id, NEW.fecha_compra));
        IF v_tasa IS NULL OR v_tasa <= 0 THEN
          RAISE EXCEPTION 'No hay tasa de cambio registrada para convertir el pago de % (C$%) a la cuenta bancaria en USD. Registra la tasa del día en Tasa de Cambio.', NEW.numero_compra, v_total_a_pagar;
        END IF;
        v_monto_operativo := ROUND(v_total_a_pagar / v_tasa, 2);
        UPDATE compras SET moneda = 'USD', tasa_cambio = v_tasa WHERE id = NEW.id;
      END IF;

      -- FIX: se agrega direccion='salida' (pago a proveedor, sale dinero
      -- del banco), consistente con el fix aplicado a fn_contabilizar_factura.
      INSERT INTO transacciones_banco(empresa_id,cuenta_banco_id,tipo,monto,descripcion,ref_compra_id,asiento_id,fecha,direccion)
      VALUES(NEW.empresa_id, v_cuenta_banco_id,
        CASE NEW.tipo_pago WHEN 'cheque' THEN 'cheque' WHEN 'tarjeta' THEN 'tarjeta' ELSE 'transferencia' END,
        v_monto_operativo,
        'Pago '||NEW.tipo_pago||' - '||NEW.numero_compra ||
        CASE WHEN v_tasa IS NOT NULL THEN ' (C$' || v_total_a_pagar || ' @ ' || v_tasa || ')' ELSE '' END,
        NEW.id, v_asiento_id, NEW.fecha_compra, 'salida')
      RETURNING id INTO v_transaccion_id;

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
          v_monto_operativo, v_proveedor_nombre, NEW.fecha_compra,
          NEW.id, v_transaccion_id, 'activo',
          'Cheque emitido por compra '||NEW.numero_compra
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


-- Backfill: filas que ya quedaron con direccion NULL por este bug
-- (ventas/compras registradas entre el fix de la columna el 2026-06-29
-- y este fix del trigger).
UPDATE transacciones_banco
SET direccion = CASE
  WHEN ref_factura_id IS NOT NULL THEN 'entrada'
  WHEN ref_compra_id  IS NOT NULL THEN 'salida'
  WHEN tipo IN ('cheque','egreso','retiro','pago','transferencia_salida') THEN 'salida'
  WHEN tipo IN ('deposito','ingreso','cobro','deposito_cheque') THEN 'entrada'
  ELSE 'salida'
END
WHERE direccion IS NULL;
