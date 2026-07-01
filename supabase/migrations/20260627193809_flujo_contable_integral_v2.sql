
-- ============================================================
-- SARA ERP - Flujo Contable Integral v2
-- ============================================================

-- ============================================================
-- PARTE 1: CUENTAS BANCARIAS EN PLAN DE CUENTAS
-- ============================================================
INSERT INTO plan_cuentas (empresa_id, codigo, nombre, tipo, nivel, permite_movimiento, activa)
SELECT '1c71f63d-3979-4639-a81c-7e6df095841d','1.1.02','Bancos','activo',2,false,true
WHERE NOT EXISTS (SELECT 1 FROM plan_cuentas WHERE empresa_id='1c71f63d-3979-4639-a81c-7e6df095841d' AND codigo='1.1.02');

INSERT INTO plan_cuentas (empresa_id, codigo, nombre, tipo, nivel, permite_movimiento, activa)
SELECT '1c71f63d-3979-4639-a81c-7e6df095841d','1.1.02.01','Banco - Cuenta Corriente','activo',3,true,true
WHERE NOT EXISTS (SELECT 1 FROM plan_cuentas WHERE empresa_id='1c71f63d-3979-4639-a81c-7e6df095841d' AND codigo='1.1.02.01');

INSERT INTO plan_cuentas (empresa_id, codigo, nombre, tipo, nivel, permite_movimiento, activa)
SELECT '1c71f63d-3979-4639-a81c-7e6df095841d','1.1.02.02','Tarjetas por Cobrar (POS)','activo',3,true,true
WHERE NOT EXISTS (SELECT 1 FROM plan_cuentas WHERE empresa_id='1c71f63d-3979-4639-a81c-7e6df095841d' AND codigo='1.1.02.02');

-- ============================================================
-- PARTE 2: TRIGGER SALDO CAJA
-- ============================================================
CREATE OR REPLACE FUNCTION fn_actualizar_saldo_caja()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.tipo = 'ingreso' THEN
      UPDATE cuentas_caja SET saldo_actual = saldo_actual + NEW.monto, updated_at = NOW()
      WHERE id = NEW.cuenta_caja_id;
    ELSIF NEW.tipo = 'egreso' THEN
      UPDATE cuentas_caja SET saldo_actual = saldo_actual - NEW.monto, updated_at = NOW()
      WHERE id = NEW.cuenta_caja_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.estado = 'anulado' AND OLD.estado = 'registrado' THEN
      IF OLD.tipo = 'ingreso' THEN
        UPDATE cuentas_caja SET saldo_actual = saldo_actual - OLD.monto, updated_at = NOW()
        WHERE id = OLD.cuenta_caja_id;
      ELSIF OLD.tipo = 'egreso' THEN
        UPDATE cuentas_caja SET saldo_actual = saldo_actual + OLD.monto, updated_at = NOW()
        WHERE id = OLD.cuenta_caja_id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_saldo_caja ON movimientos_caja;
CREATE TRIGGER trg_saldo_caja
  AFTER INSERT OR UPDATE OF estado ON movimientos_caja
  FOR EACH ROW EXECUTE FUNCTION fn_actualizar_saldo_caja();

-- ============================================================
-- PARTE 3: TRIGGER SALDO BANCO
-- ============================================================
CREATE OR REPLACE FUNCTION fn_actualizar_saldo_banco()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.ref_factura_id IS NOT NULL THEN
      UPDATE cuentas_banco SET saldo_actual = saldo_actual + NEW.monto, updated_at = NOW()
      WHERE id = NEW.cuenta_banco_id;
    ELSIF NEW.ref_compra_id IS NOT NULL THEN
      UPDATE cuentas_banco SET saldo_actual = saldo_actual - NEW.monto, updated_at = NOW()
      WHERE id = NEW.cuenta_banco_id;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.estado = 'anulado' AND OLD.estado = 'registrado' THEN
      IF OLD.ref_factura_id IS NOT NULL THEN
        UPDATE cuentas_banco SET saldo_actual = saldo_actual - OLD.monto, updated_at = NOW()
        WHERE id = OLD.cuenta_banco_id;
      ELSIF OLD.ref_compra_id IS NOT NULL THEN
        UPDATE cuentas_banco SET saldo_actual = saldo_actual + OLD.monto, updated_at = NOW()
        WHERE id = OLD.cuenta_banco_id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_saldo_banco ON transacciones_banco;
CREATE TRIGGER trg_saldo_banco
  AFTER INSERT OR UPDATE OF estado ON transacciones_banco
  FOR EACH ROW EXECUTE FUNCTION fn_actualizar_saldo_banco();

-- ============================================================
-- PARTE 4: TRIGGER FACTURA (con lógica por tipo_pago)
-- ============================================================
CREATE OR REPLACE FUNCTION fn_contabilizar_factura()
RETURNS TRIGGER AS $$
DECLARE
  v_asiento_id    UUID;
  v_numero        INT;
  v_anio          INT; v_mes INT;
  v_num_str       TEXT;
  v_caja_id       UUID; v_cxc_id UUID;
  v_banco_id      UUID; v_tarjeta_id UUID;
  v_ventas_id     UUID; v_iva_deb_id UUID;
  v_debe_id       UUID;
  v_cuenta_caja_id  UUID;
  v_cuenta_banco_id UUID;
BEGIN
  IF NEW.estado <> 'emitida' THEN RETURN NEW; END IF;
  IF OLD.estado = 'emitida'  THEN RETURN NEW; END IF;
  IF EXISTS (
    SELECT 1 FROM asientos_contables
    WHERE empresa_id=NEW.empresa_id AND referencia_tipo='factura'
      AND referencia_id=NEW.id AND estado<>'anulado'
  ) THEN RETURN NEW; END IF;

  v_anio   := EXTRACT(YEAR  FROM NEW.fecha_emision)::INT;
  v_mes    := EXTRACT(MONTH FROM NEW.fecha_emision)::INT;
  v_numero := get_next_numero_asiento(NEW.empresa_id, v_anio, v_mes);
  v_num_str := 'AST-'||LPAD(v_anio::TEXT,4,'0')||'-'||LPAD(v_mes::TEXT,2,'0')||'-'||LPAD(v_numero::TEXT,4,'0');

  SELECT id INTO v_caja_id    FROM plan_cuentas WHERE empresa_id=NEW.empresa_id AND codigo='1.1.01' AND activa=true LIMIT 1;
  SELECT id INTO v_cxc_id     FROM plan_cuentas WHERE empresa_id=NEW.empresa_id AND codigo='1.1.05' AND activa=true LIMIT 1;
  SELECT id INTO v_banco_id   FROM plan_cuentas WHERE empresa_id=NEW.empresa_id AND codigo='1.1.02.01' AND activa=true LIMIT 1;
  SELECT id INTO v_tarjeta_id FROM plan_cuentas WHERE empresa_id=NEW.empresa_id AND codigo='1.1.02.02' AND activa=true LIMIT 1;
  SELECT id INTO v_ventas_id  FROM plan_cuentas WHERE empresa_id=NEW.empresa_id AND codigo='4.1.01' AND activa=true LIMIT 1;
  SELECT id INTO v_iva_deb_id FROM plan_cuentas WHERE empresa_id=NEW.empresa_id AND codigo='2.1.03' AND activa=true LIMIT 1;
  IF v_ventas_id IS NULL THEN RETURN NEW; END IF;

  CASE NEW.tipo_pago
    WHEN 'contado'       THEN v_debe_id := COALESCE(v_caja_id, v_cxc_id);
    WHEN 'credito'       THEN v_debe_id := COALESCE(v_cxc_id, v_caja_id);
    WHEN 'transferencia' THEN v_debe_id := COALESCE(v_banco_id, v_caja_id);
    WHEN 'cheque'        THEN v_debe_id := COALESCE(v_banco_id, v_caja_id);
    WHEN 'tarjeta'       THEN v_debe_id := COALESCE(v_tarjeta_id, v_banco_id, v_caja_id);
    ELSE                      v_debe_id := COALESCE(v_caja_id, v_cxc_id);
  END CASE;
  IF v_debe_id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO asientos_contables (
    empresa_id, fecha, descripcion, concepto, tipo,
    referencia_tipo, referencia_id, referencia_num,
    numero_asiento, numero, periodo_anio, periodo_mes,
    ref_factura_id, estado, total_debe, total_haber
  ) VALUES (
    NEW.empresa_id, NEW.fecha_emision,
    'Venta '||NEW.numero_factura||' - '||NEW.cliente_nombre,
    'Factura '||NEW.numero_factura||' ('||NEW.tipo_pago||')',
    'ingreso','factura',NEW.id,NEW.numero_factura,
    v_num_str,v_numero,v_anio,v_mes,
    NEW.id,'aprobado',NEW.total,NEW.total
  ) RETURNING id INTO v_asiento_id;

  INSERT INTO asientos_detalle (asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
  VALUES (v_asiento_id,v_debe_id,
    CASE NEW.tipo_pago
      WHEN 'contado'       THEN 'Cobro contado - '
      WHEN 'credito'       THEN 'CxC - '
      WHEN 'transferencia' THEN 'Transferencia bancaria - '
      WHEN 'cheque'        THEN 'Cheque recibido - '
      WHEN 'tarjeta'       THEN 'Tarjeta POS - '
      ELSE 'Cobro - '
    END||NEW.numero_factura,
    NEW.total,0,1,NEW.empresa_id);

  INSERT INTO asientos_detalle (asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
  VALUES (v_asiento_id,v_ventas_id,'Venta - '||NEW.numero_factura,0,NEW.subtotal,2,NEW.empresa_id);

  IF NEW.iva_total > 0 AND v_iva_deb_id IS NOT NULL THEN
    INSERT INTO asientos_detalle (asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
    VALUES (v_asiento_id,v_iva_deb_id,'IVA 15% - '||NEW.numero_factura,0,NEW.iva_total,3,NEW.empresa_id);
  END IF;

  -- Movimiento Caja (contado)
  IF NEW.tipo_pago = 'contado' THEN
    SELECT id INTO v_cuenta_caja_id FROM cuentas_caja
    WHERE empresa_id=NEW.empresa_id AND activa=true
    ORDER BY tipo='caja_general' DESC, created_at LIMIT 1;
    IF v_cuenta_caja_id IS NOT NULL THEN
      INSERT INTO movimientos_caja(empresa_id,cuenta_caja_id,tipo,monto,descripcion,ref_factura_id,asiento_id,fecha)
      VALUES(NEW.empresa_id,v_cuenta_caja_id,'ingreso',NEW.total,
        'Venta contado '||NEW.numero_factura||' - '||NEW.cliente_nombre,
        NEW.id,v_asiento_id,NEW.fecha_emision);
    END IF;

  -- Transacción Banco (transferencia, cheque, tarjeta)
  ELSIF NEW.tipo_pago IN ('transferencia','cheque','tarjeta') THEN
    SELECT id INTO v_cuenta_banco_id FROM cuentas_banco
    WHERE empresa_id=NEW.empresa_id AND activa=true ORDER BY created_at LIMIT 1;
    IF v_cuenta_banco_id IS NOT NULL THEN
      INSERT INTO transacciones_banco(empresa_id,cuenta_banco_id,tipo,monto,descripcion,ref_factura_id,asiento_id,fecha)
      VALUES(NEW.empresa_id,v_cuenta_banco_id,
        CASE NEW.tipo_pago WHEN 'cheque' THEN 'cheque' WHEN 'tarjeta' THEN 'tarjeta' ELSE 'transferencia' END,
        NEW.total,
        'Cobro '||NEW.tipo_pago||' - '||NEW.numero_factura||' - '||NEW.cliente_nombre,
        NEW.id,v_asiento_id,NEW.fecha_emision);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_contabilizar_factura ON facturas;
CREATE TRIGGER trg_contabilizar_factura
  AFTER INSERT OR UPDATE OF estado ON facturas
  FOR EACH ROW EXECUTE FUNCTION fn_contabilizar_factura();

-- ============================================================
-- PARTE 5: TRIGGER COMPRA (con lógica por tipo_pago)
-- ============================================================
CREATE OR REPLACE FUNCTION fn_contabilizar_compra()
RETURNS TRIGGER AS $$
DECLARE
  v_asiento_id    UUID;
  v_numero        INT; v_anio INT; v_mes INT;
  v_num_str       TEXT;
  v_inventario_id UUID; v_iva_cred_id UUID;
  v_cxp_id        UUID; v_caja_id UUID; v_banco_id UUID;
  v_haber_id      UUID;
  v_cuenta_caja_id  UUID;
  v_cuenta_banco_id UUID;
BEGIN
  IF NEW.estado <> 'recibida' THEN RETURN NEW; END IF;
  IF OLD.estado = 'recibida'  THEN RETURN NEW; END IF;
  IF EXISTS (
    SELECT 1 FROM asientos_contables
    WHERE empresa_id=NEW.empresa_id AND referencia_tipo='compra'
      AND referencia_id=NEW.id AND estado<>'anulado'
  ) THEN RETURN NEW; END IF;

  v_anio   := EXTRACT(YEAR  FROM NEW.fecha_compra)::INT;
  v_mes    := EXTRACT(MONTH FROM NEW.fecha_compra)::INT;
  v_numero := get_next_numero_asiento(NEW.empresa_id, v_anio, v_mes);
  v_num_str := 'AST-'||LPAD(v_anio::TEXT,4,'0')||'-'||LPAD(v_mes::TEXT,2,'0')||'-'||LPAD(v_numero::TEXT,4,'0');

  SELECT id INTO v_inventario_id FROM plan_cuentas WHERE empresa_id=NEW.empresa_id AND codigo='1.1.08' AND activa=true LIMIT 1;
  SELECT id INTO v_iva_cred_id   FROM plan_cuentas WHERE empresa_id=NEW.empresa_id AND codigo='1.1.09' AND activa=true LIMIT 1;
  SELECT id INTO v_cxp_id        FROM plan_cuentas WHERE empresa_id=NEW.empresa_id AND codigo='2.1.01' AND activa=true LIMIT 1;
  SELECT id INTO v_caja_id       FROM plan_cuentas WHERE empresa_id=NEW.empresa_id AND codigo='1.1.01' AND activa=true LIMIT 1;
  SELECT id INTO v_banco_id      FROM plan_cuentas WHERE empresa_id=NEW.empresa_id AND codigo='1.1.02.01' AND activa=true LIMIT 1;
  IF v_inventario_id IS NULL THEN RETURN NEW; END IF;

  CASE NEW.tipo_pago
    WHEN 'credito'       THEN v_haber_id := COALESCE(v_cxp_id, v_caja_id);
    WHEN 'contado'       THEN v_haber_id := COALESCE(v_caja_id, v_cxp_id);
    WHEN 'transferencia' THEN v_haber_id := COALESCE(v_banco_id, v_caja_id);
    WHEN 'cheque'        THEN v_haber_id := COALESCE(v_banco_id, v_caja_id);
    WHEN 'tarjeta'       THEN v_haber_id := COALESCE(v_banco_id, v_caja_id);
    ELSE                      v_haber_id := COALESCE(v_caja_id, v_cxp_id);
  END CASE;
  IF v_haber_id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO asientos_contables (
    empresa_id, fecha, descripcion, concepto, tipo,
    referencia_tipo, referencia_id, referencia_num,
    numero_asiento, numero, periodo_anio, periodo_mes,
    ref_compra_id, estado, total_debe, total_haber
  ) VALUES (
    NEW.empresa_id, NEW.fecha_compra,
    'Compra '||NEW.numero_compra,
    'Compra '||NEW.numero_compra||' ('||NEW.tipo_pago||')',
    'egreso','compra',NEW.id,NEW.numero_compra,
    v_num_str,v_numero,v_anio,v_mes,
    NEW.id,'aprobado',NEW.total,NEW.total
  ) RETURNING id INTO v_asiento_id;

  INSERT INTO asientos_detalle (asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
  VALUES (v_asiento_id,v_inventario_id,'Inventario - '||NEW.numero_compra,NEW.subtotal,0,1,NEW.empresa_id);

  IF NEW.iva_total > 0 AND v_iva_cred_id IS NOT NULL THEN
    INSERT INTO asientos_detalle (asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
    VALUES (v_asiento_id,v_iva_cred_id,'IVA CF 15% - '||NEW.numero_compra,NEW.iva_total,0,2,NEW.empresa_id);
  END IF;

  INSERT INTO asientos_detalle (asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
  VALUES (v_asiento_id,v_haber_id,
    CASE NEW.tipo_pago
      WHEN 'credito'       THEN 'CxP proveedor - '
      WHEN 'contado'       THEN 'Pago contado - '
      WHEN 'transferencia' THEN 'Transferencia bancaria - '
      WHEN 'cheque'        THEN 'Cheque emitido - '
      WHEN 'tarjeta'       THEN 'Tarjeta - '
      ELSE 'Pago - '
    END||NEW.numero_compra,
    0,NEW.total,3,NEW.empresa_id);

  -- Caja (contado)
  IF NEW.tipo_pago = 'contado' THEN
    SELECT id INTO v_cuenta_caja_id FROM cuentas_caja
    WHERE empresa_id=NEW.empresa_id AND activa=true
    ORDER BY tipo='caja_general' DESC, created_at LIMIT 1;
    IF v_cuenta_caja_id IS NOT NULL THEN
      INSERT INTO movimientos_caja(empresa_id,cuenta_caja_id,tipo,monto,descripcion,ref_compra_id,asiento_id,fecha)
      VALUES(NEW.empresa_id,v_cuenta_caja_id,'egreso',NEW.total,
        'Pago contado '||NEW.numero_compra,NEW.id,v_asiento_id,NEW.fecha_compra);
    END IF;

  -- Banco (transferencia, cheque, tarjeta)
  ELSIF NEW.tipo_pago IN ('transferencia','cheque','tarjeta') THEN
    SELECT id INTO v_cuenta_banco_id FROM cuentas_banco
    WHERE empresa_id=NEW.empresa_id AND activa=true ORDER BY created_at LIMIT 1;
    IF v_cuenta_banco_id IS NOT NULL THEN
      INSERT INTO transacciones_banco(empresa_id,cuenta_banco_id,tipo,monto,descripcion,ref_compra_id,asiento_id,fecha)
      VALUES(NEW.empresa_id,v_cuenta_banco_id,
        CASE NEW.tipo_pago WHEN 'cheque' THEN 'cheque' WHEN 'tarjeta' THEN 'tarjeta' ELSE 'transferencia' END,
        NEW.total,'Pago '||NEW.tipo_pago||' - '||NEW.numero_compra,
        NEW.id,v_asiento_id,NEW.fecha_compra);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_contabilizar_compra ON compras;
CREATE TRIGGER trg_contabilizar_compra
  AFTER INSERT OR UPDATE OF estado ON compras
  FOR EACH ROW EXECUTE FUNCTION fn_contabilizar_compra();

-- ============================================================
-- PARTE 6: FUNCIÓN LIBRO MAYOR
-- ============================================================
CREATE OR REPLACE FUNCTION get_libro_mayor(
  p_empresa_id UUID, p_anio INT,
  p_mes_inicio INT DEFAULT 1, p_mes_fin INT DEFAULT 12,
  p_cuenta_id UUID DEFAULT NULL
)
RETURNS TABLE (
  cuenta_id UUID, codigo TEXT, nombre TEXT, tipo TEXT,
  total_debe NUMERIC, total_haber NUMERIC,
  saldo_deudor NUMERIC, saldo_acreedor NUMERIC,
  movimientos BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pc.id, pc.codigo, pc.nombre, pc.tipo,
    COALESCE(SUM(d.debe),0),
    COALESCE(SUM(d.haber),0),
    GREATEST(COALESCE(SUM(d.debe),0)-COALESCE(SUM(d.haber),0),0),
    GREATEST(COALESCE(SUM(d.haber),0)-COALESCE(SUM(d.debe),0),0),
    COUNT(d.id)
  FROM plan_cuentas pc
  LEFT JOIN asientos_detalle d ON d.cuenta_id=pc.id
  LEFT JOIN asientos_contables a ON a.id=d.asiento_id
    AND a.empresa_id=p_empresa_id
    AND a.periodo_anio=p_anio
    AND a.periodo_mes BETWEEN p_mes_inicio AND p_mes_fin
    AND a.estado<>'anulado'
  WHERE pc.empresa_id=p_empresa_id AND pc.activa=true AND pc.permite_movimiento=true
    AND (p_cuenta_id IS NULL OR pc.id=p_cuenta_id)
  GROUP BY pc.id,pc.codigo,pc.nombre,pc.tipo
  HAVING COALESCE(SUM(d.debe),0)>0 OR COALESCE(SUM(d.haber),0)>0
  ORDER BY pc.codigo;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- PARTE 7: FUNCIÓN DETALLE DE MOVIMIENTOS POR CUENTA
-- ============================================================
CREATE OR REPLACE FUNCTION get_movimientos_cuenta(
  p_empresa_id UUID, p_cuenta_id UUID, p_anio INT, p_mes INT DEFAULT NULL
)
RETURNS TABLE (
  asiento_id UUID, numero_asiento TEXT, fecha DATE,
  descripcion TEXT, referencia TEXT,
  debe NUMERIC, haber NUMERIC, saldo NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH movs AS (
    SELECT a.id,a.numero_asiento,a.fecha,a.descripcion,
      COALESCE(a.referencia_num,a.referencia_tipo) AS referencia,
      d.debe,d.haber
    FROM asientos_detalle d
    JOIN asientos_contables a ON a.id=d.asiento_id
    WHERE d.cuenta_id=p_cuenta_id AND a.empresa_id=p_empresa_id
      AND a.periodo_anio=p_anio
      AND (p_mes IS NULL OR a.periodo_mes=p_mes)
      AND a.estado<>'anulado'
    ORDER BY a.fecha,a.numero_asiento
  )
  SELECT m.id,m.numero_asiento,m.fecha,m.descripcion,m.referencia,m.debe,m.haber,
    SUM(m.debe-m.haber) OVER (ORDER BY m.fecha,m.numero_asiento ROWS UNBOUNDED PRECEDING)
  FROM movs m;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- PARTE 8: RETROACTIVO - Anular asientos viejos y regenerar
-- ============================================================
UPDATE asientos_contables
SET estado='anulado', descripcion=descripcion||' [REGENERADO]'
WHERE empresa_id='1c71f63d-3979-4639-a81c-7e6df095841d' AND estado='aprobado';

-- Ciclo borrador→emitida para facturas
UPDATE facturas SET estado='borrador'
WHERE empresa_id='1c71f63d-3979-4639-a81c-7e6df095841d' AND estado='emitida';

UPDATE facturas SET estado='emitida'
WHERE empresa_id='1c71f63d-3979-4639-a81c-7e6df095841d' AND estado='borrador';

-- Ciclo borrador→recibida para compras
UPDATE compras SET estado='borrador'
WHERE empresa_id='1c71f63d-3979-4639-a81c-7e6df095841d' AND estado='recibida';

UPDATE compras SET estado='recibida'
WHERE empresa_id='1c71f63d-3979-4639-a81c-7e6df095841d' AND estado='borrador';
