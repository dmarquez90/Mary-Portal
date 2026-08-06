-- ================================================================
-- Exención de IVA por producto — referencia al Art. 127 LCT
-- (Acuerdo Ministerial 09-2016). Campo opcional: solo aplica cuando
-- aplica_iva = false. No es obligatorio llenarlo (hay negocios que
-- marcan "no aplica IVA" sin que exista un numeral exacto, ej. errores
-- de captura o casos que su contador les indique de otra forma), pero
-- da trazabilidad de por qué un producto se factura sin IVA.
-- ================================================================

ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS exencion_iva_numeral INT NULL;

COMMENT ON COLUMN productos.exencion_iva_numeral IS
  'Numeral del Art. 127 LCT (Acuerdo Ministerial 09-2016) que justifica la exención de IVA. NULL = no especificado. Solo relevante si aplica_iva = false.';
