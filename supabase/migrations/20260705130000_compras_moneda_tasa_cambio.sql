-- ============================================================
-- Multi-moneda (1/4): columnas de trazabilidad en compras
-- ============================================================
-- Mismo patrón que ya existe (sin usar) en facturas.moneda/tasa_cambio.
-- Las llena el trigger de contabilización, no el usuario — reflejan si
-- el pago se resolvió contra una cuenta bancaria/caja en USD y a qué
-- tasa se convirtió para el lado operativo (movimientos_caja/
-- transacciones_banco/cheques).
-- ============================================================

ALTER TABLE compras ADD COLUMN IF NOT EXISTS moneda TEXT NOT NULL DEFAULT 'NIO';
ALTER TABLE compras ADD COLUMN IF NOT EXISTS tasa_cambio NUMERIC;
