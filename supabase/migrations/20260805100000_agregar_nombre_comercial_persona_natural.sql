-- Agrega "nombre comercial" (opcional) a Persona Natural / Cuota Fija, igual que
-- ya existe para Persona Jurídica. Muchos comerciantes individuales en Nicaragua
-- operan bajo un nombre comercial distinto a su nombre legal (ej. "Pulpería Doña
-- María"). No es un campo exigido por ley, es informativo/UX.
-- Ver hallazgo #3 del reporte de QA (2026-08-05).

ALTER TABLE empresas_persona_natural
  ADD COLUMN IF NOT EXISTS nombre_comercial TEXT;

-- Actualiza fn_detalle_empresa (super-admin) para que deje de forzar NULL
-- en nombre_comercial para empresas Persona Natural / Cuota Fija.
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
      'nombre_comercial', epn.nombre_comercial,
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

REVOKE EXECUTE ON FUNCTION fn_detalle_empresa(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION fn_detalle_empresa(uuid) TO authenticated;
