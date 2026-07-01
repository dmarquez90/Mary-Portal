
-- Actualizar user_id en empresas_juridicas al nuevo UUID del usuario demo
UPDATE empresas_juridicas
SET user_id = '9d12cbd9-41a9-4128-8067-ff3d1baa06c6'
WHERE user_id = '214a839d-f159-4abe-a9a0-0e8094a07b9a';

-- Verificar
SELECT id, nombre_empresa, user_id FROM empresas_juridicas;
