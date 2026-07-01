
-- Reactivar RLS antes de insertar
ALTER TABLE empresas_juridicas ENABLE ROW LEVEL SECURITY;

-- Recrear la empresa con el nuevo user_id
INSERT INTO empresas_juridicas (
  id, user_id, nombre_empresa, nombre_comercial, numero_ruc,
  nombre_representante_legal, cedula_representante,
  direccion_legal, correo_electronico, sitio_web,
  tipo_propietario, activa
) VALUES (
  '730ef2d1-f60c-4a31-8b08-639aaa3c0f45',
  '9d12cbd9-41a9-4128-8067-ff3d1baa06c6',
  'Distribuidora NicaClean S.A.',
  'NicaClean',
  'J0310000045821',
  'Carlos Ernesto Mendoza Ruiz',
  '001-190580-0045K',
  'De la Rotonda Centroamérica 2c al Norte, 1c al Este, Managua',
  'admin@nicaclean.com.ni',
  'www.nicaclean.com.ni',
  'Sociedad Anónima',
  true
);
