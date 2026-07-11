-- ============================================================
-- 1) Captura reproducible de objetos creados directo en Postgres
--    (nunca quedaron versionados): columna "suspendida" en las
--    tablas de empresa, y las funciones de suspender/reactivar
--    empresa y usuario. Todo es idempotente (no-op si ya existe).
-- ============================================================
ALTER TABLE empresas_juridicas
  ADD COLUMN IF NOT EXISTS suspendida BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE empresas_persona_natural
  ADD COLUMN IF NOT EXISTS suspendida BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.fn_suspender_empresa(p_empresa_id uuid, p_razon text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_filas int;
BEGIN
  IF NOT is_super_admin(v_actor) THEN
    RAISE EXCEPTION 'Solo super_admin puede suspender una empresa';
  END IF;
  IF p_razon IS NULL OR btrim(p_razon) = '' THEN
    RAISE EXCEPTION 'La razón es obligatoria';
  END IF;

  UPDATE empresas_juridicas SET suspendida = true WHERE id = p_empresa_id;
  GET DIAGNOSTICS v_filas = ROW_COUNT;
  IF v_filas = 0 THEN
    UPDATE empresas_persona_natural SET suspendida = true WHERE id = p_empresa_id;
  END IF;

  INSERT INTO audit_log_accesos (actor_id, accion, target_empresa_id, razon)
    VALUES (v_actor, 'suspender_empresa', p_empresa_id, p_razon);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_reactivar_empresa(p_empresa_id uuid, p_razon text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_filas int;
BEGIN
  IF NOT is_super_admin(v_actor) THEN
    RAISE EXCEPTION 'Solo super_admin puede reactivar una empresa';
  END IF;

  UPDATE empresas_juridicas SET suspendida = false WHERE id = p_empresa_id;
  GET DIAGNOSTICS v_filas = ROW_COUNT;
  IF v_filas = 0 THEN
    UPDATE empresas_persona_natural SET suspendida = false WHERE id = p_empresa_id;
  END IF;

  INSERT INTO audit_log_accesos (actor_id, accion, target_empresa_id, razon)
    VALUES (v_actor, 'reactivar_empresa', p_empresa_id, p_razon);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_suspender_usuario(p_empresa_usuario_id uuid, p_razon text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_target RECORD;
BEGIN
  SELECT * INTO v_target FROM empresa_usuarios WHERE id = p_empresa_usuario_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Usuario no encontrado'; END IF;

  IF NOT is_super_admin(v_actor) THEN
    IF v_target.rol = 'admin' THEN
      RAISE EXCEPTION 'Solo super_admin puede suspender a un admin';
    END IF;
    IF NOT fn_tiene_permiso(v_actor, v_target.empresa_id, 'usuarios_gestionar') THEN
      RAISE EXCEPTION 'No tienes permiso para gestionar usuarios de esta empresa';
    END IF;
  END IF;

  UPDATE empresa_usuarios
    SET suspendido = true, suspendido_at = now(), suspendido_por = v_actor, suspendido_razon = p_razon
    WHERE id = p_empresa_usuario_id;

  INSERT INTO audit_log_accesos (actor_id, accion, target_usuario_id, target_empresa_id, razon)
    VALUES (v_actor, 'suspender_usuario', v_target.usuario_id, v_target.empresa_id, p_razon);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_reactivar_usuario(p_empresa_usuario_id uuid, p_razon text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_target RECORD;
BEGIN
  SELECT * INTO v_target FROM empresa_usuarios WHERE id = p_empresa_usuario_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Usuario no encontrado'; END IF;

  IF NOT is_super_admin(v_actor) THEN
    IF v_target.rol = 'admin' THEN
      RAISE EXCEPTION 'Solo super_admin puede reactivar a un admin';
    END IF;
    IF NOT fn_tiene_permiso(v_actor, v_target.empresa_id, 'usuarios_gestionar') THEN
      RAISE EXCEPTION 'No tienes permiso para gestionar usuarios de esta empresa';
    END IF;
  END IF;

  UPDATE empresa_usuarios
    SET suspendido = false, suspendido_at = NULL, suspendido_por = NULL, suspendido_razon = NULL
    WHERE id = p_empresa_usuario_id;

  INSERT INTO audit_log_accesos (actor_id, accion, target_usuario_id, target_empresa_id, razon)
    VALUES (v_actor, 'reactivar_usuario', v_target.usuario_id, v_target.empresa_id, p_razon);
END;
$$;

-- Estas cuatro ya existían solo en producción y (como fn_crear_empresa_usuario)
-- quedaban ejecutables por 'anon' por defecto. Se cierra igual que se hizo
-- para las funciones del POS en 20260705120600.
REVOKE EXECUTE ON FUNCTION fn_suspender_empresa(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION fn_reactivar_empresa(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION fn_suspender_usuario(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION fn_reactivar_usuario(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_suspender_empresa(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_reactivar_empresa(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_suspender_usuario(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_reactivar_usuario(uuid, text) TO authenticated;

-- ============================================================
-- 2) fn_eliminar_empresa: borrado definitivo de una empresa y
--    absolutamente todos sus datos relacionados (sin respaldo,
--    según decisión del producto). No existe una FK única hacia
--    "empresa" (el modelo tiene dos tablas paralelas), así que no
--    hay ON DELETE CASCADE posible: se borra tabla por tabla.
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_eliminar_empresa(p_empresa_id uuid, p_razon text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_nombre text;
  v_tipo text;
BEGIN
  IF NOT is_super_admin(v_actor) THEN
    RAISE EXCEPTION 'Solo super_admin puede eliminar una empresa';
  END IF;
  IF p_razon IS NULL OR btrim(p_razon) = '' THEN
    RAISE EXCEPTION 'La razón es obligatoria';
  END IF;

  SELECT nombre_empresa INTO v_nombre FROM empresas_juridicas WHERE id = p_empresa_id;
  IF FOUND THEN
    v_tipo := 'juridica';
  ELSE
    SELECT nombre_completo INTO v_nombre FROM empresas_persona_natural WHERE id = p_empresa_id;
    IF FOUND THEN v_tipo := 'natural'; END IF;
  END IF;
  IF v_tipo IS NULL THEN
    RAISE EXCEPTION 'Empresa no encontrada';
  END IF;

  -- Se guarda ANTES de borrar: target_empresa_id no tiene FK, así que el
  -- registro de auditoría sobrevive como evidencia aunque la empresa ya no exista.
  INSERT INTO audit_log_accesos (actor_id, accion, target_empresa_id, razon, detalle)
    VALUES (v_actor, 'eliminar_empresa', p_empresa_id, p_razon, jsonb_build_object('nombre', v_nombre, 'tipo', v_tipo));

  -- SET LOCAL se revierte solo al terminar la función (transacción implícita
  -- del RPC). Desactiva los triggers de FK (CASCADE/SET NULL/RESTRICT) para
  -- que el orden de los DELETE de abajo no dependa de la maraña de FKs
  -- cruzadas entre estas ~50 tablas; por eso cada tabla se borra explícitamente
  -- por su propio empresa_id en vez de confiar en que el motor propague el borrado.
  SET LOCAL session_replication_role = replica;

  -- Tablas hijas sin empresa_id propio: se resuelven vía su padre ANTES de
  -- borrar el padre (si no, la subconsulta ya no encontraría nada y quedarían huérfanas).
  DELETE FROM detalle_facturas WHERE factura_id IN (SELECT id FROM facturas WHERE empresa_id = p_empresa_id);
  DELETE FROM detalle_compras WHERE compra_id IN (SELECT id FROM compras WHERE empresa_id = p_empresa_id);
  DELETE FROM detalle_notas WHERE nota_id IN (SELECT id FROM notas_credito_debito WHERE empresa_id = p_empresa_id);
  DELETE FROM depreciacion_mensual WHERE activo_id IN (SELECT id FROM activos_fijos WHERE empresa_id = p_empresa_id);

  -- Tablas con empresa_id propio (orden libre: cada una se filtra por su
  -- propia columna, no depende de que otra tabla se haya borrado antes).
  DELETE FROM abonos_cxc WHERE empresa_id = p_empresa_id;
  DELETE FROM abonos_cxp WHERE empresa_id = p_empresa_id;
  DELETE FROM activos_fijos WHERE empresa_id = p_empresa_id;
  DELETE FROM activos_intangibles WHERE empresa_id = p_empresa_id;
  DELETE FROM amortizaciones WHERE empresa_id = p_empresa_id;
  DELETE FROM anticipos_ir WHERE empresa_id = p_empresa_id;
  DELETE FROM asientos_contables WHERE empresa_id = p_empresa_id;
  DELETE FROM asientos_detalle WHERE empresa_id = p_empresa_id;
  DELETE FROM "auditoría_eventos_vet" WHERE empresa_id = p_empresa_id;
  DELETE FROM "auditoría_exportaciones_vet" WHERE empresa_id = p_empresa_id;
  DELETE FROM calendario_tributario WHERE empresa_id = p_empresa_id;
  DELETE FROM cargos WHERE empresa_id = p_empresa_id;
  DELETE FROM cheques WHERE empresa_id = p_empresa_id;
  DELETE FROM clientes WHERE empresa_id = p_empresa_id;
  DELETE FROM compras WHERE empresa_id = p_empresa_id;
  DELETE FROM conciliaciones_bancarias WHERE empresa_id = p_empresa_id;
  DELETE FROM consecutivos WHERE empresa_id = p_empresa_id;
  DELETE FROM credito_fiscal_iva_detalle WHERE empresa_id = p_empresa_id;
  DELETE FROM cuentas_banco WHERE empresa_id = p_empresa_id;
  DELETE FROM cuentas_caja WHERE empresa_id = p_empresa_id;
  DELETE FROM declaraciones_imi WHERE empresa_id = p_empresa_id;
  DELETE FROM declaraciones_ir_anual WHERE empresa_id = p_empresa_id;
  DELETE FROM declaraciones_isc WHERE empresa_id = p_empresa_id;
  DELETE FROM depreciaciones WHERE empresa_id = p_empresa_id;
  DELETE FROM empleados WHERE empresa_id = p_empresa_id;
  DELETE FROM empresa_usuarios WHERE empresa_id = p_empresa_id;
  DELETE FROM estados_financieros WHERE empresa_id = p_empresa_id;
  DELETE FROM estados_financieros_guardados WHERE empresa_id = p_empresa_id;
  DELETE FROM extractos_bancarios WHERE empresa_id = p_empresa_id;
  DELETE FROM facturas WHERE empresa_id = p_empresa_id;
  DELETE FROM historial_salarial WHERE empresa_id = p_empresa_id;
  DELETE FROM ir_laboral_acumulado WHERE empresa_id = p_empresa_id;
  DELETE FROM liquidaciones WHERE empresa_id = p_empresa_id;
  DELETE FROM lotes_inventario WHERE empresa_id = p_empresa_id;
  DELETE FROM movimientos_caja WHERE empresa_id = p_empresa_id;
  DELETE FROM movimientos_inventario WHERE empresa_id = p_empresa_id;
  DELETE FROM movimientos_moneda_extranjera WHERE empresa_id = p_empresa_id;
  DELETE FROM notas_credito_debito WHERE empresa_id = p_empresa_id;
  DELETE FROM pagos WHERE empresa_id = p_empresa_id;
  DELETE FROM periodos_contables WHERE empresa_id = p_empresa_id;
  DELETE FROM periodos_fiscales WHERE empresa_id = p_empresa_id;
  DELETE FROM plan_cuentas WHERE empresa_id = p_empresa_id;
  DELETE FROM planilla_detalle WHERE empresa_id = p_empresa_id;
  DELETE FROM planillas WHERE empresa_id = p_empresa_id;
  DELETE FROM prestaciones_sociales WHERE empresa_id = p_empresa_id;
  DELETE FROM productos WHERE empresa_id = p_empresa_id;
  DELETE FROM proveedores WHERE empresa_id = p_empresa_id;
  DELETE FROM retenciones_aplicadas WHERE empresa_id = p_empresa_id;
  DELETE FROM retenciones_definitivas WHERE empresa_id = p_empresa_id;
  DELETE FROM retenciones_ir WHERE empresa_id = p_empresa_id;
  DELETE FROM saldos_mayor WHERE empresa_id = p_empresa_id;
  DELETE FROM sesiones_caja WHERE empresa_id = p_empresa_id;
  DELETE FROM tasa_cambio WHERE empresa_id = p_empresa_id;
  DELETE FROM transacciones_banco WHERE empresa_id = p_empresa_id;

  -- Archivos VET en Storage (ruta = "<empresa_id>/...", ver planilla-ingresos/route.ts).
  DELETE FROM storage.objects WHERE bucket_id = 'reportes-vet' AND name LIKE p_empresa_id::text || '/%';

  -- Finalmente la empresa misma (una de las dos tablas no tendrá fila y el DELETE es no-op).
  DELETE FROM empresas_juridicas WHERE id = p_empresa_id;
  DELETE FROM empresas_persona_natural WHERE id = p_empresa_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION fn_eliminar_empresa(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_eliminar_empresa(uuid, text) TO authenticated;

-- ============================================================
-- 3) Detalle de empresa + usuarios, para el panel Super Admin.
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_detalle_empresa(p_empresa_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_resultado jsonb;
BEGIN
  IF NOT is_super_admin(v_actor) THEN
    RAISE EXCEPTION 'Solo super_admin puede ver el detalle de una empresa';
  END IF;

  SELECT jsonb_build_object(
    'id', ej.id,
    'tipo', 'juridica',
    'nombre', ej.nombre_empresa,
    'nombre_comercial', ej.nombre_comercial,
    'ruc', ej.numero_ruc,
    'representante_legal', ej.nombre_representante_legal,
    'direccion', ej.direccion_legal,
    'correo', ej.correo_electronico,
    'telefono', ej.telefono_representante,
    'activa', ej.activa,
    'suspendida', ej.suspendida,
    'regimen_tributario', rt.nombre,
    'fecha_inscripcion_dgi', ej.fecha_inscripcion_dgi,
    'created_at', ej.created_at
  ) INTO v_resultado
  FROM empresas_juridicas ej
  LEFT JOIN regimenes_tributarios rt ON rt.id = ej.regimen_tributario_id
  WHERE ej.id = p_empresa_id;

  IF v_resultado IS NULL THEN
    SELECT jsonb_build_object(
      'id', epn.id,
      'tipo', 'natural',
      'nombre', epn.nombre_completo,
      'nombre_comercial', NULL,
      'ruc', epn.numero_ruc,
      'representante_legal', NULL,
      'cedula', epn.numero_cedula,
      'direccion', epn.direccion,
      'correo', epn.correo_electronico,
      'telefono', epn.telefono,
      'activa', epn.activa,
      'suspendida', epn.suspendida,
      'regimen_tributario', rt.nombre,
      'fecha_inscripcion_dgi', epn.fecha_inscripcion_dgi,
      'created_at', epn.created_at
    ) INTO v_resultado
    FROM empresas_persona_natural epn
    LEFT JOIN regimenes_tributarios rt ON rt.id = epn.regimen_tributario_id
    WHERE epn.id = p_empresa_id;
  END IF;

  IF v_resultado IS NULL THEN
    RAISE EXCEPTION 'Empresa no encontrada';
  END IF;

  RETURN v_resultado;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_listar_usuarios_empresa(p_empresa_id uuid)
RETURNS TABLE (
  id uuid,
  usuario_id uuid,
  email text,
  rol text,
  suspendido boolean,
  suspendido_at timestamptz,
  suspendido_razon text,
  created_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Solo super_admin puede listar los usuarios de una empresa';
  END IF;

  RETURN QUERY
  SELECT eu.id, eu.usuario_id, u.email::text, eu.rol, eu.suspendido, eu.suspendido_at, eu.suspendido_razon, eu.created_at
  FROM empresa_usuarios eu
  JOIN auth.users u ON u.id = eu.usuario_id
  WHERE eu.empresa_id = p_empresa_id
  ORDER BY eu.created_at ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION fn_detalle_empresa(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION fn_listar_usuarios_empresa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_detalle_empresa(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_listar_usuarios_empresa(uuid) TO authenticated;
