
-- El constraint actual solo permite tipos de INSTRUMENTO de pago (transferencia, cheque, etc.)
-- El formulario usa ingreso/egreso que es el SENTIDO del movimiento, no el instrumento.
-- La solución correcta: la tabla debe tener AMBOS campos separados:
--   tipo_movimiento = ingreso | egreso  (sentido)
--   tipo_instrumento = transferencia | cheque | tarjeta | efectivo | deposito  (instrumento)
-- Pero para no romper el sistema actual, expandimos el constraint existente
-- para aceptar ingreso/egreso Y los tipos de instrumento.

ALTER TABLE transacciones_banco
  DROP CONSTRAINT IF EXISTS transacciones_banco_tipo_check;

ALTER TABLE transacciones_banco
  ADD CONSTRAINT transacciones_banco_tipo_check
  CHECK (tipo = ANY (ARRAY[
    'ingreso', 'egreso',
    'deposito', 'retiro',
    'transferencia', 'cheque',
    'tarjeta', 'tarjeta_debito', 'tarjeta_credito',
    'efectivo'
  ]));
