-- ============================================================
-- Punto de Venta (1/5): rol 'cajero' + permisos pos_*
-- ============================================================
-- Nuevo rol acotado a mostrador: puede vender y devolver desde el
-- POS y manejar únicamente su propio turno de caja. No hereda
-- caja_bancos_ver/editar (eso sigue siendo admin/contador) — en vez
-- de ampliar las políticas RLS de sesiones_caja/cuentas_caja/
-- movimientos_caja (que darían acceso de tabla completa), el turno
-- propio del cajero se maneja vía funciones SECURITY DEFINER
-- (fn_abrir_turno_pos, fn_cerrar_turno_pos, fn_registrar_venta_pos,
-- fn_registrar_devolucion_pos en 20260705120500) que verifican
-- 'pos_*' explícitamente y acotan el acceso a la sesión/turno propio.
-- ============================================================

ALTER TABLE empresa_usuarios DROP CONSTRAINT IF EXISTS empresa_usuarios_rol_check;
ALTER TABLE empresa_usuarios ADD CONSTRAINT empresa_usuarios_rol_check
  CHECK (rol = ANY (ARRAY['admin','contador','auxiliar','ventas','cajero']));

ALTER TABLE matriz_permisos_seed DROP CONSTRAINT IF EXISTS matriz_permisos_seed_rol_check;
ALTER TABLE matriz_permisos_seed ADD CONSTRAINT matriz_permisos_seed_rol_check
  CHECK (rol = ANY (ARRAY['admin','contador','auxiliar','ventas','cajero']));

INSERT INTO matriz_permisos_seed (permiso, rol, permitido) VALUES
  ('pos_ver',          'admin',    true),
  ('pos_ver',          'contador', true),
  ('pos_ver',          'auxiliar', true),
  ('pos_ver',          'ventas',   true),
  ('pos_ver',          'cajero',   true),

  ('pos_vender',       'admin',    true),
  ('pos_vender',       'contador', false),
  ('pos_vender',       'auxiliar', false),
  ('pos_vender',       'ventas',   true),
  ('pos_vender',       'cajero',   true),

  ('pos_caja_propia',  'admin',    true),
  ('pos_caja_propia',  'contador', false),
  ('pos_caja_propia',  'auxiliar', false),
  ('pos_caja_propia',  'ventas',   false),
  ('pos_caja_propia',  'cajero',   true),

  ('pos_devolucion',   'admin',    true),
  ('pos_devolucion',   'contador', false),
  ('pos_devolucion',   'auxiliar', false),
  ('pos_devolucion',   'ventas',   false),
  ('pos_devolucion',   'cajero',   true)
ON CONFLICT (permiso, rol) DO UPDATE SET permitido = EXCLUDED.permitido;

-- Faltan explícitamente los demás permisos para 'cajero' (todo lo que
-- no sea pos_* queda en false por defecto vía COALESCE en fn_tiene_permiso,
-- no hace falta insertarlos), salvo dashboard_ver que sí necesita para
-- poder entrar al dashboard.
INSERT INTO matriz_permisos_seed (permiso, rol, permitido) VALUES
  ('dashboard_ver', 'cajero', true)
ON CONFLICT (permiso, rol) DO UPDATE SET permitido = EXCLUDED.permitido;

INSERT INTO permiso_modulo_map (permiso, modulo, tipo) VALUES
  ('pos_ver',         'pos', 'ver'),
  ('pos_vender',      'pos', 'editar'),
  ('pos_caja_propia', 'pos', 'editar'),
  ('pos_devolucion',  'pos', 'editar')
ON CONFLICT (permiso) DO UPDATE SET modulo = EXCLUDED.modulo, tipo = EXCLUDED.tipo;
