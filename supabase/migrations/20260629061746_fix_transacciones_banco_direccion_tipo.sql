
-- 1. Agregar columna direccion
ALTER TABLE transacciones_banco
ADD COLUMN IF NOT EXISTS direccion TEXT
CHECK (direccion IN ('entrada', 'salida'));

-- 2. Expandir el CHECK de tipo
ALTER TABLE transacciones_banco
DROP CONSTRAINT IF EXISTS transacciones_banco_tipo_check;

ALTER TABLE transacciones_banco
ADD CONSTRAINT transacciones_banco_tipo_check
CHECK (tipo IN (
  'transferencia','cheque','tarjeta','tarjeta_debito','tarjeta_credito',
  'efectivo','deposito','ingreso','egreso','retiro','cobro',
  'deposito_cheque','transferencia_salida','pago'
));

-- 3. Retroactivamente asignar direccion
UPDATE transacciones_banco
SET direccion = CASE
  WHEN ref_factura_id IS NOT NULL THEN 'entrada'
  WHEN ref_compra_id  IS NOT NULL THEN 'salida'
  WHEN tipo IN ('cheque','egreso','retiro','pago','transferencia_salida') THEN 'salida'
  WHEN tipo IN ('deposito','ingreso','cobro','deposito_cheque') THEN 'entrada'
  ELSE 'salida'
END
WHERE direccion IS NULL;
