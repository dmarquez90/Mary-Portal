
-- Actualizar user_id en empresas_juridicas — el UUID viejo al nuevo
UPDATE empresas_juridicas
SET user_id = '9d12cbd9-41a9-4128-8067-ff3d1baa06c6'
WHERE id = '730ef2d1-f60c-4a31-8b08-639aaa3c0f45';

-- Verificar sin RLS
SELECT id, nombre_empresa, user_id FROM empresas_juridicas
WHERE id = '730ef2d1-f60c-4a31-8b08-639aaa3c0f45';
