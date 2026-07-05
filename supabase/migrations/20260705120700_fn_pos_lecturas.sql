-- ============================================================
-- Punto de Venta: funciones de lectura para la pantalla POS
-- ============================================================
-- El rol 'cajero' no tiene inventario_ver/facturacion_ver/
-- caja_bancos_ver (por diseño — ver migración de permisos), así que
-- un simple `supabase.from('productos').select()` desde el cliente
-- devolvería vacío por RLS. En vez de crear una política RLS nueva
-- por cada tabla que la pantalla POS necesita leer (productos,
-- clientes, cuentas_caja, sesiones_caja, facturas), se centraliza en
-- dos funciones SECURITY DEFINER con su propio chequeo de permiso —
-- mismo patrón que las funciones de escritura (20260705120500).
-- ============================================================

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

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre) ORDER BY c.nombre), '[]'::jsonb)
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

CREATE OR REPLACE FUNCTION fn_pos_buscar_facturas(p_empresa_id UUID, p_query TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_result JSONB;
BEGIN
  IF NOT fn_tiene_permiso(v_actor, p_empresa_id, 'pos_devolucion') THEN
    RAISE EXCEPTION 'No tienes permiso para buscar facturas de devolución';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', f.id, 'numero_factura', f.numero_factura, 'cliente_nombre', f.cliente_nombre,
    'fecha_emision', f.fecha_emision, 'total', f.total, 'tipo_pago', f.tipo_pago,
    'detalle', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', d.id, 'producto_id', d.producto_id, 'descripcion', d.descripcion,
        'cantidad', d.cantidad, 'precio_unitario', d.precio_unitario
      )), '[]'::jsonb)
      FROM detalle_facturas d WHERE d.factura_id = f.id
    )
  ) ORDER BY f.fecha_emision DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT * FROM facturas f
    WHERE f.empresa_id = p_empresa_id
      AND f.estado IN ('emitida', 'parcial')
      AND (p_query IS NULL OR p_query = '' OR f.numero_factura ILIKE '%'||p_query||'%' OR f.cliente_nombre ILIKE '%'||p_query||'%')
    ORDER BY f.fecha_emision DESC
    LIMIT 20
  ) f;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION fn_pos_estado_inicial(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION fn_pos_buscar_facturas(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_pos_estado_inicial(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_pos_buscar_facturas(UUID, TEXT) TO authenticated;
