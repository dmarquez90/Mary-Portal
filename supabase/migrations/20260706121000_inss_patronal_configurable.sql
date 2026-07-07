-- ============================================================
-- INSS patronal configurable por empresa
--
-- Reforma al reglamento de la Ley 539 (Decreto 06-2019): la tasa
-- patronal del régimen integral es 21.5% para empleadores con menos
-- de 50 trabajadores y 22.5% para 50 o más. Antes el sistema asumía
-- 22.5% fijo para todas las empresas.
-- ============================================================

ALTER TABLE empresas_juridicas
  ADD COLUMN IF NOT EXISTS inss_patronal_tasa NUMERIC(5,4) NOT NULL DEFAULT 0.225
  CHECK (inss_patronal_tasa > 0 AND inss_patronal_tasa < 1);

ALTER TABLE empresas_persona_natural
  ADD COLUMN IF NOT EXISTS inss_patronal_tasa NUMERIC(5,4) NOT NULL DEFAULT 0.225
  CHECK (inss_patronal_tasa > 0 AND inss_patronal_tasa < 1);

COMMENT ON COLUMN empresas_juridicas.inss_patronal_tasa IS
  'Tasa INSS patronal régimen integral: 0.215 (<50 empleados) o 0.225 (>=50). Decreto 06-2019.';
COMMENT ON COLUMN empresas_persona_natural.inss_patronal_tasa IS
  'Tasa INSS patronal régimen integral: 0.215 (<50 empleados) o 0.225 (>=50). Decreto 06-2019.';
