-- ============================================================
-- Cierre de hallazgo del linter de Supabase: las funciones nuevas
-- del POS quedaron ejecutables por el rol 'anon' (Postgres otorga
-- EXECUTE a PUBLIC por defecto en CREATE FUNCTION). No es explotable
-- en la práctica (auth.uid() es NULL para anon y fn_tiene_permiso
-- devuelve false), pero se revoca por buena práctica — igual que ya
-- estaba hecho para fn_crear_empresa_usuario/fn_tiene_permiso.
-- ============================================================
REVOKE EXECUTE ON FUNCTION fn_abrir_turno_pos(UUID, UUID, NUMERIC, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION fn_cerrar_turno_pos(UUID, JSONB, NUMERIC, NUMERIC, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION fn_registrar_venta_pos(UUID, UUID, UUID, TEXT, TEXT, JSONB, NUMERIC, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION fn_registrar_devolucion_pos(UUID, UUID, UUID, TEXT, JSONB) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION fn_abrir_turno_pos(UUID, UUID, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_cerrar_turno_pos(UUID, JSONB, NUMERIC, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_registrar_venta_pos(UUID, UUID, UUID, TEXT, TEXT, JSONB, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_registrar_devolucion_pos(UUID, UUID, UUID, TEXT, JSONB) TO authenticated;
