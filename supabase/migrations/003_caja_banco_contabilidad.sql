-- ============================================================
-- SARA ERP – Migración 003
-- Tablas de Caja, Banco, Pagos y Contabilidad
-- Ejecutar en: Supabase → SQL Editor
-- Seguro: usa CREATE TABLE IF NOT EXISTS (idempotente)
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- BLOQUE 1: CAJA
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cuentas_caja (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        UUID NOT NULL,
  nombre            TEXT NOT NULL,
  tipo              TEXT NOT NULL DEFAULT 'caja_general'
                    CHECK (tipo IN ('caja_general', 'caja_chica')),
  moneda            TEXT NOT NULL DEFAULT 'NIO' CHECK (moneda IN ('NIO', 'USD')),
  saldo_inicial     NUMERIC(15,2) NOT NULL DEFAULT 0,
  saldo_actual      NUMERIC(15,2) NOT NULL DEFAULT 0,
  limite_caja_chica NUMERIC(15,2),
  activa            BOOLEAN NOT NULL DEFAULT TRUE,
  notas             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS movimientos_caja (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL,
  cuenta_caja_id  UUID REFERENCES cuentas_caja(id) ON DELETE SET NULL,
  tipo            TEXT NOT NULL CHECK (tipo IN ('ingreso', 'egreso')),
  monto           NUMERIC(15,2) NOT NULL,
  descripcion     TEXT NOT NULL,
  fecha           DATE NOT NULL,
  ref_factura_id  UUID REFERENCES facturas(id) ON DELETE SET NULL,
  ref_compra_id   UUID REFERENCES compras(id) ON DELETE SET NULL,
  pago_id         UUID,
  asiento_id      UUID,
  estado          TEXT NOT NULL DEFAULT 'registrado'
                  CHECK (estado IN ('registrado', 'anulado')),
  notas           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- ════════════════════════════════════════════════════════════
-- BLOQUE 2: BANCO
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cuentas_banco (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     UUID NOT NULL,
  nombre         TEXT NOT NULL,
  banco          TEXT,
  numero_cuenta  TEXT,
  tipo           TEXT NOT NULL DEFAULT 'corriente'
                 CHECK (tipo IN ('corriente', 'ahorro', 'tarjeta')),
  moneda         TEXT NOT NULL DEFAULT 'NIO' CHECK (moneda IN ('NIO', 'USD')),
  saldo_inicial  NUMERIC(15,2) NOT NULL DEFAULT 0,
  saldo_actual   NUMERIC(15,2) NOT NULL DEFAULT 0,
  activa         BOOLEAN NOT NULL DEFAULT TRUE,
  notas          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transacciones_banco (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id       UUID NOT NULL,
  cuenta_banco_id  UUID REFERENCES cuentas_banco(id) ON DELETE SET NULL,
  tipo             TEXT NOT NULL
                   CHECK (tipo IN ('transferencia','cheque','tarjeta','tarjeta_debito','tarjeta_credito','efectivo')),
  monto            NUMERIC(15,2) NOT NULL,
  monto_usd        NUMERIC(15,2),
  tipo_cambio      NUMERIC(10,4),
  descripcion      TEXT NOT NULL,
  fecha            DATE NOT NULL,
  referencia       TEXT,
  ref_factura_id   UUID REFERENCES facturas(id) ON DELETE SET NULL,
  ref_compra_id    UUID REFERENCES compras(id) ON DELETE SET NULL,
  pago_id          UUID,
  asiento_id       UUID,
  estado           TEXT NOT NULL DEFAULT 'registrado'
                   CHECK (estado IN ('registrado','anulado','conciliado')),
  notas            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS cheques (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            UUID NOT NULL,
  cuenta_banco_id       UUID REFERENCES cuentas_banco(id) ON DELETE SET NULL,
  numero_cheque         TEXT NOT NULL,
  tipo                  TEXT NOT NULL CHECK (tipo IN ('emitido','recibido')),
  monto                 NUMERIC(15,2) NOT NULL,
  beneficiario          TEXT,
  fecha_emision         DATE NOT NULL,
  fecha_vencimiento     DATE,
  ref_factura_id        UUID REFERENCES facturas(id) ON DELETE SET NULL,
  ref_compra_id         UUID REFERENCES compras(id) ON DELETE SET NULL,
  transaccion_banco_id  UUID REFERENCES transacciones_banco(id) ON DELETE SET NULL,
  estado                TEXT NOT NULL DEFAULT 'activo'
                        CHECK (estado IN ('activo','cobrado','anulado','vencido')),
  notas                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ════════════════════════════════════════════════════════════
-- BLOQUE 3: PAGOS
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS pagos (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            UUID NOT NULL,
  ref_factura_id        UUID REFERENCES facturas(id) ON DELETE SET NULL,
  ref_compra_id         UUID REFERENCES compras(id) ON DELETE SET NULL,
  tipo_pago             TEXT NOT NULL
                        CHECK (tipo_pago IN ('efectivo','transferencia','cheque','tarjeta','tarjeta_debito','tarjeta_credito')),
  monto                 NUMERIC(15,2) NOT NULL,
  fecha                 DATE NOT NULL,
  referencia            TEXT,
  numero_cheque         TEXT,
  comision_pct          NUMERIC(5,2) NOT NULL DEFAULT 0,
  monto_comision        NUMERIC(15,2) NOT NULL DEFAULT 0,
  notas                 TEXT,
  movimiento_caja_id    UUID REFERENCES movimientos_caja(id) ON DELETE SET NULL,
  transaccion_banco_id  UUID REFERENCES transacciones_banco(id) ON DELETE SET NULL,
  cheque_id             UUID REFERENCES cheques(id) ON DELETE SET NULL,
  asiento_id            UUID,
  estado                TEXT NOT NULL DEFAULT 'registrado'
                        CHECK (estado IN ('registrado','anulado')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- ════════════════════════════════════════════════════════════
-- BLOQUE 4: CONTABILIDAD
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS plan_cuentas (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID NOT NULL,
  codigo              TEXT NOT NULL,
  nombre              TEXT NOT NULL,
  tipo                TEXT NOT NULL
                      CHECK (tipo IN ('activo','pasivo','patrimonio','ingreso','gasto','costo')),
  nivel               INT  NOT NULL DEFAULT 1,
  padre_id            UUID REFERENCES plan_cuentas(id) ON DELETE SET NULL,
  permite_movimiento  BOOLEAN NOT NULL DEFAULT TRUE,
  activa              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, codigo)
);

CREATE TABLE IF NOT EXISTS periodos_contables (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   UUID NOT NULL,
  nombre       TEXT NOT NULL,
  fecha_inicio DATE NOT NULL,
  fecha_fin    DATE NOT NULL,
  estado       TEXT NOT NULL DEFAULT 'abierto'
               CHECK (estado IN ('abierto','cerrado')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, fecha_inicio, fecha_fin)
);

CREATE TABLE IF NOT EXISTS asientos_contables (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL,
  periodo_id      UUID REFERENCES periodos_contables(id) ON DELETE SET NULL,
  numero_asiento  TEXT NOT NULL,
  fecha           DATE NOT NULL,
  descripcion     TEXT NOT NULL,
  ref_factura_id  UUID REFERENCES facturas(id) ON DELETE SET NULL,
  ref_compra_id   UUID REFERENCES compras(id) ON DELETE SET NULL,
  ref_pago_id     UUID REFERENCES pagos(id) ON DELETE SET NULL,
  estado          TEXT NOT NULL DEFAULT 'borrador'
                  CHECK (estado IN ('borrador','aprobado','anulado')),
  total_debe      NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_haber     NUMERIC(15,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS asientos_detalle (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asiento_id   UUID NOT NULL REFERENCES asientos_contables(id) ON DELETE CASCADE,
  cuenta_id    UUID NOT NULL REFERENCES plan_cuentas(id) ON DELETE RESTRICT,
  descripcion  TEXT,
  debe         NUMERIC(15,2) NOT NULL DEFAULT 0,
  haber        NUMERIC(15,2) NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS saldos_mayor (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID NOT NULL,
  periodo_id  UUID NOT NULL REFERENCES periodos_contables(id) ON DELETE CASCADE,
  cuenta_id   UUID NOT NULL REFERENCES plan_cuentas(id) ON DELETE CASCADE,
  saldo_debe  NUMERIC(15,2) NOT NULL DEFAULT 0,
  saldo_haber NUMERIC(15,2) NOT NULL DEFAULT 0,
  saldo_neto  NUMERIC(15,2) NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (periodo_id, cuenta_id)
);

CREATE TABLE IF NOT EXISTS estados_financieros (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   UUID NOT NULL,
  periodo_id   UUID NOT NULL REFERENCES periodos_contables(id) ON DELETE CASCADE,
  tipo         TEXT NOT NULL
               CHECK (tipo IN ('balance_general','estado_resultados','flujo_caja')),
  datos        JSONB NOT NULL DEFAULT '{}'::JSONB,
  generado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (periodo_id, tipo)
);

-- ════════════════════════════════════════════════════════════
-- BLOQUE 5: ÍNDICES
-- ════════════════════════════════════════════════════════════

DO $$
DECLARE
  PROCEDURE safe_index(idx TEXT, tbl TEXT, col TEXT) AS $inner$
  BEGIN
    IF EXISTS (
      SELECT 1 FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = tbl AND a.attname = col AND a.attnum > 0
    ) AND NOT EXISTS (
      SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = idx
    ) THEN
      EXECUTE format('CREATE INDEX %I ON %I(%I)', idx, tbl, col);
    END IF;
  END $inner$ LANGUAGE plpgsql;
BEGIN
  CALL safe_index('idx_movcaja_empresa',       'movimientos_caja',    'empresa_id');
  CALL safe_index('idx_movcaja_fecha',         'movimientos_caja',    'fecha');
  CALL safe_index('idx_cuentas_caja_empresa',  'cuentas_caja',        'empresa_id');
  CALL safe_index('idx_txbanco_empresa',       'transacciones_banco', 'empresa_id');
  CALL safe_index('idx_txbanco_fecha',         'transacciones_banco', 'fecha');
  CALL safe_index('idx_cuentas_banco_empresa', 'cuentas_banco',       'empresa_id');
  CALL safe_index('idx_cheques_empresa',       'cheques',             'empresa_id');
  CALL safe_index('idx_pagos_factura',         'pagos',               'ref_factura_id');
  CALL safe_index('idx_pagos_compra',          'pagos',               'ref_compra_id');
  CALL safe_index('idx_plan_cuentas_empresa',  'plan_cuentas',        'empresa_id');
  CALL safe_index('idx_asientos_empresa',      'asientos_contables',  'empresa_id');
  CALL safe_index('idx_asientos_periodo',      'asientos_contables',  'periodo_id');
  CALL safe_index('idx_asientos_det',          'asientos_detalle',    'asiento_id');
END$$;

-- ════════════════════════════════════════════════════════════
-- BLOQUE 6: ROW LEVEL SECURITY
-- ════════════════════════════════════════════════════════════

-- Función helper (idempotente)
CREATE OR REPLACE FUNCTION get_empresa_ids()
RETURNS UUID[] AS $$
  SELECT ARRAY(
    SELECT id FROM empresas_persona_natural WHERE user_id = auth.uid()
    UNION
    SELECT id FROM empresas_juridicas WHERE user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

ALTER TABLE cuentas_caja          ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_caja      ENABLE ROW LEVEL SECURITY;
ALTER TABLE cuentas_banco         ENABLE ROW LEVEL SECURITY;
ALTER TABLE transacciones_banco   ENABLE ROW LEVEL SECURITY;
ALTER TABLE cheques               ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_cuentas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE periodos_contables    ENABLE ROW LEVEL SECURITY;
ALTER TABLE asientos_contables    ENABLE ROW LEVEL SECURITY;
ALTER TABLE asientos_detalle      ENABLE ROW LEVEL SECURITY;
ALTER TABLE saldos_mayor          ENABLE ROW LEVEL SECURITY;
ALTER TABLE estados_financieros   ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "own_empresa" ON cuentas_caja;
  CREATE POLICY "own_empresa" ON cuentas_caja
    FOR ALL USING (empresa_id = ANY(get_empresa_ids()));

  DROP POLICY IF EXISTS "own_empresa" ON movimientos_caja;
  CREATE POLICY "own_empresa" ON movimientos_caja
    FOR ALL USING (empresa_id = ANY(get_empresa_ids()));

  DROP POLICY IF EXISTS "own_empresa" ON cuentas_banco;
  CREATE POLICY "own_empresa" ON cuentas_banco
    FOR ALL USING (empresa_id = ANY(get_empresa_ids()));

  DROP POLICY IF EXISTS "own_empresa" ON transacciones_banco;
  CREATE POLICY "own_empresa" ON transacciones_banco
    FOR ALL USING (empresa_id = ANY(get_empresa_ids()));

  DROP POLICY IF EXISTS "own_empresa" ON cheques;
  CREATE POLICY "own_empresa" ON cheques
    FOR ALL USING (empresa_id = ANY(get_empresa_ids()));

  DROP POLICY IF EXISTS "own_empresa" ON pagos;
  CREATE POLICY "own_empresa" ON pagos
    FOR ALL USING (empresa_id = ANY(get_empresa_ids()));

  DROP POLICY IF EXISTS "own_empresa" ON plan_cuentas;
  CREATE POLICY "own_empresa" ON plan_cuentas
    FOR ALL USING (empresa_id = ANY(get_empresa_ids()));

  DROP POLICY IF EXISTS "own_empresa" ON periodos_contables;
  CREATE POLICY "own_empresa" ON periodos_contables
    FOR ALL USING (empresa_id = ANY(get_empresa_ids()));

  DROP POLICY IF EXISTS "own_empresa" ON asientos_contables;
  CREATE POLICY "own_empresa" ON asientos_contables
    FOR ALL USING (empresa_id = ANY(get_empresa_ids()));

  DROP POLICY IF EXISTS "own_empresa" ON saldos_mayor;
  CREATE POLICY "own_empresa" ON saldos_mayor
    FOR ALL USING (empresa_id = ANY(get_empresa_ids()));

  DROP POLICY IF EXISTS "own_empresa" ON estados_financieros;
  CREATE POLICY "own_empresa" ON estados_financieros
    FOR ALL USING (empresa_id = ANY(get_empresa_ids()));

  DROP POLICY IF EXISTS "via_asiento" ON asientos_detalle;
  CREATE POLICY "via_asiento" ON asientos_detalle
    FOR ALL USING (
      asiento_id IN (
        SELECT id FROM asientos_contables WHERE empresa_id = ANY(get_empresa_ids())
      )
    );
END$$;
