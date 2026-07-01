
-- BUG FIX #1: asientos_detalle.empresa_id no reconoce empresas_juridicas
-- La FK debe eliminarse ya que empresa_id puede venir de cualquiera de las dos tablas
ALTER TABLE asientos_detalle DROP CONSTRAINT IF EXISTS asientos_detalle_empresa_id_fkey;

-- También revisar asientos_contables
ALTER TABLE asientos_contables DROP CONSTRAINT IF EXISTS asientos_contables_empresa_id_fkey;
