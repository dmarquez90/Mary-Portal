
-- Deshabilitar RLS temporalmente para ver el estado real
ALTER TABLE empresas_juridicas DISABLE ROW LEVEL SECURITY;

SELECT id, nombre_empresa, user_id FROM empresas_juridicas;
