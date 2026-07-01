
-- ============================================================
-- MIGRACIÓN: Fix banco en trigger + Retención IR + Subtotal
-- ============================================================

-- ─────────────────────────────────────────────
-- 1. SUBTOTAL en detalle_compras (igual que detalle_facturas)
-- ─────────────────────────────────────────────
ALTER TABLE detalle_compras
  ADD COLUMN IF NOT EXISTS subtotal NUMERIC(15,2) GENERATED ALWAYS AS (cantidad * precio_unitario) STORED;

-- ─────────────────────────────────────────────
-- 2. CUENTA BANCO/CAJA en facturas y compras
--    Permite que el frontend indique exactamente qué cuenta usar
-- ─────────────────────────────────────────────
ALTER TABLE facturas
  ADD COLUMN IF NOT EXISTS cuenta_banco_id UUID REFERENCES cuentas_banco(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cuenta_caja_id  UUID REFERENCES cuentas_caja(id)  ON DELETE SET NULL;

ALTER TABLE compras
  ADD COLUMN IF NOT EXISTS cuenta_banco_id UUID REFERENCES cuentas_banco(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cuenta_caja_id  UUID REFERENCES cuentas_caja(id)  ON DELETE SET NULL;

-- ─────────────────────────────────────────────
-- 3. RETENCIÓN IR en compras
--    retencion_ir = 2% del subtotal para proveedor natural
--    total_pagar = total - retencion_ir (lo que sale de caja)
-- ─────────────────────────────────────────────
ALTER TABLE compras
  ADD COLUMN IF NOT EXISTS retencion_ir      NUMERIC(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_a_pagar     NUMERIC(15,2) NOT NULL DEFAULT 0;

-- Inicializar total_a_pagar con total existente para datos históricos
UPDATE compras SET total_a_pagar = total WHERE total_a_pagar = 0;

-- ─────────────────────────────────────────────
-- 4. Cuenta contable para retención en cuentas_banco (FK opcional)
--    cuentas_banco → cuenta_contable_id para mapear al plan de cuentas
-- ─────────────────────────────────────────────
ALTER TABLE cuentas_banco
  ADD COLUMN IF NOT EXISTS cuenta_contable_id UUID REFERENCES plan_cuentas(id) ON DELETE SET NULL;

ALTER TABLE cuentas_caja
  ADD COLUMN IF NOT EXISTS cuenta_contable_id UUID REFERENCES plan_cuentas(id) ON DELETE SET NULL;

-- Mapear automáticamente cuentas_banco → plan_cuentas por moneda
-- Empresa 1c71f63d: tiene 1.1.03 Banco MN, 1.1.04 Banco ME
UPDATE cuentas_banco cb
SET cuenta_contable_id = pc.id
FROM plan_cuentas pc
WHERE cb.empresa_id = pc.empresa_id
  AND cb.activa = true
  AND (
    (cb.moneda = 'NIO' AND pc.codigo = '1.1.03') OR
    (cb.moneda = 'USD' AND pc.codigo = '1.1.04')
  )
  AND cb.cuenta_contable_id IS NULL;

-- Empresa 730ef2d1: tiene 1.1.03 Banco BANPRO COR, 1.1.04 Banco BANPRO DOL
UPDATE cuentas_banco cb
SET cuenta_contable_id = pc.id
FROM plan_cuentas pc
WHERE cb.empresa_id = pc.empresa_id
  AND cb.activa = true
  AND (
    (cb.moneda = 'NIO' AND pc.codigo = '1.1.03') OR
    (cb.moneda = 'USD' AND pc.codigo = '1.1.04')
  )
  AND cb.cuenta_contable_id IS NULL;
