-- SARA ERP — Fase 7: Funciones Contables Avanzadas

ALTER TABLE periodos_contables
  ADD COLUMN IF NOT EXISTS bloqueado          BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS fecha_cierre       DATE,
  ADD COLUMN IF NOT EXISTS cerrado_por        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS asiento_cierre_id  UUID REFERENCES asientos_contables(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS abonos_cxc (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        UUID NOT NULL,
  factura_id        UUID NOT NULL REFERENCES facturas(id) ON DELETE CASCADE,
  cliente_id        UUID REFERENCES clientes(id) ON DELETE SET NULL,
  fecha             DATE NOT NULL,
  monto             NUMERIC(15,2) NOT NULL CHECK (monto > 0),
  forma_pago        TEXT NOT NULL DEFAULT 'efectivo' CHECK (forma_pago IN ('efectivo','transferencia','cheque','tarjeta','otro')),
  referencia        TEXT,
  notas             TEXT,
  asiento_id        UUID REFERENCES asientos_contables(id) ON DELETE SET NULL,
  cuenta_cobro_id   UUID REFERENCES plan_cuentas(id) ON DELETE SET NULL,
  estado            TEXT NOT NULL DEFAULT 'aplicado' CHECK (estado IN ('aplicado','anulado')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS abonos_cxp (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        UUID NOT NULL,
  compra_id         UUID NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
  proveedor_id      UUID REFERENCES proveedores(id) ON DELETE SET NULL,
  fecha             DATE NOT NULL,
  monto             NUMERIC(15,2) NOT NULL CHECK (monto > 0),
  forma_pago        TEXT NOT NULL DEFAULT 'transferencia' CHECK (forma_pago IN ('efectivo','transferencia','cheque','tarjeta','otro')),
  referencia        TEXT,
  notas             TEXT,
  asiento_id        UUID REFERENCES asientos_contables(id) ON DELETE SET NULL,
  cuenta_pago_id    UUID REFERENCES plan_cuentas(id) ON DELETE SET NULL,
  estado            TEXT NOT NULL DEFAULT 'aplicado' CHECK (estado IN ('aplicado','anulado')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS extractos_bancarios (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        UUID NOT NULL,
  cuenta_banco_id   UUID NOT NULL REFERENCES cuentas_banco(id) ON DELETE CASCADE,
  fecha             DATE NOT NULL,
  descripcion       TEXT NOT NULL,
  tipo              TEXT NOT NULL CHECK (tipo IN ('credito','debito')),
  monto             NUMERIC(15,2) NOT NULL,
  saldo_banco       NUMERIC(15,2),
  referencia        TEXT,
  conciliado        BOOLEAN NOT NULL DEFAULT FALSE,
  transaccion_id    UUID REFERENCES transacciones_banco(id) ON DELETE SET NULL,
  diferencia        NUMERIC(15,2) DEFAULT 0,
  lote_carga        TEXT,
  notas             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conciliaciones_bancarias (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID NOT NULL,
  cuenta_banco_id     UUID NOT NULL REFERENCES cuentas_banco(id) ON DELETE CASCADE,
  anio                INT NOT NULL,
  mes                 INT NOT NULL CHECK (mes BETWEEN 1 AND 12),
  fecha_corte         DATE NOT NULL,
  saldo_segun_banco   NUMERIC(15,2) NOT NULL DEFAULT 0,
  saldo_segun_libros  NUMERIC(15,2) NOT NULL DEFAULT 0,
  diferencia_total    NUMERIC(15,2) NOT NULL DEFAULT 0,
  depositos_en_transito  NUMERIC(15,2) NOT NULL DEFAULT 0,
  cheques_pendientes     NUMERIC(15,2) NOT NULL DEFAULT 0,
  errores_banco          NUMERIC(15,2) NOT NULL DEFAULT 0,
  errores_libros         NUMERIC(15,2) NOT NULL DEFAULT 0,
  estado              TEXT NOT NULL DEFAULT 'en_proceso' CHECK (estado IN ('en_proceso','conciliado','aprobado')),
  aprobado_por        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  fecha_aprobacion    DATE,
  notas               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (empresa_id, cuenta_banco_id, anio, mes)
);

CREATE TABLE IF NOT EXISTS notas_credito_debito (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID NOT NULL,
  tipo                TEXT NOT NULL CHECK (tipo IN ('credito','debito')),
  numero_nota         TEXT NOT NULL,
  ref_factura_id      UUID REFERENCES facturas(id) ON DELETE SET NULL,
  ref_compra_id       UUID REFERENCES compras(id) ON DELETE SET NULL,
  cliente_id          UUID REFERENCES clientes(id) ON DELETE SET NULL,
  proveedor_id        UUID REFERENCES proveedores(id) ON DELETE SET NULL,
  fecha               DATE NOT NULL,
  motivo              TEXT NOT NULL,
  subtotal            NUMERIC(15,2) NOT NULL DEFAULT 0,
  iva                 NUMERIC(15,2) NOT NULL DEFAULT 0,
  total               NUMERIC(15,2) NOT NULL DEFAULT 0,
  asiento_id          UUID REFERENCES asientos_contables(id) ON DELETE SET NULL,
  estado              TEXT NOT NULL DEFAULT 'emitida' CHECK (estado IN ('emitida','aplicada','anulada')),
  notas               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (empresa_id, numero_nota, tipo)
);

CREATE TABLE IF NOT EXISTS detalle_notas (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nota_id             UUID NOT NULL REFERENCES notas_credito_debito(id) ON DELETE CASCADE,
  producto_id         UUID REFERENCES productos(id) ON DELETE SET NULL,
  descripcion         TEXT NOT NULL,
  cantidad            NUMERIC(15,4) NOT NULL DEFAULT 1,
  precio_unitario     NUMERIC(15,2) NOT NULL DEFAULT 0,
  iva_pct             NUMERIC(5,4) NOT NULL DEFAULT 0.15,
  subtotal            NUMERIC(15,2) NOT NULL DEFAULT 0,
  iva                 NUMERIC(15,2) NOT NULL DEFAULT 0,
  total               NUMERIC(15,2) NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Vistas CxC y CxP
CREATE OR REPLACE VIEW vista_saldos_cxc AS
SELECT
  f.id AS factura_id, f.empresa_id, f.numero_factura, f.fecha_emision, f.fecha_vencimiento,
  f.total AS monto_original,
  COALESCE(SUM(a.monto) FILTER (WHERE a.estado = 'aplicado'), 0) AS total_abonado,
  f.total - COALESCE(SUM(a.monto) FILTER (WHERE a.estado = 'aplicado'), 0) AS saldo_pendiente,
  CASE
    WHEN f.total - COALESCE(SUM(a.monto) FILTER (WHERE a.estado = 'aplicado'), 0) <= 0 THEN 'pagada'
    WHEN f.fecha_vencimiento < CURRENT_DATE THEN 'vencida'
    ELSE 'vigente'
  END AS estado_cobro,
  CASE WHEN f.fecha_vencimiento IS NOT NULL AND f.fecha_vencimiento < CURRENT_DATE
    THEN CURRENT_DATE - f.fecha_vencimiento ELSE 0 END AS dias_vencido,
  f.cliente_id
FROM facturas f
LEFT JOIN abonos_cxc a ON a.factura_id = f.id
WHERE f.tipo_pago = 'credito' AND f.estado != 'anulada'
GROUP BY f.id, f.empresa_id, f.numero_factura, f.fecha_emision, f.fecha_vencimiento, f.total, f.cliente_id;

CREATE OR REPLACE VIEW vista_saldos_cxp AS
SELECT
  c.id AS compra_id, c.empresa_id, c.numero_compra, c.fecha_compra, c.fecha_vencimiento,
  c.total AS monto_original,
  COALESCE(SUM(a.monto) FILTER (WHERE a.estado = 'aplicado'), 0) AS total_abonado,
  c.total - COALESCE(SUM(a.monto) FILTER (WHERE a.estado = 'aplicado'), 0) AS saldo_pendiente,
  CASE
    WHEN c.total - COALESCE(SUM(a.monto) FILTER (WHERE a.estado = 'aplicado'), 0) <= 0 THEN 'pagada'
    WHEN c.fecha_vencimiento < CURRENT_DATE THEN 'vencida'
    ELSE 'vigente'
  END AS estado_pago,
  CASE WHEN c.fecha_vencimiento IS NOT NULL AND c.fecha_vencimiento < CURRENT_DATE
    THEN CURRENT_DATE - c.fecha_vencimiento ELSE 0 END AS dias_vencido,
  c.proveedor_id
FROM compras c
LEFT JOIN abonos_cxp a ON a.compra_id = c.id
WHERE c.tipo_pago = 'credito' AND c.estado != 'anulada'
GROUP BY c.id, c.empresa_id, c.numero_compra, c.fecha_compra, c.fecha_vencimiento, c.total, c.proveedor_id;

-- RLS
ALTER TABLE abonos_cxc               ENABLE ROW LEVEL SECURITY;
ALTER TABLE abonos_cxp               ENABLE ROW LEVEL SECURITY;
ALTER TABLE extractos_bancarios      ENABLE ROW LEVEL SECURITY;
ALTER TABLE conciliaciones_bancarias ENABLE ROW LEVEL SECURITY;
ALTER TABLE notas_credito_debito     ENABLE ROW LEVEL SECURITY;
ALTER TABLE detalle_notas            ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "own_empresa" ON abonos_cxc;
  CREATE POLICY "own_empresa" ON abonos_cxc FOR ALL USING (empresa_id = ANY(get_empresa_ids()));
  DROP POLICY IF EXISTS "own_empresa" ON abonos_cxp;
  CREATE POLICY "own_empresa" ON abonos_cxp FOR ALL USING (empresa_id = ANY(get_empresa_ids()));
  DROP POLICY IF EXISTS "own_empresa" ON extractos_bancarios;
  CREATE POLICY "own_empresa" ON extractos_bancarios FOR ALL USING (empresa_id = ANY(get_empresa_ids()));
  DROP POLICY IF EXISTS "own_empresa" ON conciliaciones_bancarias;
  CREATE POLICY "own_empresa" ON conciliaciones_bancarias FOR ALL USING (empresa_id = ANY(get_empresa_ids()));
  DROP POLICY IF EXISTS "own_empresa" ON notas_credito_debito;
  CREATE POLICY "own_empresa" ON notas_credito_debito FOR ALL USING (empresa_id = ANY(get_empresa_ids()));
  DROP POLICY IF EXISTS "via_nota" ON detalle_notas;
  CREATE POLICY "via_nota" ON detalle_notas FOR ALL USING (nota_id IN (SELECT id FROM notas_credito_debito WHERE empresa_id = ANY(get_empresa_ids())));
END$$;

-- Índices
CREATE INDEX IF NOT EXISTS idx_abonos_cxc_factura  ON abonos_cxc(factura_id);
CREATE INDEX IF NOT EXISTS idx_abonos_cxc_empresa  ON abonos_cxc(empresa_id);
CREATE INDEX IF NOT EXISTS idx_abonos_cxp_compra   ON abonos_cxp(compra_id);
CREATE INDEX IF NOT EXISTS idx_abonos_cxp_empresa  ON abonos_cxp(empresa_id);
CREATE INDEX IF NOT EXISTS idx_extracto_cuenta     ON extractos_bancarios(cuenta_banco_id);
CREATE INDEX IF NOT EXISTS idx_extracto_conciliado ON extractos_bancarios(conciliado);
CREATE INDEX IF NOT EXISTS idx_concil_cuenta       ON conciliaciones_bancarias(cuenta_banco_id, anio, mes);
CREATE INDEX IF NOT EXISTS idx_notas_empresa       ON notas_credito_debito(empresa_id);
CREATE INDEX IF NOT EXISTS idx_notas_tipo          ON notas_credito_debito(tipo);

-- Función cierre contable
CREATE OR REPLACE FUNCTION cerrar_periodo_contable(p_periodo_id UUID, p_user_id UUID)
RETURNS TEXT AS $$
DECLARE v_periodo periodos_contables%ROWTYPE; v_pendientes INT;
BEGIN
  SELECT * INTO v_periodo FROM periodos_contables WHERE id = p_periodo_id;
  IF NOT FOUND THEN RETURN 'ERROR: Período no encontrado'; END IF;
  IF v_periodo.bloqueado THEN RETURN 'ERROR: El período ya está cerrado'; END IF;
  SELECT COUNT(*) INTO v_pendientes FROM asientos_contables WHERE periodo_id = p_periodo_id AND estado = 'borrador';
  IF v_pendientes > 0 THEN RETURN 'ERROR: Existen ' || v_pendientes || ' asiento(s) en borrador. Apruébalos antes de cerrar.'; END IF;
  UPDATE periodos_contables SET estado='cerrado', bloqueado=TRUE, fecha_cierre=CURRENT_DATE, cerrado_por=p_user_id WHERE id=p_periodo_id;
  RETURN 'OK: Período cerrado el ' || CURRENT_DATE::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION periodo_esta_bloqueado(p_periodo_id UUID)
RETURNS BOOLEAN AS $$ SELECT COALESCE(bloqueado, FALSE) FROM periodos_contables WHERE id = p_periodo_id; $$ LANGUAGE sql STABLE;