-- ============================================================
-- Punto de Venta (3/5): atribuir movimientos de efectivo a un turno
-- ============================================================
-- Hoy solo `facturas.sesion_caja_id` existe (y ni siquiera se usa).
-- Para poder cerrar un turno de caja con exactitud (ventas Y
-- devoluciones en efectivo que ocurrieron dentro de ese turno)
-- hace falta la misma columna en movimientos_caja y en
-- notas_credito_debito.
-- ============================================================

ALTER TABLE movimientos_caja
  ADD COLUMN IF NOT EXISTS sesion_caja_id UUID REFERENCES sesiones_caja(id);

CREATE INDEX IF NOT EXISTS idx_movimientos_caja_sesion ON movimientos_caja(sesion_caja_id);

ALTER TABLE notas_credito_debito
  ADD COLUMN IF NOT EXISTS sesion_caja_id UUID REFERENCES sesiones_caja(id);
