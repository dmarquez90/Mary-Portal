-- ============================================================
-- Multi-moneda (3/4): fn_contabilizar_factura convierte el lado
-- operativo cuando la cuenta caja/banco resuelta está en USD
-- ============================================================
-- El asiento contable (asientos_detalle) sigue en córdobas sin
-- cambios (NEW.total/subtotal/iva_total) — eso ya estaba correcto.
-- Lo que se corrige es movimientos_caja/transacciones_banco: antes
-- insertaban NEW.total crudo sin importar la moneda real de la
-- cuenta destino; ahora, si la cuenta es USD, se divide entre la
-- tasa de cambio (de la factura si ya la trae, si no la vigente vía
-- fn_tasa_cambio_vigente) y se guarda la tasa usada en la factura
-- para trazabilidad.
-- ============================================================

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
  IF OLD.estado = 'emitida'  THEN RETURN NEW; END IF;
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

  -- El asiento contable siempre se postea en córdobas (moneda funcional),
  -- sin importar la moneda de la cuenta que finalmente reciba el efectivo.
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

  -- ── Lado operativo: convierte a la moneda real de la cuenta destino ──
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

      INSERT INTO transacciones_banco(empresa_id,cuenta_banco_id,tipo,monto,descripcion,ref_factura_id,asiento_id,fecha)
      VALUES(NEW.empresa_id, v_cuenta_banco_id,
        CASE NEW.tipo_pago WHEN 'cheque' THEN 'cheque' WHEN 'tarjeta' THEN 'tarjeta' ELSE 'transferencia' END,
        v_monto_operativo,
        'Cobro ' || NEW.tipo_pago || ' - ' || NEW.numero_factura || ' - ' || NEW.cliente_nombre ||
        CASE WHEN v_tasa IS NOT NULL THEN ' (C$' || NEW.total || ' @ ' || v_tasa || ')' ELSE '' END,
        NEW.id, v_asiento_id, NEW.fecha_emision);
    END IF;
  END IF;

  -- ── Costeo de venta para líneas que ya existían (flujo borrador→emitida) ──
  PERFORM fn_costear_linea_venta(df.id)
  FROM detalle_facturas df
  WHERE df.factura_id = NEW.id;

  RETURN NEW;
END;
$function$;
