-- Agrega soporte de EUR a la tabla tasa_cambio existente (antes solo USD),
-- para que el módulo "Tasa de Cambio" muestre ambas divisas sin duplicar tablas.
ALTER TABLE tasa_cambio
  ADD COLUMN IF NOT EXISTS tasa_eur numeric(12,4) CHECK (tasa_eur IS NULL OR tasa_eur > 0);

COMMENT ON COLUMN tasa_cambio.tasa IS 'Córdobas por 1 USD';
COMMENT ON COLUMN tasa_cambio.tasa_eur IS 'Córdobas por 1 EUR';
