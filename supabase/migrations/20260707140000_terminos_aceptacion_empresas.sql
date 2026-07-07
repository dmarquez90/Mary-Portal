-- Registro de aceptación de Términos y Condiciones / Política de Privacidad,
-- como evidencia de consentimiento del usuario al momento del registro.

ALTER TABLE empresas_persona_natural
  ADD COLUMN IF NOT EXISTS terminos_aceptados_en TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terminos_version      TEXT;

ALTER TABLE empresas_juridicas
  ADD COLUMN IF NOT EXISTS terminos_aceptados_en TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS terminos_version      TEXT;
