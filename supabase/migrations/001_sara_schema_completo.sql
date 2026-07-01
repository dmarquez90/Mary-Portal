-- SARA ERP – Schema completo (Ley 822 LCT / DGI VET – Nicaragua)

-- BLOQUE 1: EMPRESAS
CREATE TABLE IF NOT EXISTS empresas_persona_natural (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo_empresa        TEXT NOT NULL DEFAULT 'persona_natural' CHECK (tipo_empresa IN ('persona_natural', 'cuota_fija')),
  nombre_completo     TEXT NOT NULL,
  numero_cedula       TEXT,
  numero_ruc          TEXT,
  direccion           TEXT,
  ciudad              TEXT,
  departamento        TEXT,
  telefono            TEXT,
  correo_electronico  TEXT,
  sitio_web           TEXT,
  activa              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS empresas_juridicas (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre_empresa              TEXT NOT NULL,
  nombre_comercial            TEXT,
  numero_ruc                  TEXT,
  nombre_representante_legal  TEXT,
  direccion_legal             TEXT,
  correo_electronico          TEXT,
  sitio_web                   TEXT,
  activa                      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- BLOQUE 2: CONSECUTIVOS DGI
CREATE TABLE IF NOT EXISTS consecutivos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id  UUID NOT NULL,
  tipo        TEXT NOT NULL,
  prefijo     TEXT NOT NULL DEFAULT 'F',
  digitos     INT  NOT NULL DEFAULT 6,
  ultimo      INT  NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, tipo)
);

-- BLOQUE 3: CATÁLOGOS
CREATE TABLE IF NOT EXISTS clientes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL,
  nombre          TEXT NOT NULL,
  ruc             TEXT,
  cedula          TEXT,
  direccion       TEXT,
  ciudad          TEXT,
  departamento    TEXT,
  telefono        TEXT,
  correo          TEXT,
  tipo            TEXT NOT NULL DEFAULT 'contado' CHECK (tipo IN ('contado', 'credito')),
  limite_credito  NUMERIC(15,2) DEFAULT 0,
  activo          BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS proveedores (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID NOT NULL,
  nombre        TEXT NOT NULL,
  ruc           TEXT,
  direccion     TEXT,
  telefono      TEXT,
  correo        TEXT,
  contacto      TEXT,
  tipo_persona  TEXT NOT NULL DEFAULT 'juridica' CHECK (tipo_persona IN ('natural', 'juridica', 'cuota_fija', 'gran_contribuyente')),
  activo        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS productos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     UUID NOT NULL,
  codigo         TEXT NOT NULL,
  nombre         TEXT NOT NULL,
  descripcion    TEXT,
  unidad_medida  TEXT NOT NULL DEFAULT 'UND',
  precio_compra  NUMERIC(15,2) NOT NULL DEFAULT 0,
  precio_venta   NUMERIC(15,2) NOT NULL DEFAULT 0,
  stock_actual   NUMERIC(15,4) NOT NULL DEFAULT 0,
  stock_minimo   NUMERIC(15,4) NOT NULL DEFAULT 0,
  aplica_iva     BOOLEAN NOT NULL DEFAULT TRUE,
  activo         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, codigo)
);

-- BLOQUE 4: INVENTARIO FIFO
CREATE TABLE IF NOT EXISTS lotes_inventario (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id         UUID NOT NULL,
  producto_id        UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  compra_id          UUID,
  fecha_entrada      DATE NOT NULL,
  cantidad_inicial   NUMERIC(15,4) NOT NULL,
  cantidad_restante  NUMERIC(15,4) NOT NULL,
  costo_unitario     NUMERIC(15,4) NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS movimientos_inventario (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id   UUID NOT NULL,
  producto_id  UUID NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  tipo         TEXT NOT NULL CHECK (tipo IN ('entrada', 'salida', 'ajuste')),
  cantidad     NUMERIC(15,4) NOT NULL,
  referencia   TEXT,
  notas        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- BLOQUE 5: FACTURAS
CREATE TABLE IF NOT EXISTS facturas (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id         UUID NOT NULL,
  numero_factura     TEXT NOT NULL,
  cliente_id         UUID REFERENCES clientes(id) ON DELETE SET NULL,
  cliente_nombre     TEXT NOT NULL DEFAULT 'Consumidor final',
  fecha_emision      DATE NOT NULL,
  fecha_vencimiento  DATE,
  tipo_pago          TEXT NOT NULL DEFAULT 'contado' CHECK (tipo_pago IN ('contado', 'credito', 'transferencia', 'cheque', 'tarjeta')),
  estado             TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'emitida', 'parcial', 'pagada', 'anulada')),
  subtotal           NUMERIC(15,2) NOT NULL DEFAULT 0,
  descuento_total    NUMERIC(15,2) NOT NULL DEFAULT 0,
  iva_total          NUMERIC(15,2) NOT NULL DEFAULT 0,
  total              NUMERIC(15,2) NOT NULL DEFAULT 0,
  notas              TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, numero_factura)
);

CREATE TABLE IF NOT EXISTS detalle_facturas (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  factura_id       UUID NOT NULL REFERENCES facturas(id) ON DELETE CASCADE,
  producto_id      UUID REFERENCES productos(id) ON DELETE SET NULL,
  descripcion      TEXT NOT NULL,
  cantidad         NUMERIC(15,4) NOT NULL,
  precio_unitario  NUMERIC(15,2) NOT NULL,
  descuento_pct    NUMERIC(5,2) NOT NULL DEFAULT 0,
  subtotal         NUMERIC(15,2) NOT NULL,
  iva              NUMERIC(15,2) NOT NULL DEFAULT 0,
  total            NUMERIC(15,2) NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- BLOQUE 6: COMPRAS
CREATE TABLE IF NOT EXISTS compras (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        UUID NOT NULL,
  numero_compra     TEXT NOT NULL,
  proveedor_id      UUID REFERENCES proveedores(id) ON DELETE SET NULL,
  fecha_compra      DATE NOT NULL,
  fecha_vencimiento DATE,
  tipo_pago         TEXT NOT NULL DEFAULT 'contado' CHECK (tipo_pago IN ('contado', 'credito', 'transferencia', 'cheque', 'tarjeta')),
  estado            TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'recibida', 'parcial', 'pagada', 'anulada')),
  subtotal          NUMERIC(15,2) NOT NULL DEFAULT 0,
  iva_total         NUMERIC(15,2) NOT NULL DEFAULT 0,
  total             NUMERIC(15,2) NOT NULL DEFAULT 0,
  notas             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, numero_compra)
);

CREATE TABLE IF NOT EXISTS detalle_compras (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compra_id        UUID NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
  producto_id      UUID REFERENCES productos(id) ON DELETE SET NULL,
  descripcion      TEXT NOT NULL,
  cantidad         NUMERIC(15,4) NOT NULL,
  precio_unitario  NUMERIC(15,2) NOT NULL,
  iva              NUMERIC(15,2) NOT NULL DEFAULT 0,
  total            NUMERIC(15,2) NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_lotes_compra') THEN
    ALTER TABLE lotes_inventario ADD CONSTRAINT fk_lotes_compra FOREIGN KEY (compra_id) REFERENCES compras(id) ON DELETE SET NULL;
  END IF;
END$$;

-- BLOQUE 7: CAJA
CREATE TABLE IF NOT EXISTS cuentas_caja (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id        UUID NOT NULL,
  nombre            TEXT NOT NULL,
  tipo              TEXT NOT NULL DEFAULT 'caja_general' CHECK (tipo IN ('caja_general', 'caja_chica')),
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
  estado          TEXT NOT NULL DEFAULT 'registrado' CHECK (estado IN ('registrado', 'anulado')),
  notas           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- BLOQUE 8: BANCO
CREATE TABLE IF NOT EXISTS cuentas_banco (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     UUID NOT NULL,
  nombre         TEXT NOT NULL,
  banco          TEXT,
  numero_cuenta  TEXT,
  tipo           TEXT NOT NULL DEFAULT 'corriente' CHECK (tipo IN ('corriente', 'ahorro', 'tarjeta')),
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
  tipo             TEXT NOT NULL CHECK (tipo IN ('transferencia','cheque','tarjeta','tarjeta_debito','tarjeta_credito','efectivo')),
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
  estado           TEXT NOT NULL DEFAULT 'registrado' CHECK (estado IN ('registrado','anulado','conciliado')),
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
  estado                TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','cobrado','anulado','vencido')),
  notas                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pagos (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id            UUID NOT NULL,
  ref_factura_id        UUID REFERENCES facturas(id) ON DELETE SET NULL,
  ref_compra_id         UUID REFERENCES compras(id) ON DELETE SET NULL,
  tipo_pago             TEXT NOT NULL CHECK (tipo_pago IN ('efectivo','transferencia','cheque','tarjeta','tarjeta_debito','tarjeta_credito')),
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
  estado                TEXT NOT NULL DEFAULT 'registrado' CHECK (estado IN ('registrado','anulado')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- BLOQUE 9: CONTABILIDAD
CREATE TABLE IF NOT EXISTS plan_cuentas (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID NOT NULL,
  codigo              TEXT NOT NULL,
  nombre              TEXT NOT NULL,
  tipo                TEXT NOT NULL CHECK (tipo IN ('activo','pasivo','patrimonio','ingreso','gasto','costo')),
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
  estado       TEXT NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto','cerrado')),
  anio         INT,
  mes          INT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, fecha_inicio, fecha_fin)
);

CREATE TABLE IF NOT EXISTS asientos_contables (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id      UUID NOT NULL,
  periodo_id      UUID REFERENCES periodos_contables(id) ON DELETE SET NULL,
  numero_asiento  TEXT NOT NULL,
  numero          INT,
  fecha           DATE NOT NULL,
  descripcion     TEXT NOT NULL,
  concepto        TEXT,
  tipo            TEXT DEFAULT 'manual',
  referencia_tipo TEXT,
  referencia_id   UUID,
  referencia_num  TEXT,
  periodo_anio    INT,
  periodo_mes     INT,
  ref_factura_id  UUID REFERENCES facturas(id) ON DELETE SET NULL,
  ref_compra_id   UUID REFERENCES compras(id) ON DELETE SET NULL,
  ref_pago_id     UUID REFERENCES pagos(id) ON DELETE SET NULL,
  estado          TEXT NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador','aprobado','anulado','contabilizado')),
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
  orden        INT DEFAULT 0,
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
  tipo         TEXT NOT NULL CHECK (tipo IN ('balance_general','estado_resultados','flujo_caja')),
  datos        JSONB NOT NULL DEFAULT '{}'::JSONB,
  generado_en  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (periodo_id, tipo)
);

-- ÍNDICES
CREATE INDEX IF NOT EXISTS idx_facturas_empresa      ON facturas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_facturas_fecha        ON facturas(fecha_emision);
CREATE INDEX IF NOT EXISTS idx_facturas_cliente      ON facturas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_compras_empresa       ON compras(empresa_id);
CREATE INDEX IF NOT EXISTS idx_compras_fecha         ON compras(fecha_compra);
CREATE INDEX IF NOT EXISTS idx_compras_proveedor     ON compras(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_detalle_fact          ON detalle_facturas(factura_id);
CREATE INDEX IF NOT EXISTS idx_detalle_comp          ON detalle_compras(compra_id);
CREATE INDEX IF NOT EXISTS idx_lotes_producto        ON lotes_inventario(producto_id);
CREATE INDEX IF NOT EXISTS idx_lotes_fecha           ON lotes_inventario(fecha_entrada);
CREATE INDEX IF NOT EXISTS idx_movinv_producto       ON movimientos_inventario(producto_id);
CREATE INDEX IF NOT EXISTS idx_movcaja_empresa       ON movimientos_caja(empresa_id);
CREATE INDEX IF NOT EXISTS idx_movcaja_fecha         ON movimientos_caja(fecha);
CREATE INDEX IF NOT EXISTS idx_txbanco_empresa       ON transacciones_banco(empresa_id);
CREATE INDEX IF NOT EXISTS idx_txbanco_fecha         ON transacciones_banco(fecha);
CREATE INDEX IF NOT EXISTS idx_pagos_factura         ON pagos(ref_factura_id);
CREATE INDEX IF NOT EXISTS idx_pagos_compra          ON pagos(ref_compra_id);
CREATE INDEX IF NOT EXISTS idx_asientos_empresa      ON asientos_contables(empresa_id);
CREATE INDEX IF NOT EXISTS idx_asientos_periodo      ON asientos_contables(periodo_id);
CREATE INDEX IF NOT EXISTS idx_asientos_det          ON asientos_detalle(asiento_id);
CREATE INDEX IF NOT EXISTS idx_plan_cuentas_empresa  ON plan_cuentas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_consecutivos_empresa  ON consecutivos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_clientes_empresa      ON clientes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_proveedores_empresa   ON proveedores(empresa_id);
CREATE INDEX IF NOT EXISTS idx_productos_empresa     ON productos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_cuentas_caja_empresa  ON cuentas_caja(empresa_id);
CREATE INDEX IF NOT EXISTS idx_cuentas_banco_empresa ON cuentas_banco(empresa_id);
CREATE INDEX IF NOT EXISTS idx_cheques_empresa       ON cheques(empresa_id);

-- ROW LEVEL SECURITY
CREATE OR REPLACE FUNCTION get_empresa_ids()
RETURNS UUID[] AS $$
  SELECT ARRAY(
    SELECT id FROM empresas_persona_natural WHERE user_id = auth.uid()
    UNION
    SELECT id FROM empresas_juridicas WHERE user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

ALTER TABLE empresas_persona_natural ENABLE ROW LEVEL SECURITY;
ALTER TABLE empresas_juridicas       ENABLE ROW LEVEL SECURITY;
ALTER TABLE consecutivos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE proveedores              ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos                ENABLE ROW LEVEL SECURITY;
ALTER TABLE lotes_inventario         ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_inventario   ENABLE ROW LEVEL SECURITY;
ALTER TABLE facturas                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE detalle_facturas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE compras                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE detalle_compras          ENABLE ROW LEVEL SECURITY;
ALTER TABLE cuentas_caja             ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_caja         ENABLE ROW LEVEL SECURITY;
ALTER TABLE cuentas_banco            ENABLE ROW LEVEL SECURITY;
ALTER TABLE transacciones_banco      ENABLE ROW LEVEL SECURITY;
ALTER TABLE cheques                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_cuentas             ENABLE ROW LEVEL SECURITY;
ALTER TABLE periodos_contables       ENABLE ROW LEVEL SECURITY;
ALTER TABLE asientos_contables       ENABLE ROW LEVEL SECURITY;
ALTER TABLE asientos_detalle         ENABLE ROW LEVEL SECURITY;
ALTER TABLE saldos_mayor             ENABLE ROW LEVEL SECURITY;
ALTER TABLE estados_financieros      ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "empresa_natural_owner" ON empresas_persona_natural;
  CREATE POLICY "empresa_natural_owner" ON empresas_persona_natural FOR ALL USING (user_id = auth.uid());

  DROP POLICY IF EXISTS "empresa_juridica_owner" ON empresas_juridicas;
  CREATE POLICY "empresa_juridica_owner" ON empresas_juridicas FOR ALL USING (user_id = auth.uid());

  DROP POLICY IF EXISTS "own_empresa" ON consecutivos;
  CREATE POLICY "own_empresa" ON consecutivos FOR ALL USING (empresa_id = ANY(get_empresa_ids()));

  DROP POLICY IF EXISTS "own_empresa" ON clientes;
  CREATE POLICY "own_empresa" ON clientes FOR ALL USING (empresa_id = ANY(get_empresa_ids()));

  DROP POLICY IF EXISTS "own_empresa" ON proveedores;
  CREATE POLICY "own_empresa" ON proveedores FOR ALL USING (empresa_id = ANY(get_empresa_ids()));

  DROP POLICY IF EXISTS "own_empresa" ON productos;
  CREATE POLICY "own_empresa" ON productos FOR ALL USING (empresa_id = ANY(get_empresa_ids()));

  DROP POLICY IF EXISTS "own_empresa" ON lotes_inventario;
  CREATE POLICY "own_empresa" ON lotes_inventario FOR ALL USING (empresa_id = ANY(get_empresa_ids()));

  DROP POLICY IF EXISTS "own_empresa" ON movimientos_inventario;
  CREATE POLICY "own_empresa" ON movimientos_inventario FOR ALL USING (empresa_id = ANY(get_empresa_ids()));

  DROP POLICY IF EXISTS "own_empresa" ON facturas;
  CREATE POLICY "own_empresa" ON facturas FOR ALL USING (empresa_id = ANY(get_empresa_ids()));

  DROP POLICY IF EXISTS "own_empresa" ON compras;
  CREATE POLICY "own_empresa" ON compras FOR ALL USING (empresa_id = ANY(get_empresa_ids()));

  DROP POLICY IF EXISTS "own_empresa" ON cuentas_caja;
  CREATE POLICY "own_empresa" ON cuentas_caja FOR ALL USING (empresa_id = ANY(get_empresa_ids()));

  DROP POLICY IF EXISTS "own_empresa" ON movimientos_caja;
  CREATE POLICY "own_empresa" ON movimientos_caja FOR ALL USING (empresa_id = ANY(get_empresa_ids()));

  DROP POLICY IF EXISTS "own_empresa" ON cuentas_banco;
  CREATE POLICY "own_empresa" ON cuentas_banco FOR ALL USING (empresa_id = ANY(get_empresa_ids()));

  DROP POLICY IF EXISTS "own_empresa" ON transacciones_banco;
  CREATE POLICY "own_empresa" ON transacciones_banco FOR ALL USING (empresa_id = ANY(get_empresa_ids()));

  DROP POLICY IF EXISTS "own_empresa" ON cheques;
  CREATE POLICY "own_empresa" ON cheques FOR ALL USING (empresa_id = ANY(get_empresa_ids()));

  DROP POLICY IF EXISTS "own_empresa" ON pagos;
  CREATE POLICY "own_empresa" ON pagos FOR ALL USING (empresa_id = ANY(get_empresa_ids()));

  DROP POLICY IF EXISTS "own_empresa" ON plan_cuentas;
  CREATE POLICY "own_empresa" ON plan_cuentas FOR ALL USING (empresa_id = ANY(get_empresa_ids()));

  DROP POLICY IF EXISTS "own_empresa" ON periodos_contables;
  CREATE POLICY "own_empresa" ON periodos_contables FOR ALL USING (empresa_id = ANY(get_empresa_ids()));

  DROP POLICY IF EXISTS "own_empresa" ON asientos_contables;
  CREATE POLICY "own_empresa" ON asientos_contables FOR ALL USING (empresa_id = ANY(get_empresa_ids()));

  DROP POLICY IF EXISTS "own_empresa" ON saldos_mayor;
  CREATE POLICY "own_empresa" ON saldos_mayor FOR ALL USING (empresa_id = ANY(get_empresa_ids()));

  DROP POLICY IF EXISTS "own_empresa" ON estados_financieros;
  CREATE POLICY "own_empresa" ON estados_financieros FOR ALL USING (empresa_id = ANY(get_empresa_ids()));

  DROP POLICY IF EXISTS "via_factura" ON detalle_facturas;
  CREATE POLICY "via_factura" ON detalle_facturas FOR ALL USING (
    factura_id IN (SELECT id FROM facturas WHERE empresa_id = ANY(get_empresa_ids()))
  );

  DROP POLICY IF EXISTS "via_compra" ON detalle_compras;
  CREATE POLICY "via_compra" ON detalle_compras FOR ALL USING (
    compra_id IN (SELECT id FROM compras WHERE empresa_id = ANY(get_empresa_ids()))
  );

  DROP POLICY IF EXISTS "via_asiento" ON asientos_detalle;
  CREATE POLICY "via_asiento" ON asientos_detalle FOR ALL USING (
    asiento_id IN (SELECT id FROM asientos_contables WHERE empresa_id = ANY(get_empresa_ids()))
  );
END$$;
