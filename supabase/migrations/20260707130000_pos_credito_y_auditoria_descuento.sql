-- ============================================================
-- 1) Crédito desde el POS + 2) Auditoría de autorización de
--    descuentos manuales / notas de crédito manuales.
-- ============================================================
-- Contexto: hoy el POS no ofrece "Crédito" como tipo de pago (solo
-- Ventas > Nueva lo permite), aunque un cliente tenga tipo='credito'.
-- Se agrega la opción validando que el cliente exista y tenga
-- tipo='credito'; el vencimiento se calcula automáticamente a 30
-- días (el POS es mostrador rápido, no pide fecha).
--
-- Además se agregan columnas de auditoría para dejar registro de qué
-- admin autorizó un descuento manual (Ventas) o una nota de crédito
-- manual (Notas de crédito/débito) — la verificación de contraseña
-- ocurre en /api/auth/verificar-descuento (no se puede hacer en SQL,
-- ahí no hay acceso a contraseñas).
-- ============================================================

ALTER TABLE facturas
  ADD COLUMN IF NOT EXISTS descuento_autorizado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS descuento_autorizado_en TIMESTAMPTZ;

ALTER TABLE notas_credito_debito
  ADD COLUMN IF NOT EXISTS descuento_autorizado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS descuento_autorizado_en TIMESTAMPTZ;

-- ── fn_pos_estado_inicial: incluir tipo/límite de crédito del cliente ──
CREATE OR REPLACE FUNCTION fn_pos_estado_inicial(p_empresa_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_sesion JSONB;
  v_cajas JSONB;
  v_productos JSONB;
  v_clientes JSONB;
BEGIN
  IF NOT fn_tiene_permiso(v_actor, p_empresa_id, 'pos_ver') THEN
    RAISE EXCEPTION 'No tienes permiso para ver el POS';
  END IF;

  SELECT to_jsonb(s) INTO v_sesion
  FROM sesiones_caja s
  WHERE s.empresa_id = p_empresa_id AND s.created_by = v_actor AND s.estado = 'abierta'
  ORDER BY s.fecha_apertura DESC LIMIT 1;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', cc.id, 'nombre', cc.nombre, 'tipo', cc.tipo,
    'ocupada', EXISTS(SELECT 1 FROM sesiones_caja sc WHERE sc.cuenta_caja_id = cc.id AND sc.estado = 'abierta')
  ) ORDER BY (cc.tipo = 'caja_general') DESC, cc.nombre), '[]'::jsonb)
  INTO v_cajas
  FROM cuentas_caja cc
  WHERE cc.empresa_id = p_empresa_id AND cc.activa = true;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', p.id, 'nombre', p.nombre, 'codigo', p.codigo, 'codigo_barra', p.codigo_barra,
    'precio_venta', p.precio_venta, 'stock_actual', p.stock_actual, 'aplica_iva', p.aplica_iva
  ) ORDER BY p.nombre), '[]'::jsonb)
  INTO v_productos
  FROM productos p
  WHERE p.empresa_id = p_empresa_id AND p.activo = true;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id, 'nombre', c.nombre, 'tipo', c.tipo, 'limite_credito', c.limite_credito
  ) ORDER BY c.nombre), '[]'::jsonb)
  INTO v_clientes
  FROM clientes c
  WHERE c.empresa_id = p_empresa_id AND c.activo = true;

  RETURN jsonb_build_object(
    'sesion_activa', v_sesion,
    'cajas', v_cajas,
    'productos', v_productos,
    'clientes', v_clientes
  );
END;
$$;

-- ── fn_registrar_venta_pos: soportar tipo_pago = 'credito' ──
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
  v_fecha_vencimiento DATE;
BEGIN
  IF NOT fn_tiene_permiso(v_actor, p_empresa_id, 'pos_vender') THEN
    RAISE EXCEPTION 'No tienes permiso para vender desde el POS';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'La venta no tiene ítems';
  END IF;

  -- Venta a crédito: exige un cliente real con crédito habilitado.
  -- El vencimiento se calcula automático (+30 días) porque el POS es
  -- mostrador rápido, no tiene campo de fecha de vencimiento.
  IF p_tipo_pago = 'credito' THEN
    IF p_cliente_id IS NULL THEN
      RAISE EXCEPTION 'Selecciona un cliente para vender a crédito';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM clientes
      WHERE id = p_cliente_id AND empresa_id = p_empresa_id AND tipo = 'credito' AND activo = true
    ) THEN
      RAISE EXCEPTION 'Ese cliente no tiene crédito habilitado';
    END IF;
    v_fecha_vencimiento := CURRENT_DATE + INTERVAL '30 days';
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
    fecha_emision, fecha_vencimiento, tipo_pago, estado,
    subtotal, descuento_total, iva_total, total, notas,
    cuenta_caja_id, sesion_caja_id, monto_recibido, cambio_entregado
  ) VALUES (
    p_empresa_id, v_numero_factura, p_cliente_id, COALESCE(NULLIF(p_cliente_nombre, ''), 'Consumidor final'),
    CURRENT_DATE, v_fecha_vencimiento, p_tipo_pago, 'emitida',
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
    'cambio', v_cambio,
    'fecha_vencimiento', v_fecha_vencimiento
  );
END;
$$;
