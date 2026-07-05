-- ============================================================
-- Punto de Venta (4/5): fixes de caja para ventas y devoluciones
-- ============================================================
-- Bug 1: fn_contabilizar_factura nunca escribía sesion_caja_id en
-- movimientos_caja (columna agregada en la migración anterior), así
-- que un cierre de turno no podía atribuir con exactitud una venta
-- en efectivo a la sesión que la generó.
--
-- Bug 2: fn_contabilizar_nota_credito solo generaba el asiento
-- contable (asientos_detalle) de una devolución, pero NUNCA insertaba
-- en movimientos_caja ni tocaba cuentas_caja.saldo_actual. Una
-- devolución en efectivo no bajaba el efectivo esperado en caja, así
-- que el arqueo cerraría "sobrante" por el monto devuelto. Se deja
-- fuera de este fix el caso de devolución por transferencia/cheque/
-- tarjeta: fn_actualizar_saldo_banco (20260627193809) decide
-- ingreso/egreso mirando si ref_factura_id o ref_compra_id están
-- seteados, no la dirección real — anexar ahí una reversa de banco
-- requeriría revisar esa lógica aparte; no es necesario para el
-- arqueo de caja en efectivo que pide el POS.
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
      INSERT INTO movimientos_caja(empresa_id,cuenta_caja_id,tipo,monto,descripcion,ref_factura_id,asiento_id,fecha,sesion_caja_id)
      VALUES(NEW.empresa_id, v_cuenta_caja_id, 'ingreso', NEW.total,
        'Venta contado ' || NEW.numero_factura || ' - ' || NEW.cliente_nombre,
        NEW.id, v_asiento_id, NEW.fecha_emision, NEW.sesion_caja_id);
    END IF;

  ELSIF NEW.tipo_pago IN ('transferencia','cheque','tarjeta') THEN
    v_cuenta_banco_id := NEW.cuenta_banco_id;
    IF v_cuenta_banco_id IS NULL THEN
      SELECT id INTO v_cuenta_banco_id FROM cuentas_banco
      WHERE empresa_id=NEW.empresa_id AND activa=true ORDER BY created_at LIMIT 1;
    END IF;
    IF v_cuenta_banco_id IS NOT NULL THEN
      INSERT INTO transacciones_banco(empresa_id,cuenta_banco_id,tipo,monto,descripcion,ref_factura_id,asiento_id,fecha)
      VALUES(NEW.empresa_id, v_cuenta_banco_id,
        CASE NEW.tipo_pago WHEN 'cheque' THEN 'cheque' WHEN 'tarjeta' THEN 'tarjeta' ELSE 'transferencia' END,
        NEW.total,
        'Cobro ' || NEW.tipo_pago || ' - ' || NEW.numero_factura || ' - ' || NEW.cliente_nombre,
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

-- ================================================================
-- Nota de Crédito → ahora también registra el movimiento de caja
-- operativo (movimientos_caja) cuando la devolución es en efectivo,
-- además del asiento contable que ya generaba.
-- ================================================================
CREATE OR REPLACE FUNCTION fn_contabilizar_nota_credito()
RETURNS TRIGGER AS $$
DECLARE
  v_asiento_id   UUID;
  v_numero       INT;
  v_anio         INT; v_mes INT;
  v_num_str      TEXT;
  v_dev_ventas   UUID;  -- 4.1.03
  v_iva_deb      UUID;  -- 2.1.03
  v_contrapartida UUID; -- CxC o Caja según tipo_pago de la factura origen
  v_tipo_pago    TEXT;
  v_caja_id      UUID;  -- 1.1.01
  v_banco_id     UUID;  -- cuenta contable del banco usado
  v_cxc_id       UUID;  -- 1.1.05
  v_cuenta_caja_operativa UUID; -- cuentas_caja.id (no plan_cuentas) para el egreso físico
BEGIN
  -- Solo NC
  IF NEW.tipo <> 'credito' THEN RETURN NEW; END IF;

  -- Evitar duplicados
  IF EXISTS (
    SELECT 1 FROM asientos_contables
    WHERE empresa_id = NEW.empresa_id
      AND referencia_tipo = 'nota_credito'
      AND referencia_id = NEW.id
      AND estado <> 'anulado'
  ) THEN RETURN NEW; END IF;

  v_anio := EXTRACT(YEAR  FROM NEW.fecha)::INT;
  v_mes  := EXTRACT(MONTH FROM NEW.fecha)::INT;
  v_numero  := get_next_numero_asiento(NEW.empresa_id, v_anio, v_mes);
  v_num_str := 'AST-' || LPAD(v_anio::TEXT,4,'0') || '-'
                       || LPAD(v_mes::TEXT,2,'0')  || '-'
                       || LPAD(v_numero::TEXT,4,'0');

  -- Cuentas
  v_dev_ventas := get_cuenta_id(NEW.empresa_id, '4.1.03');
  v_iva_deb    := get_cuenta_id(NEW.empresa_id, '2.1.03');
  v_cxc_id     := get_cuenta_id(NEW.empresa_id, '1.1.05');
  v_caja_id    := get_cuenta_id(NEW.empresa_id, '1.1.01');

  IF v_dev_ventas IS NULL THEN RETURN NEW; END IF;

  -- Resolver contrapartida según tipo_pago de la factura origen
  IF NEW.ref_factura_id IS NOT NULL THEN
    SELECT f.tipo_pago INTO v_tipo_pago
    FROM facturas f WHERE f.id = NEW.ref_factura_id;

    IF v_tipo_pago IN ('transferencia','cheque','tarjeta') THEN
      -- Usar cuenta contable del banco vinculado a la factura
      SELECT cb.cuenta_contable_id INTO v_banco_id
      FROM facturas f
      JOIN cuentas_banco cb ON cb.id = f.cuenta_banco_id
      WHERE f.id = NEW.ref_factura_id;
      -- Fallback: primera cuenta banco activa
      IF v_banco_id IS NULL THEN
        SELECT cb.cuenta_contable_id INTO v_banco_id
        FROM cuentas_banco cb
        WHERE cb.empresa_id = NEW.empresa_id AND cb.activa = true
        ORDER BY cb.created_at LIMIT 1;
      END IF;
      v_contrapartida := COALESCE(v_banco_id, v_caja_id);
    ELSIF v_tipo_pago = 'credito' THEN
      v_contrapartida := v_cxc_id;
    ELSE
      v_contrapartida := v_caja_id;
    END IF;
  ELSE
    v_contrapartida := v_cxc_id; -- default: reduce CxC
  END IF;

  IF v_contrapartida IS NULL THEN v_contrapartida := v_cxc_id; END IF;

  -- Crear asiento
  INSERT INTO asientos_contables (
    empresa_id, fecha, descripcion, concepto, tipo,
    referencia_tipo, referencia_id, referencia_num,
    numero_asiento, numero, periodo_anio, periodo_mes,
    estado, total_debe, total_haber
  ) VALUES (
    NEW.empresa_id, NEW.fecha,
    'Nota de Crédito ' || NEW.numero_nota || ' — ' || NEW.motivo,
    'NC ' || NEW.numero_nota,
    'egreso', 'nota_credito', NEW.id, NEW.numero_nota,
    v_num_str, v_numero, v_anio, v_mes,
    'aprobado', NEW.total, NEW.total
  ) RETURNING id INTO v_asiento_id;

  -- DB 4.1.03 Devoluciones en Ventas
  INSERT INTO asientos_detalle (asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
  VALUES (v_asiento_id, v_dev_ventas,
    'Devolución venta NC ' || NEW.numero_nota, NEW.subtotal, 0, 1, NEW.empresa_id);

  -- DB 2.1.03 IVA Débito Fiscal (reversa)
  IF NEW.iva > 0 AND v_iva_deb IS NOT NULL THEN
    INSERT INTO asientos_detalle (asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
    VALUES (v_asiento_id, v_iva_deb,
      'IVA s/devolución NC ' || NEW.numero_nota, NEW.iva, 0, 2, NEW.empresa_id);
  END IF;

  -- CR contrapartida (CxC, Caja o Banco)
  INSERT INTO asientos_detalle (asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
  VALUES (v_asiento_id, v_contrapartida,
    'Crédito a cliente NC ' || NEW.numero_nota, 0, NEW.total, 3, NEW.empresa_id);

  -- ── Egreso físico de caja cuando la devolución es en efectivo ──
  -- (fix: antes esto solo movía el asiento contable, nunca el
  -- movimiento operativo, así que el arqueo no bajaba el efectivo)
  IF v_tipo_pago = 'contado' THEN
    IF NEW.sesion_caja_id IS NOT NULL THEN
      SELECT cuenta_caja_id INTO v_cuenta_caja_operativa
      FROM sesiones_caja WHERE id = NEW.sesion_caja_id;
    END IF;
    IF v_cuenta_caja_operativa IS NULL AND NEW.ref_factura_id IS NOT NULL THEN
      SELECT cuenta_caja_id INTO v_cuenta_caja_operativa
      FROM facturas WHERE id = NEW.ref_factura_id;
    END IF;
    IF v_cuenta_caja_operativa IS NULL THEN
      SELECT id INTO v_cuenta_caja_operativa FROM cuentas_caja
      WHERE empresa_id = NEW.empresa_id AND activa = true
      ORDER BY tipo='caja_general' DESC, created_at LIMIT 1;
    END IF;
    IF v_cuenta_caja_operativa IS NOT NULL THEN
      INSERT INTO movimientos_caja(empresa_id,cuenta_caja_id,tipo,monto,descripcion,ref_factura_id,asiento_id,fecha,sesion_caja_id)
      VALUES(NEW.empresa_id, v_cuenta_caja_operativa, 'egreso', NEW.total,
        'Devolución NC ' || NEW.numero_nota, NEW.ref_factura_id, v_asiento_id, NEW.fecha, NEW.sesion_caja_id);
    END IF;
  END IF;

  -- Guardar asiento_id en la nota
  UPDATE notas_credito_debito SET asiento_id = v_asiento_id WHERE id = NEW.id;

  -- Inventario: restaurar stock por cada ítem de la NC
  -- (solo si tiene detalles con producto_id)
  PERFORM fn_nc_restaurar_inventario(NEW.id, NEW.empresa_id, NEW.numero_nota);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
