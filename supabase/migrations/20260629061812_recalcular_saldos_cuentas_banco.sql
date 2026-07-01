
-- Recalcular saldo_actual de cada cuenta bancaria basado en transacciones reales
UPDATE cuentas_banco cb
SET
  saldo_actual = cb.saldo_inicial
    + COALESCE((
        SELECT SUM(t.monto)
        FROM transacciones_banco t
        WHERE t.cuenta_banco_id = cb.id
          AND t.estado != 'anulado'
          AND t.direccion = 'entrada'
      ), 0)
    - COALESCE((
        SELECT SUM(t.monto)
        FROM transacciones_banco t
        WHERE t.cuenta_banco_id = cb.id
          AND t.estado != 'anulado'
          AND t.direccion = 'salida'
      ), 0),
  updated_at = NOW()
WHERE activa = true;
