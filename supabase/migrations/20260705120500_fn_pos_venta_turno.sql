-- ============================================================
-- Punto de Venta (5/5): funciones atómicas de venta y turno
-- ============================================================
-- Las tres funciones son SECURITY DEFINER (como fn_crear_empresa_usuario):
-- ejecutan con privilegios de postgres (bypassa RLS), así que la
-- ÚNICA barrera de autorización es la verificación explícita de
-- fn_tiene_permiso() al inicio de cada una. Esto es necesario porque
-- las políticas RLS de sesiones_caja/cuentas_caja/movimientos_caja
-- exigen 'caja_bancos_ver'/'caja_bancos_editar', permiso que el rol
-- 'cajero' NO tiene (por diseño, ver migración de permisos) — sin
-- estas funciones, un cajero no podría ni abrir su propio turno.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1) Abrir turno de caja
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_abrir_turno_pos(
  p_empresa_id UUID,
  p_cuenta_caja_id UUID,
  p_monto_apertura NUMERIC,
  p_notas TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_sesion_id UUID;
BEGIN
  IF NOT (fn_tiene_permiso(v_actor, p_empresa_id, 'pos_caja_propia')
          OR fn_tiene_permiso(v_actor, p_empresa_id, 'caja_bancos_editar')) THEN
    RAISE EXCEPTION 'No tienes permiso para abrir un turno de caja';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM cuentas_caja WHERE id = p_cuenta_caja_id AND empresa_id = p_empresa_id AND activa = true
  ) THEN
    RAISE EXCEPTION 'La cuenta de caja no existe o no está activa';
  END IF;

  IF EXISTS (
    SELECT 1 FROM sesiones_caja
    WHERE cuenta_caja_id = p_cuenta_caja_id AND estado = 'abierta'
  ) THEN
    RAISE EXCEPTION 'Ya hay un turno abierto en esa caja';
  END IF;

  IF p_monto_apertura IS NULL OR p_monto_apertura < 0 THEN
    RAISE EXCEPTION 'Monto de apertura inválido';
  END IF;

  INSERT INTO sesiones_caja (empresa_id, cuenta_caja_id, monto_apertura, notas, created_by)
  VALUES (p_empresa_id, p_cuenta_caja_id, p_monto_apertura, p_notas, v_actor)
  RETURNING id INTO v_sesion_id;

  RETURN v_sesion_id;
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 2) Cerrar turno de caja (arqueo)
-- ────────────────────────────────────────────────────────────
-- p_denominaciones: objeto jsonb con las mismas claves que las
-- columnas denom_* de sesiones_caja (ej. {"denom_500": 3, "denom_usd_20": 1}).
-- p_monto_fisico_total: total contado ya convertido a córdobas
-- (el cliente ya hace esta suma, igual que hoy en arqueos/page.tsx).
CREATE OR REPLACE FUNCTION fn_cerrar_turno_pos(
  p_sesion_id UUID,
  p_denominaciones JSONB,
  p_monto_fisico_total NUMERIC,
  p_tasa_usd NUMERIC DEFAULT NULL,
  p_notas TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_sesion RECORD;
  v_ingresos NUMERIC;
  v_egresos NUMERIC;
  v_sistema NUMERIC;
BEGIN
  SELECT * INTO v_sesion FROM sesiones_caja WHERE id = p_sesion_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La sesión de caja no existe';
  END IF;
  IF v_sesion.estado <> 'abierta' THEN
    RAISE EXCEPTION 'Esa sesión ya está cerrada';
  END IF;
  IF v_sesion.created_by <> v_actor
     AND NOT fn_tiene_permiso(v_actor, v_sesion.empresa_id, 'caja_bancos_editar') THEN
    RAISE EXCEPTION 'No puedes cerrar el turno de otro cajero';
  END IF;

  -- Fix: el cálculo anterior (arqueos/page.tsx) sumaba movimientos_caja de
  -- TODA la empresa por fecha, sin filtrar por cuenta_caja_id — con una
  -- sola caja no se notaba, pero con varias cajas simultáneas mezclaba el
  -- efectivo de una caja con el de otra. Aquí se filtra por la caja física
  -- exacta de esta sesión.
  SELECT
    COALESCE(SUM(monto) FILTER (WHERE tipo = 'ingreso'), 0),
    COALESCE(SUM(monto) FILTER (WHERE tipo = 'egreso'), 0)
  INTO v_ingresos, v_egresos
  FROM movimientos_caja
  WHERE cuenta_caja_id = v_sesion.cuenta_caja_id
    AND estado = 'registrado'
    AND created_at >= v_sesion.fecha_apertura;

  v_sistema := v_sesion.monto_apertura + v_ingresos - v_egresos;

  UPDATE sesiones_caja SET
    fecha_cierre         = now(),
    monto_cierre_sistema = v_sistema,
    monto_cierre_fisico  = p_monto_fisico_total,
    estado               = 'cerrada',
    notas                = COALESCE(p_notas, notas),
    tasa_usd             = p_tasa_usd,
    denom_500    = COALESCE((p_denominaciones->>'denom_500')::INT, 0),
    denom_200    = COALESCE((p_denominaciones->>'denom_200')::INT, 0),
    denom_100    = COALESCE((p_denominaciones->>'denom_100')::INT, 0),
    denom_50     = COALESCE((p_denominaciones->>'denom_50')::INT, 0),
    denom_20     = COALESCE((p_denominaciones->>'denom_20')::INT, 0),
    denom_10     = COALESCE((p_denominaciones->>'denom_10')::INT, 0),
    denom_5      = COALESCE((p_denominaciones->>'denom_5')::INT, 0),
    denom_1      = COALESCE((p_denominaciones->>'denom_1')::INT, 0),
    denom_050    = COALESCE((p_denominaciones->>'denom_050')::INT, 0),
    denom_usd_100 = COALESCE((p_denominaciones->>'denom_usd_100')::INT, 0),
    denom_usd_50  = COALESCE((p_denominaciones->>'denom_usd_50')::INT, 0),
    denom_usd_20  = COALESCE((p_denominaciones->>'denom_usd_20')::INT, 0),
    denom_usd_10  = COALESCE((p_denominaciones->>'denom_usd_10')::INT, 0),
    denom_usd_5   = COALESCE((p_denominaciones->>'denom_usd_5')::INT, 0),
    denom_usd_1   = COALESCE((p_denominaciones->>'denom_usd_1')::INT, 0)
  WHERE id = p_sesion_id;

  RETURN jsonb_build_object(
    'monto_cierre_sistema', v_sistema,
    'monto_cierre_fisico', p_monto_fisico_total,
    'diferencia', p_monto_fisico_total - v_sistema
  );
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 3) Registrar venta de mostrador (atómica)
-- ────────────────────────────────────────────────────────────
-- p_items: jsonb array de {producto_id, descripcion, cantidad,
-- precio_unitario, descuento_pct, aplica_iva}. Inserta cabecera +
-- detalle en una sola transacción — si algo falla (ej. stock
-- insuficiente vía fn_validar_stock_factura), toda la venta se
-- revierte, incluida la factura huérfana que el flujo client-side
-- actual sí podía llegar a dejar.
CREATE OR REPLACE FUNCTION fn_registrar_venta_pos(
  p_empresa_id UUID,
  p_sesion_caja_id UUID,
  p_cliente_id UUID,
  p_cliente_nombre TEXT,
  p_tipo_pago TEXT,
  p_items JSONB,
  p_monto_recibido NUMERIC DEFAULT NULL,
  p_notas TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_sesion RECORD;
  v_cons RECORD;
  v_numero INT;
  v_numero_factura TEXT;
  v_item JSONB;
  v_cantidad NUMERIC; v_precio NUMERIC; v_desc_pct NUMERIC; v_aplica_iva BOOLEAN;
  v_sub NUMERIC; v_iva_linea NUMERIC;
  v_subtotal NUMERIC := 0;
  v_iva_total NUMERIC := 0;
  v_descuento_total NUMERIC := 0;
  v_factura RECORD;
  v_cambio NUMERIC;
BEGIN
  IF NOT fn_tiene_permiso(v_actor, p_empresa_id, 'pos_vender') THEN
    RAISE EXCEPTION 'No tienes permiso para vender desde el POS';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'La venta no tiene ítems';
  END IF;

  SELECT * INTO v_sesion FROM sesiones_caja
  WHERE id = p_sesion_caja_id AND empresa_id = p_empresa_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La sesión de caja no existe';
  END IF;
  IF v_sesion.estado <> 'abierta' THEN
    RAISE EXCEPTION 'Tu turno de caja ya está cerrado';
  END IF;
  IF v_sesion.created_by <> v_actor THEN
    RAISE EXCEPTION 'No puedes vender contra el turno de otro cajero';
  END IF;

  -- Totales (misma fórmula que ventas/nueva/page.tsx: calcLinea)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_cantidad   := (v_item->>'cantidad')::NUMERIC;
    v_precio     := (v_item->>'precio_unitario')::NUMERIC;
    v_desc_pct   := COALESCE((v_item->>'descuento_pct')::NUMERIC, 0);
    v_aplica_iva := COALESCE((v_item->>'aplica_iva')::BOOLEAN, true);
    IF v_cantidad IS NULL OR v_cantidad <= 0 OR v_precio IS NULL THEN
      RAISE EXCEPTION 'Ítem inválido en la venta';
    END IF;
    v_sub := v_cantidad * v_precio * (1 - v_desc_pct / 100);
    v_iva_linea := CASE WHEN v_aplica_iva THEN v_sub * 0.15 ELSE 0 END;
    v_subtotal := v_subtotal + v_sub;
    v_iva_total := v_iva_total + v_iva_linea;
    v_descuento_total := v_descuento_total + v_cantidad * v_precio * (v_desc_pct / 100);
  END LOOP;

  -- Consecutivo con bloqueo real (fix de la race condition del
  -- patrón anterior: leer -> calcular -> actualizar desde el cliente)
  INSERT INTO consecutivos (empresa_id, tipo, ultimo, prefijo, digitos)
  VALUES (p_empresa_id, 'factura', 0, 'F', 6)
  ON CONFLICT (empresa_id, tipo) DO NOTHING;

  SELECT * INTO v_cons FROM consecutivos
  WHERE empresa_id = p_empresa_id AND tipo = 'factura'
  FOR UPDATE;

  v_numero := v_cons.ultimo + 1;
  UPDATE consecutivos SET ultimo = v_numero, updated_at = now() WHERE id = v_cons.id;
  v_numero_factura := v_cons.prefijo || '-' || LPAD(v_numero::TEXT, v_cons.digitos, '0');

  -- Cabecera (dispara fn_contabilizar_factura vía trigger AFTER INSERT)
  INSERT INTO facturas (
    empresa_id, numero_factura, cliente_id, cliente_nombre,
    fecha_emision, tipo_pago, estado,
    subtotal, descuento_total, iva_total, total, notas,
    cuenta_caja_id, sesion_caja_id, monto_recibido, cambio_entregado
  ) VALUES (
    p_empresa_id, v_numero_factura, p_cliente_id, COALESCE(NULLIF(p_cliente_nombre, ''), 'Consumidor final'),
    CURRENT_DATE, p_tipo_pago, 'emitida',
    v_subtotal, v_descuento_total, v_iva_total, v_subtotal + v_iva_total, p_notas,
    v_sesion.cuenta_caja_id, p_sesion_caja_id,
    p_monto_recibido,
    CASE WHEN p_monto_recibido IS NOT NULL THEN GREATEST(p_monto_recibido - (v_subtotal + v_iva_total), 0) ELSE NULL END
  ) RETURNING * INTO v_factura;

  -- Detalle (dispara triggers de stock/costeo por cada línea; si una
  -- línea falla por stock insuficiente, la excepción revierte TODA la
  -- venta, incluida la cabecera recién insertada)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_cantidad   := (v_item->>'cantidad')::NUMERIC;
    v_precio     := (v_item->>'precio_unitario')::NUMERIC;
    v_desc_pct   := COALESCE((v_item->>'descuento_pct')::NUMERIC, 0);
    v_aplica_iva := COALESCE((v_item->>'aplica_iva')::BOOLEAN, true);
    v_sub := v_cantidad * v_precio * (1 - v_desc_pct / 100);
    v_iva_linea := CASE WHEN v_aplica_iva THEN v_sub * 0.15 ELSE 0 END;

    INSERT INTO detalle_facturas (
      factura_id, producto_id, descripcion, cantidad, precio_unitario,
      descuento_pct, subtotal, iva, total
    ) VALUES (
      v_factura.id,
      NULLIF(v_item->>'producto_id', '')::UUID,
      v_item->>'descripcion',
      v_cantidad, v_precio, v_desc_pct, v_sub, v_iva_linea, v_sub + v_iva_linea
    );
  END LOOP;

  v_cambio := CASE WHEN p_monto_recibido IS NOT NULL THEN GREATEST(p_monto_recibido - v_factura.total, 0) ELSE NULL END;

  RETURN jsonb_build_object(
    'factura_id', v_factura.id,
    'numero_factura', v_factura.numero_factura,
    'subtotal', v_factura.subtotal,
    'iva_total', v_factura.iva_total,
    'total', v_factura.total,
    'monto_recibido', p_monto_recibido,
    'cambio', v_cambio
  );
END;
$$;

-- ────────────────────────────────────────────────────────────
-- 4) Registrar devolución de mostrador (atómica)
-- ────────────────────────────────────────────────────────────
-- Mismo problema de RLS que la venta: fn_contabilizar_nota_credito
-- inserta en asientos_contables/asientos_detalle/movimientos_caja, y
-- un 'cajero' no tiene 'asientos_crear' ni 'caja_bancos_editar'. Esta
-- función junta lo que hoy hacen POST /api/notas-credito-debito +
-- restaurarStockPorDevolucion + aplicarNotaCreditoAFactura
-- (src/lib/notas-credito.ts) en una sola transacción con su propio
-- chequeo de permiso ('pos_devolucion').
CREATE OR REPLACE FUNCTION fn_registrar_devolucion_pos(
  p_empresa_id UUID,
  p_sesion_caja_id UUID,
  p_ref_factura_id UUID,
  p_motivo TEXT,
  p_items JSONB -- [{producto_id, descripcion, cantidad, precio_unitario}]
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_sesion RECORD;
  v_cons RECORD;
  v_numero INT;
  v_numero_nota TEXT;
  v_item JSONB;
  v_subtotal NUMERIC := 0;
  v_iva NUMERIC := 0;
  v_nota RECORD;
  v_sub NUMERIC;
  v_factura RECORD;
  v_es_total BOOLEAN;
  v_nuevo_subtotal NUMERIC;
  v_nuevo_iva NUMERIC;
BEGIN
  IF NOT fn_tiene_permiso(v_actor, p_empresa_id, 'pos_devolucion') THEN
    RAISE EXCEPTION 'No tienes permiso para hacer devoluciones desde el POS';
  END IF;
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'La devolución no tiene ítems';
  END IF;

  SELECT * INTO v_sesion FROM sesiones_caja
  WHERE id = p_sesion_caja_id AND empresa_id = p_empresa_id;
  IF NOT FOUND OR v_sesion.estado <> 'abierta' OR v_sesion.created_by <> v_actor THEN
    RAISE EXCEPTION 'Necesitas tu turno de caja abierto para hacer la devolución';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_sub := (v_item->>'cantidad')::NUMERIC * (v_item->>'precio_unitario')::NUMERIC;
    v_subtotal := v_subtotal + v_sub;
    v_iva := v_iva + v_sub * 0.15;
  END LOOP;

  INSERT INTO consecutivos (empresa_id, tipo, ultimo, prefijo, digitos)
  VALUES (p_empresa_id, 'nota_credito', 0, 'NC', 6)
  ON CONFLICT (empresa_id, tipo) DO NOTHING;
  SELECT * INTO v_cons FROM consecutivos WHERE empresa_id = p_empresa_id AND tipo = 'nota_credito' FOR UPDATE;
  v_numero := v_cons.ultimo + 1;
  UPDATE consecutivos SET ultimo = v_numero, updated_at = now() WHERE id = v_cons.id;
  v_numero_nota := v_cons.prefijo || '-' || LPAD(v_numero::TEXT, v_cons.digitos, '0');

  -- El trigger fn_contabilizar_nota_credito corre aquí mismo (AFTER INSERT):
  -- genera el asiento contable y, si es en efectivo, el movimiento de caja.
  INSERT INTO notas_credito_debito (
    empresa_id, tipo, numero_nota, ref_factura_id, fecha, motivo,
    subtotal, iva, total, sesion_caja_id, created_by
  ) VALUES (
    p_empresa_id, 'credito', v_numero_nota, p_ref_factura_id, CURRENT_DATE, p_motivo,
    v_subtotal, v_iva, v_subtotal + v_iva, p_sesion_caja_id, v_actor
  ) RETURNING * INTO v_nota;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_sub := (v_item->>'cantidad')::NUMERIC * (v_item->>'precio_unitario')::NUMERIC;
    INSERT INTO detalle_notas (nota_id, producto_id, descripcion, cantidad, precio_unitario, subtotal, iva, total)
    VALUES (
      v_nota.id, NULLIF(v_item->>'producto_id', '')::UUID, v_item->>'descripcion',
      (v_item->>'cantidad')::NUMERIC, (v_item->>'precio_unitario')::NUMERIC,
      v_sub, v_sub * 0.15, v_sub * 1.15
    );

    IF NULLIF(v_item->>'producto_id', '') IS NOT NULL THEN
      UPDATE productos SET stock_actual = stock_actual + (v_item->>'cantidad')::NUMERIC, updated_at = now()
      WHERE id = (v_item->>'producto_id')::UUID AND empresa_id = p_empresa_id;

      INSERT INTO movimientos_inventario (empresa_id, producto_id, tipo, cantidad, stock_antes, stock_despues, costo_unitario, referencia, notas)
      SELECT p_empresa_id, (v_item->>'producto_id')::UUID, 'entrada', (v_item->>'cantidad')::NUMERIC,
             stock_actual - (v_item->>'cantidad')::NUMERIC, stock_actual, (v_item->>'precio_unitario')::NUMERIC,
             v_numero_nota, 'Devolución POS ' || v_numero_nota
      FROM productos WHERE id = (v_item->>'producto_id')::UUID AND empresa_id = p_empresa_id;
    END IF;
  END LOOP;

  -- Reflejar el efecto en la factura origen: anularla si la NC cubre
  -- >=95% del total, o descontar sus totales si es parcial (mismo
  -- criterio que aplicarNotaCreditoAFactura en src/lib/notas-credito.ts)
  IF p_ref_factura_id IS NOT NULL THEN
    SELECT * INTO v_factura FROM facturas WHERE id = p_ref_factura_id;
    IF FOUND THEN
      v_es_total := v_nota.total >= v_factura.total * 0.95;
      IF v_es_total THEN
        UPDATE facturas SET estado = 'anulada',
          notas = COALESCE(notas || ' | ', '') || 'Anulada con ' || v_numero_nota
        WHERE id = p_ref_factura_id;
      ELSE
        v_nuevo_subtotal := v_factura.subtotal - v_nota.subtotal;
        v_nuevo_iva      := v_factura.iva_total - v_nota.iva;
        UPDATE facturas SET
          subtotal = v_nuevo_subtotal,
          iva_total = v_nuevo_iva,
          total = v_nuevo_subtotal + v_nuevo_iva,
          notas = COALESCE(notas || ' | ', '') || 'NC parcial ' || v_numero_nota
        WHERE id = p_ref_factura_id;
      END IF;
    END IF;
  END IF;

  UPDATE notas_credito_debito SET estado = 'aplicada' WHERE id = v_nota.id;

  RETURN jsonb_build_object('nota_id', v_nota.id, 'numero_nota', v_numero_nota, 'total', v_nota.total);
END;
$$;
