ALTER TABLE empresas_juridicas
  ADD COLUMN IF NOT EXISTS tipo_propietario        TEXT,
  ADD COLUMN IF NOT EXISTS cedula_representante    TEXT,
  ADD COLUMN IF NOT EXISTS direccion_representante TEXT,
  ADD COLUMN IF NOT EXISTS ciudad_representante    TEXT,
  ADD COLUMN IF NOT EXISTS email_representante     TEXT,
  ADD COLUMN IF NOT EXISTS telefono_representante  TEXT;
