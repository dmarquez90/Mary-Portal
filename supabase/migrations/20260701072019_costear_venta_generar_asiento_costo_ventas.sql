
-- ============================================================
-- Fix: fn_mover_stock_salida() descontaba el stock físico en cada
-- venta pero nunca generaba el asiento de Costo de Ventas (débito
-- 5.1.01 / crédito 1.1.08). Resultado: la Utilidad Bruta del Estado
-- de Resultados no restaba el costo de lo vendido y el Inventario
-- del Balance General quedaba sobrevaluado (nunca se acreditaba).
--
-- Método de costeo: costo unitario = productos.precio_compra
-- (costo del último precio de compra registrado; no hay FIFO/
-- promedio ponderado implementado en el sistema).
--
-- Cubre los dos flujos de emisión de factura que existen en la app:
--  A) Factura insertada directamente con estado='emitida'
--     (src/app/dashboard/ventas/nueva/page.tsx): el asiento de venta
--     se crea ANTES de insertar detalle_facturas → se costea vía
--     trigger AFTER INSERT sobre detalle_facturas.
--  B) Factura creada como 'borrador' y luego actualizada a 'emitida':
--     detalle_facturas ya existe cuando se crea el asiento → se
--     costea desde dentro de fn_contabilizar_factura, iterando las
--     líneas ya existentes.
-- Ambos caminos son mutuamente excluyentes en el tiempo respecto al
-- momento en que se crea el asiento, así que no hay doble conteo.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_costear_linea_venta(p_detalle_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_detalle         RECORD;
  v_empresa_id      UUID;
  v_numero_factura  TEXT;
  v_precio_compra   NUMERIC;
  v_costo           NUMERIC;
  v_asiento_id      UUID;
  v_cuenta_costo_id UUID;
  v_cuenta_inv_id   UUID;
  v_max_orden       INT;
BEGIN
  SELECT * INTO v_detalle FROM detalle_facturas WHERE id = p_detalle_id;
  IF NOT FOUND OR v_detalle.producto_id IS NULL THEN
    RETURN;
  END IF;

  SELECT empresa_id, numero_factura INTO v_empresa_id, v_numero_factura
  FROM facturas WHERE id = v_detalle.factura_id;
  IF v_empresa_id IS NULL THEN
    RETURN;
  END IF;

  -- ¿Ya existe un asiento aprobado para esta factura?
  SELECT id INTO v_asiento_id
  FROM asientos_contables
  WHERE empresa_id = v_empresa_id
    AND referencia_tipo = 'factura'
    AND referencia_id = v_detalle.factura_id
    AND estado <> 'anulado'
  ORDER BY created_at DESC LIMIT 1;

  IF v_asiento_id IS NULL THEN
    RETURN; -- factura aún no contabilizada (borrador); se costeará al emitirse
  END IF;

  -- Evitar doble conteo si esta línea ya fue costeada antes
  IF EXISTS (
    SELECT 1 FROM asientos_detalle
    WHERE asiento_id = v_asiento_id
      AND descripcion = 'Costo de venta - línea ' || v_detalle.id::TEXT
  ) THEN
    RETURN;
  END IF;

  SELECT precio_compra INTO v_precio_compra
  FROM productos WHERE id = v_detalle.producto_id AND empresa_id = v_empresa_id;

  v_costo := ROUND(COALESCE(v_precio_compra, 0) * v_detalle.cantidad, 2);
  IF v_costo <= 0 THEN
    RETURN;
  END IF;

  SELECT id INTO v_cuenta_costo_id FROM plan_cuentas WHERE empresa_id=v_empresa_id AND codigo='5.1.01' AND activa=true LIMIT 1;
  SELECT id INTO v_cuenta_inv_id   FROM plan_cuentas WHERE empresa_id=v_empresa_id AND codigo='1.1.08' AND activa=true LIMIT 1;
  IF v_cuenta_costo_id IS NULL OR v_cuenta_inv_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(MAX(orden), 0) INTO v_max_orden FROM asientos_detalle WHERE asiento_id = v_asiento_id;

  INSERT INTO asientos_detalle (asiento_id, cuenta_id, descripcion, debe, haber, orden, empresa_id)
  VALUES
    (v_asiento_id, v_cuenta_costo_id, 'Costo de venta - línea ' || v_detalle.id::TEXT || ' (' || COALESCE(v_numero_factura,'') || ')', v_costo, 0, v_max_orden + 1, v_empresa_id),
    (v_asiento_id, v_cuenta_inv_id,   'Salida de inventario - línea ' || v_detalle.id::TEXT || ' (' || COALESCE(v_numero_factura,'') || ')', 0, v_costo, v_max_orden + 2, v_empresa_id);

  UPDATE asientos_contables
  SET total_debe  = total_debe  + v_costo,
      total_haber = total_haber + v_costo
  WHERE id = v_asiento_id;
END;
$function$;

-- Trigger para el flujo A (factura ya emitida cuando se insertan las líneas)
CREATE OR REPLACE FUNCTION public.fn_costear_venta()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  PERFORM fn_costear_linea_venta(NEW.id);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_costear_venta ON detalle_facturas;
CREATE TRIGGER trg_costear_venta
  AFTER INSERT ON detalle_facturas
  FOR EACH ROW EXECUTE FUNCTION fn_costear_venta();

-- Flujo B (líneas ya existían como borrador; se costean al contabilizar la factura)
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
      INSERT INTO movimientos_caja(empresa_id,cuenta_caja_id,tipo,monto,descripcion,ref_factura_id,asiento_id,fecha)
      VALUES(NEW.empresa_id, v_cuenta_caja_id, 'ingreso', NEW.total,
        'Venta contado ' || NEW.numero_factura || ' - ' || NEW.cliente_nombre,
        NEW.id, v_asiento_id, NEW.fecha_emision);
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
