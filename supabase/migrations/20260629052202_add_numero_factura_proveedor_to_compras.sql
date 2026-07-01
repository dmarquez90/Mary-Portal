
-- Agregar columna numero_factura_proveedor a compras
ALTER TABLE compras ADD COLUMN IF NOT EXISTS numero_factura_proveedor TEXT;

-- Migrar datos existentes: extraer el número de factura proveedor que estaba guardado en notas
UPDATE compras
SET numero_factura_proveedor = regexp_replace(
  notas,
  '.*Factura proveedor: ([^\s|]+).*',
  '\1'
)
WHERE notas ILIKE '%Factura proveedor:%';

-- Limpiar las notas: quitar la parte "Factura proveedor: XXX" que ya no necesitamos ahí
UPDATE compras
SET notas = NULLIF(
  TRIM(
    REGEXP_REPLACE(
      REGEXP_REPLACE(notas, '\s*\|\s*Factura proveedor: [^\|]+', '', 'g'),
      'Factura proveedor: [^\|]+\s*\|?\s*', '', 'g'
    )
  ),
  ''
)
WHERE notas ILIKE '%Factura proveedor:%';
