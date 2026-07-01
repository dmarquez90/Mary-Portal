
-- ================================================================
-- CICLO CONTABLE COMPLETO — SARA
-- Cubre todos los eventos que deben generar asientos automáticos:
-- 1. Nota de Crédito (devolución venta)
-- 2. Nota de Débito (cargo adicional compra)
-- 3. Anulación de Factura → reversa asiento + stock
-- 4. Anulación de Compra → reversa asiento (stock ya lo maneja trg_stock_cambio_estado)
-- 5. Planilla aprobada → asiento nómina
-- 6. Depreciación mensual → asiento depreciación
-- 7. Anticipo IR pagado → asiento anticipo
-- ================================================================

-- ────────────────────────────────────────────────────────────────
-- HELPER: obtener cuenta del plan de cuentas por código
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_cuenta_id(p_empresa_id UUID, p_codigo TEXT)
RETURNS UUID AS $$
  SELECT id FROM plan_cuentas
  WHERE empresa_id = p_empresa_id AND codigo = p_codigo AND activa = true
  LIMIT 1;
$$ LANGUAGE sql STABLE;


-- ================================================================
-- 1. NOTA DE CRÉDITO → asiento contable + inventario
-- Trigger: AFTER INSERT en notas_credito_debito WHERE tipo='credito'
-- Asiento:
--   DB 4.1.03  Devoluciones en Ventas   (subtotal)
--   DB 2.1.03  IVA Débito Fiscal        (iva)
--   CR 1.1.05  CxC Clientes             (total) — si fue a crédito
--   CR 1.1.01/1.1.03  Caja/Banco        (total) — si fue contado/banco
-- ================================================================
CREATE OR REPLACE FUNCTION fn_contabilizar_nota_credito()
RETURNS TRIGGER AS $$
DECLARE
  v_asiento_id   UUID;
  v_numero       INT;
  v_anio         INT; v_mes INT;
  v_num_str      TEXT;
  v_dev_ventas   UUID;  -- 4.1.03
  v_iva_deb      UUID;  -- 2.1.03
  v_contrapartida UUID; -- CxC o Caja según tipo_pago de la factura origen
  v_tipo_pago    TEXT;
  v_caja_id      UUID;  -- 1.1.01
  v_banco_id     UUID;  -- cuenta contable del banco usado
  v_cxc_id       UUID;  -- 1.1.05
BEGIN
  -- Solo NC
  IF NEW.tipo <> 'credito' THEN RETURN NEW; END IF;

  -- Evitar duplicados
  IF EXISTS (
    SELECT 1 FROM asientos_contables
    WHERE empresa_id = NEW.empresa_id
      AND referencia_tipo = 'nota_credito'
      AND referencia_id = NEW.id
      AND estado <> 'anulado'
  ) THEN RETURN NEW; END IF;

  v_anio := EXTRACT(YEAR  FROM NEW.fecha)::INT;
  v_mes  := EXTRACT(MONTH FROM NEW.fecha)::INT;
  v_numero  := get_next_numero_asiento(NEW.empresa_id, v_anio, v_mes);
  v_num_str := 'AST-' || LPAD(v_anio::TEXT,4,'0') || '-'
                       || LPAD(v_mes::TEXT,2,'0')  || '-'
                       || LPAD(v_numero::TEXT,4,'0');

  -- Cuentas
  v_dev_ventas := get_cuenta_id(NEW.empresa_id, '4.1.03');
  v_iva_deb    := get_cuenta_id(NEW.empresa_id, '2.1.03');
  v_cxc_id     := get_cuenta_id(NEW.empresa_id, '1.1.05');
  v_caja_id    := get_cuenta_id(NEW.empresa_id, '1.1.01');

  IF v_dev_ventas IS NULL THEN RETURN NEW; END IF;

  -- Resolver contrapartida según tipo_pago de la factura origen
  IF NEW.ref_factura_id IS NOT NULL THEN
    SELECT f.tipo_pago INTO v_tipo_pago
    FROM facturas f WHERE f.id = NEW.ref_factura_id;

    IF v_tipo_pago IN ('transferencia','cheque','tarjeta') THEN
      -- Usar cuenta contable del banco vinculado a la factura
      SELECT cb.cuenta_contable_id INTO v_banco_id
      FROM facturas f
      JOIN cuentas_banco cb ON cb.id = f.cuenta_banco_id
      WHERE f.id = NEW.ref_factura_id;
      -- Fallback: primera cuenta banco activa
      IF v_banco_id IS NULL THEN
        SELECT cb.cuenta_contable_id INTO v_banco_id
        FROM cuentas_banco cb
        WHERE cb.empresa_id = NEW.empresa_id AND cb.activa = true
        ORDER BY cb.created_at LIMIT 1;
      END IF;
      v_contrapartida := COALESCE(v_banco_id, v_caja_id);
    ELSIF v_tipo_pago = 'credito' THEN
      v_contrapartida := v_cxc_id;
    ELSE
      v_contrapartida := v_caja_id;
    END IF;
  ELSE
    v_contrapartida := v_cxc_id; -- default: reduce CxC
  END IF;

  IF v_contrapartida IS NULL THEN v_contrapartida := v_cxc_id; END IF;

  -- Crear asiento
  INSERT INTO asientos_contables (
    empresa_id, fecha, descripcion, concepto, tipo,
    referencia_tipo, referencia_id, referencia_num,
    numero_asiento, numero, periodo_anio, periodo_mes,
    estado, total_debe, total_haber
  ) VALUES (
    NEW.empresa_id, NEW.fecha,
    'Nota de Crédito ' || NEW.numero_nota || ' — ' || NEW.motivo,
    'NC ' || NEW.numero_nota,
    'egreso', 'nota_credito', NEW.id, NEW.numero_nota,
    v_num_str, v_numero, v_anio, v_mes,
    'aprobado', NEW.total, NEW.total
  ) RETURNING id INTO v_asiento_id;

  -- DB 4.1.03 Devoluciones en Ventas
  INSERT INTO asientos_detalle (asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
  VALUES (v_asiento_id, v_dev_ventas,
    'Devolución venta NC ' || NEW.numero_nota, NEW.subtotal, 0, 1, NEW.empresa_id);

  -- DB 2.1.03 IVA Débito Fiscal (reversa)
  IF NEW.iva > 0 AND v_iva_deb IS NOT NULL THEN
    INSERT INTO asientos_detalle (asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
    VALUES (v_asiento_id, v_iva_deb,
      'IVA s/devolución NC ' || NEW.numero_nota, NEW.iva, 0, 2, NEW.empresa_id);
  END IF;

  -- CR contrapartida (CxC, Caja o Banco)
  INSERT INTO asientos_detalle (asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
  VALUES (v_asiento_id, v_contrapartida,
    'Crédito a cliente NC ' || NEW.numero_nota, 0, NEW.total, 3, NEW.empresa_id);

  -- Guardar asiento_id en la nota
  UPDATE notas_credito_debito SET asiento_id = v_asiento_id WHERE id = NEW.id;

  -- Inventario: restaurar stock por cada ítem de la NC
  -- (solo si tiene detalles con producto_id)
  PERFORM fn_nc_restaurar_inventario(NEW.id, NEW.empresa_id, NEW.numero_nota);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Helper inventario para NC
CREATE OR REPLACE FUNCTION fn_nc_restaurar_inventario(
  p_nota_id UUID, p_empresa_id UUID, p_numero_nota TEXT
) RETURNS VOID AS $$
DECLARE
  v_det RECORD;
  v_stock_antes NUMERIC;
BEGIN
  FOR v_det IN
    SELECT dn.producto_id, dn.cantidad, dn.precio_unitario
    FROM detalle_notas dn
    WHERE dn.nota_id = p_nota_id AND dn.producto_id IS NOT NULL AND dn.cantidad > 0
  LOOP
    SELECT stock_actual INTO v_stock_antes
    FROM productos WHERE id = v_det.producto_id AND empresa_id = p_empresa_id;
    IF NOT FOUND THEN CONTINUE; END IF;

    UPDATE productos
    SET stock_actual = stock_actual + v_det.cantidad, updated_at = NOW()
    WHERE id = v_det.producto_id AND empresa_id = p_empresa_id;

    INSERT INTO movimientos_inventario (
      empresa_id, producto_id, tipo, cantidad,
      costo_unitario, stock_antes, stock_despues,
      referencia, notas
    ) VALUES (
      p_empresa_id, v_det.producto_id, 'entrada', v_det.cantidad,
      v_det.precio_unitario, v_stock_antes, v_stock_antes + v_det.cantidad,
      p_numero_nota,
      'Devolución por NC ' || p_numero_nota
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contabilizar_nota_credito ON notas_credito_debito;
CREATE TRIGGER trg_contabilizar_nota_credito
  AFTER INSERT ON notas_credito_debito
  FOR EACH ROW EXECUTE FUNCTION fn_contabilizar_nota_credito();


-- ================================================================
-- 2. NOTA DE DÉBITO → asiento contable
-- Cargo adicional al proveedor (mayor costo, flete, diferencia precio)
-- Asiento:
--   DB 1.1.08  Inventario / Gasto      (subtotal)
--   DB 1.1.07  IVA Crédito Fiscal      (iva)
--   CR 2.1.01  CxP Proveedor           (total)
-- ================================================================
CREATE OR REPLACE FUNCTION fn_contabilizar_nota_debito()
RETURNS TRIGGER AS $$
DECLARE
  v_asiento_id UUID;
  v_numero     INT; v_anio INT; v_mes INT;
  v_num_str    TEXT;
  v_dev_comp   UUID;  -- 5.1.02 Devoluciones en Compras
  v_inventario UUID;  -- 1.1.08
  v_iva_cf     UUID;  -- 1.1.07
  v_cxp        UUID;  -- 2.1.01
BEGIN
  IF NEW.tipo <> 'debito' THEN RETURN NEW; END IF;

  IF EXISTS (
    SELECT 1 FROM asientos_contables
    WHERE empresa_id = NEW.empresa_id
      AND referencia_tipo = 'nota_debito'
      AND referencia_id = NEW.id AND estado <> 'anulado'
  ) THEN RETURN NEW; END IF;

  v_anio := EXTRACT(YEAR  FROM NEW.fecha)::INT;
  v_mes  := EXTRACT(MONTH FROM NEW.fecha)::INT;
  v_numero  := get_next_numero_asiento(NEW.empresa_id, v_anio, v_mes);
  v_num_str := 'AST-' || LPAD(v_anio::TEXT,4,'0') || '-'
                       || LPAD(v_mes::TEXT,2,'0')  || '-'
                       || LPAD(v_numero::TEXT,4,'0');

  v_inventario := get_cuenta_id(NEW.empresa_id, '1.1.08');
  v_iva_cf     := get_cuenta_id(NEW.empresa_id, '1.1.07');
  v_cxp        := get_cuenta_id(NEW.empresa_id, '2.1.01');

  IF v_cxp IS NULL THEN RETURN NEW; END IF;

  INSERT INTO asientos_contables (
    empresa_id, fecha, descripcion, concepto, tipo,
    referencia_tipo, referencia_id, referencia_num,
    numero_asiento, numero, periodo_anio, periodo_mes,
    estado, total_debe, total_haber
  ) VALUES (
    NEW.empresa_id, NEW.fecha,
    'Nota de Débito ' || NEW.numero_nota || ' — ' || NEW.motivo,
    'ND ' || NEW.numero_nota,
    'egreso', 'nota_debito', NEW.id, NEW.numero_nota,
    v_num_str, v_numero, v_anio, v_mes,
    'aprobado', NEW.total, NEW.total
  ) RETURNING id INTO v_asiento_id;

  -- DB Inventario (cargo adicional)
  IF v_inventario IS NOT NULL THEN
    INSERT INTO asientos_detalle (asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
    VALUES (v_asiento_id, v_inventario,
      'Cargo adicional ND ' || NEW.numero_nota, NEW.subtotal, 0, 1, NEW.empresa_id);
  END IF;

  -- DB IVA CF
  IF NEW.iva > 0 AND v_iva_cf IS NOT NULL THEN
    INSERT INTO asientos_detalle (asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
    VALUES (v_asiento_id, v_iva_cf,
      'IVA CF ND ' || NEW.numero_nota, NEW.iva, 0, 2, NEW.empresa_id);
  END IF;

  -- CR CxP Proveedor
  INSERT INTO asientos_detalle (asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
  VALUES (v_asiento_id, v_cxp,
    'Cargo a proveedor ND ' || NEW.numero_nota, 0, NEW.total, 3, NEW.empresa_id);

  UPDATE notas_credito_debito SET asiento_id = v_asiento_id WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contabilizar_nota_debito ON notas_credito_debito;
CREATE TRIGGER trg_contabilizar_nota_debito
  AFTER INSERT ON notas_credito_debito
  FOR EACH ROW EXECUTE FUNCTION fn_contabilizar_nota_debito();


-- ================================================================
-- 3. ANULACIÓN DE FACTURA
-- Cuando factura.estado → 'anulada':
--   a) Marca el asiento original como anulado (ya existe fn_anular_asiento_factura)
--   b) Genera asiento de reversa COMPLETO (contraasiento)
--   c) Revierte movimiento de caja/banco
--   d) Restaura stock (si no vino de NC — para evitar doble conteo)
-- ================================================================
CREATE OR REPLACE FUNCTION fn_anular_factura_completo()
RETURNS TRIGGER AS $$
DECLARE
  v_asiento_orig  UUID;
  v_asiento_rev   UUID;
  v_numero        INT; v_anio INT; v_mes INT;
  v_num_str       TEXT;
  v_ventas_id     UUID;
  v_iva_deb_id    UUID;
  v_debe_id       UUID;
  v_det           RECORD;
  v_stock_antes   NUMERIC;
  v_ya_tiene_nc   BOOLEAN;
BEGIN
  IF NEW.estado <> 'anulada' OR OLD.estado = 'anulada' THEN RETURN NEW; END IF;

  -- 1. Anular asiento original
  UPDATE asientos_contables
  SET estado = 'anulado', descripcion = descripcion || ' [ANULADO]'
  WHERE empresa_id = NEW.empresa_id
    AND referencia_tipo = 'factura'
    AND referencia_id = NEW.id
    AND estado <> 'anulado';

  -- 2. Verificar si ya tiene NC total (evitar doble reversa de contabilidad)
  SELECT EXISTS (
    SELECT 1 FROM notas_credito_debito
    WHERE ref_factura_id = NEW.id AND tipo = 'credito' AND estado <> 'anulada'
      AND total >= NEW.total * 0.95  -- NC por el 95%+ del total = anulación total
  ) INTO v_ya_tiene_nc;

  -- Solo generar contraasiento si no viene de NC (que ya generó su propio asiento)
  IF NOT v_ya_tiene_nc THEN
    v_anio := EXTRACT(YEAR  FROM NEW.fecha_emision)::INT;
    v_mes  := EXTRACT(MONTH FROM NEW.fecha_emision)::INT;
    v_numero  := get_next_numero_asiento(NEW.empresa_id, v_anio, v_mes);
    v_num_str := 'AST-' || LPAD(v_anio::TEXT,4,'0') || '-'
                         || LPAD(v_mes::TEXT,2,'0')  || '-'
                         || LPAD(v_numero::TEXT,4,'0');

    v_ventas_id  := get_cuenta_id(NEW.empresa_id, '4.1.01');
    v_iva_deb_id := get_cuenta_id(NEW.empresa_id, '2.1.03');

    -- Resolver contrapartida original según tipo_pago
    CASE NEW.tipo_pago
      WHEN 'contado' THEN
        v_debe_id := get_cuenta_id(NEW.empresa_id, '1.1.01');
      WHEN 'credito' THEN
        v_debe_id := get_cuenta_id(NEW.empresa_id, '1.1.05');
      WHEN 'transferencia','cheque','tarjeta' THEN
        SELECT cb.cuenta_contable_id INTO v_debe_id
        FROM cuentas_banco cb
        WHERE cb.id = NEW.cuenta_banco_id;
        IF v_debe_id IS NULL THEN
          SELECT cb.cuenta_contable_id INTO v_debe_id
          FROM cuentas_banco cb
          WHERE cb.empresa_id = NEW.empresa_id AND cb.activa = true
          ORDER BY cb.created_at LIMIT 1;
        END IF;
      ELSE
        v_debe_id := get_cuenta_id(NEW.empresa_id, '1.1.01');
    END CASE;

    IF v_ventas_id IS NOT NULL AND v_debe_id IS NOT NULL THEN
      INSERT INTO asientos_contables (
        empresa_id, fecha, descripcion, concepto, tipo,
        referencia_tipo, referencia_id, referencia_num,
        numero_asiento, numero, periodo_anio, periodo_mes,
        estado, total_debe, total_haber
      ) VALUES (
        NEW.empresa_id, CURRENT_DATE,
        'Reversa anulación ' || NEW.numero_factura,
        'Anulación ' || NEW.numero_factura,
        'egreso', 'factura_anulada', NEW.id, NEW.numero_factura,
        v_num_str, v_numero, v_anio, v_mes,
        'aprobado', NEW.total, NEW.total
      ) RETURNING id INTO v_asiento_rev;

      -- DB Ventas (reversa)
      INSERT INTO asientos_detalle (asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
      VALUES (v_asiento_rev, v_ventas_id,
        'Reversa ventas ' || NEW.numero_factura, 0, NEW.subtotal, 1, NEW.empresa_id);

      -- DB IVA Débito (reversa)
      IF NEW.iva_total > 0 AND v_iva_deb_id IS NOT NULL THEN
        INSERT INTO asientos_detalle (asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
        VALUES (v_asiento_rev, v_iva_deb_id,
          'Reversa IVA ' || NEW.numero_factura, 0, NEW.iva_total, 2, NEW.empresa_id);
      END IF;

      -- CR Contrapartida original
      INSERT INTO asientos_detalle (asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
      VALUES (v_asiento_rev, v_debe_id,
        'Reversa cobro ' || NEW.numero_factura, NEW.total, 0, 3, NEW.empresa_id);
    END IF;
  END IF;

  -- 3. Revertir movimiento operativo de caja/banco
  UPDATE movimientos_caja
  SET estado = 'anulado'
  WHERE ref_factura_id = NEW.id AND estado = 'registrado';

  UPDATE transacciones_banco
  SET estado = 'anulado'
  WHERE ref_factura_id = NEW.id AND estado = 'registrado';

  -- Revertir saldo caja (si había movimiento)
  UPDATE cuentas_caja caj
  SET saldo_actual = saldo_actual - mc.monto
  FROM movimientos_caja mc
  WHERE mc.ref_factura_id = NEW.id
    AND mc.tipo = 'ingreso'
    AND caj.id = mc.cuenta_caja_id;

  -- Revertir saldo banco (si había movimiento)
  UPDATE cuentas_banco ban
  SET saldo_actual = saldo_actual - tb.monto
  FROM transacciones_banco tb
  WHERE tb.ref_factura_id = NEW.id
    AND ban.id = tb.cuenta_banco_id;

  -- 4. Restaurar stock (solo si no viene de NC — la NC ya lo restauró)
  IF NOT v_ya_tiene_nc THEN
    FOR v_det IN
      SELECT df.producto_id, df.cantidad, df.precio_unitario
      FROM detalle_facturas df
      WHERE df.factura_id = NEW.id AND df.producto_id IS NOT NULL
    LOOP
      SELECT stock_actual INTO v_stock_antes
      FROM productos WHERE id = v_det.producto_id AND empresa_id = NEW.empresa_id;
      IF NOT FOUND THEN CONTINUE; END IF;

      UPDATE productos
      SET stock_actual = stock_actual + v_det.cantidad, updated_at = NOW()
      WHERE id = v_det.producto_id AND empresa_id = NEW.empresa_id;

      INSERT INTO movimientos_inventario (
        empresa_id, producto_id, tipo, cantidad,
        costo_unitario, stock_antes, stock_despues,
        referencia, notas
      ) VALUES (
        NEW.empresa_id, v_det.producto_id, 'entrada', v_det.cantidad,
        v_det.precio_unitario, v_stock_antes, v_stock_antes + v_det.cantidad,
        NEW.numero_factura, 'Reversa por anulación ' || NEW.numero_factura
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_anular_factura ON facturas;
CREATE TRIGGER trg_anular_factura
  AFTER UPDATE OF estado ON facturas
  FOR EACH ROW EXECUTE FUNCTION fn_anular_factura_completo();


-- ================================================================
-- 4. ANULACIÓN DE COMPRA → contraasiento + revertir caja/banco
-- (el stock ya lo maneja trg_stock_cambio_estado_compra)
-- ================================================================
CREATE OR REPLACE FUNCTION fn_anular_compra_completo()
RETURNS TRIGGER AS $$
DECLARE
  v_asiento_rev UUID;
  v_numero      INT; v_anio INT; v_mes INT;
  v_num_str     TEXT;
  v_inventario  UUID;
  v_iva_cf      UUID;
  v_haber_id    UUID;
  v_banco_contable UUID;
BEGIN
  IF NEW.estado <> 'anulada' OR OLD.estado = 'anulada' THEN RETURN NEW; END IF;

  -- 1. Anular asiento original
  UPDATE asientos_contables
  SET estado = 'anulado', descripcion = descripcion || ' [ANULADO]'
  WHERE empresa_id = NEW.empresa_id
    AND referencia_tipo = 'compra'
    AND referencia_id = NEW.id
    AND estado <> 'anulado';

  v_anio := EXTRACT(YEAR  FROM NEW.fecha_compra)::INT;
  v_mes  := EXTRACT(MONTH FROM NEW.fecha_compra)::INT;
  v_numero  := get_next_numero_asiento(NEW.empresa_id, v_anio, v_mes);
  v_num_str := 'AST-' || LPAD(v_anio::TEXT,4,'0') || '-'
                       || LPAD(v_mes::TEXT,2,'0')  || '-'
                       || LPAD(v_numero::TEXT,4,'0');

  v_inventario := get_cuenta_id(NEW.empresa_id, '1.1.08');
  v_iva_cf     := get_cuenta_id(NEW.empresa_id, '1.1.07');

  CASE NEW.tipo_pago
    WHEN 'credito' THEN
      v_haber_id := get_cuenta_id(NEW.empresa_id, '2.1.01');
    WHEN 'contado' THEN
      v_haber_id := get_cuenta_id(NEW.empresa_id, '1.1.01');
    WHEN 'transferencia','cheque','tarjeta' THEN
      SELECT cb.cuenta_contable_id INTO v_banco_contable
      FROM cuentas_banco cb WHERE cb.id = NEW.cuenta_banco_id;
      IF v_banco_contable IS NULL THEN
        SELECT cb.cuenta_contable_id INTO v_banco_contable
        FROM cuentas_banco cb
        WHERE cb.empresa_id = NEW.empresa_id AND cb.activa = true
        ORDER BY cb.created_at LIMIT 1;
      END IF;
      v_haber_id := v_banco_contable;
    ELSE
      v_haber_id := get_cuenta_id(NEW.empresa_id, '2.1.01');
  END CASE;

  IF v_inventario IS NULL OR v_haber_id IS NULL THEN RETURN NEW; END IF;

  -- 2. Generar contraasiento
  INSERT INTO asientos_contables (
    empresa_id, fecha, descripcion, concepto, tipo,
    referencia_tipo, referencia_id, referencia_num,
    numero_asiento, numero, periodo_anio, periodo_mes,
    estado, total_debe, total_haber
  ) VALUES (
    NEW.empresa_id, CURRENT_DATE,
    'Reversa anulación compra ' || NEW.numero_compra,
    'Anulación ' || NEW.numero_compra,
    'egreso', 'compra_anulada', NEW.id, NEW.numero_compra,
    v_num_str, v_numero, v_anio, v_mes,
    'aprobado', NEW.total, NEW.total
  ) RETURNING id INTO v_asiento_rev;

  -- CR Inventario (reversa entrada)
  INSERT INTO asientos_detalle (asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
  VALUES (v_asiento_rev, v_inventario,
    'Reversa inventario ' || NEW.numero_compra, 0, NEW.subtotal, 1, NEW.empresa_id);

  -- CR IVA CF (reversa)
  IF NEW.iva_total > 0 AND v_iva_cf IS NOT NULL THEN
    INSERT INTO asientos_detalle (asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
    VALUES (v_asiento_rev, v_iva_cf,
      'Reversa IVA CF ' || NEW.numero_compra, 0, NEW.iva_total, 2, NEW.empresa_id);
  END IF;

  -- DB Contrapartida original (reversa pago/deuda)
  INSERT INTO asientos_detalle (asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
  VALUES (v_asiento_rev, v_haber_id,
    'Reversa pago/deuda ' || NEW.numero_compra, NEW.total, 0, 3, NEW.empresa_id);

  -- 3. Revertir movimiento operativo
  UPDATE movimientos_caja SET estado = 'anulado'
  WHERE ref_compra_id = NEW.id AND estado = 'registrado';

  UPDATE transacciones_banco SET estado = 'anulado'
  WHERE ref_compra_id = NEW.id AND estado = 'registrado';

  UPDATE cuentas_caja caj
  SET saldo_actual = saldo_actual + mc.monto
  FROM movimientos_caja mc
  WHERE mc.ref_compra_id = NEW.id AND mc.tipo = 'egreso'
    AND caj.id = mc.cuenta_caja_id;

  UPDATE cuentas_banco ban
  SET saldo_actual = saldo_actual + tb.monto
  FROM transacciones_banco tb
  WHERE tb.ref_compra_id = NEW.id
    AND ban.id = tb.cuenta_banco_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_anular_compra ON compras;
CREATE TRIGGER trg_anular_compra
  AFTER UPDATE OF estado ON compras
  FOR EACH ROW EXECUTE FUNCTION fn_anular_compra_completo();


-- ================================================================
-- 5. PLANILLA APROBADA → asiento de nómina
-- Asiento:
--   DB 6.2.01  Sueldos y Salarios
--   DB 6.2.02  INSS Patronal
--   DB 6.2.03  INATEC
--   DB 6.2.04  Vacaciones
--   DB 6.2.05  Décimo Tercer Mes
--   DB 6.2.06  Indemnización
--   CR 2.1.05  INSS Patronal por Pagar
--   CR 2.1.06  INSS Laboral por Pagar
--   CR 2.1.07  INATEC por Pagar
--   CR 2.1.08  IR Salarios por Pagar
--   CR 2.1.09  Vacaciones Acumuladas
--   CR 2.1.10  Décimo Tercer Mes Acumulado
--   CR 2.1.11  Indemnización Acumulada
--   CR 2.1.02  Gastos Acumulados (neto a pagar empleados)
-- ================================================================
CREATE OR REPLACE FUNCTION fn_contabilizar_planilla()
RETURNS TRIGGER AS $$
DECLARE
  v_asiento_id UUID;
  v_numero     INT; v_anio INT; v_mes INT;
  v_num_str    TEXT;
  -- Cuentas de gasto
  v_sueldos    UUID; v_inss_pat  UUID; v_inatec   UUID;
  v_vacaciones UUID; v_aguinaldo UUID; v_indemn   UUID;
  -- Cuentas de pasivo
  v_p_inss_pat UUID; v_p_inss_lab UUID; v_p_inatec  UUID;
  v_p_ir_sal   UUID; v_p_vac      UUID; v_p_agu     UUID;
  v_p_ind      UUID; v_p_neto     UUID;
  -- Montos
  v_salario_bruto    NUMERIC; v_inss_patronal   NUMERIC;
  v_inatec_monto     NUMERIC; v_inss_laboral    NUMERIC;
  v_ir_salarios      NUMERIC; v_prov_vacaciones NUMERIC;
  v_prov_aguinaldo   NUMERIC; v_prov_indemn     NUMERIC;
  v_neto_pagar       NUMERIC;
  v_total_gasto      NUMERIC;
BEGIN
  -- Solo disparar cuando cambia a aprobada/pagada
  IF NEW.estado NOT IN ('aprobada','pagada') THEN RETURN NEW; END IF;
  IF OLD.estado IN ('aprobada','pagada') THEN RETURN NEW; END IF;

  -- Evitar duplicado
  IF EXISTS (
    SELECT 1 FROM asientos_contables
    WHERE empresa_id = NEW.empresa_id
      AND referencia_tipo = 'planilla'
      AND referencia_id = NEW.id
      AND estado <> 'anulado'
  ) THEN RETURN NEW; END IF;

  -- Obtener montos desde la planilla
  v_salario_bruto  := COALESCE(NEW.total_salarios_brutos,  0);
  v_inss_patronal  := COALESCE(NEW.total_inss_patronal,    0);
  v_inatec_monto   := COALESCE(NEW.total_inatec,           0);
  v_inss_laboral   := COALESCE(NEW.total_inss_laboral,     0);
  v_ir_salarios    := COALESCE(NEW.total_ir_laboral,       0);
  v_prov_vacaciones:= COALESCE(NEW.total_prov_vacaciones,  0);
  v_prov_aguinaldo := COALESCE(NEW.total_prov_aguinaldo,   0);
  v_prov_indemn    := COALESCE(NEW.total_prov_indemnizacion,0);
  v_neto_pagar     := COALESCE(NEW.total_neto_pagar,
    v_salario_bruto - v_inss_laboral - v_ir_salarios, 0);

  v_total_gasto := v_salario_bruto + v_inss_patronal + v_inatec_monto
                 + v_prov_vacaciones + v_prov_aguinaldo + v_prov_indemn;

  IF v_total_gasto <= 0 THEN RETURN NEW; END IF;

  v_anio := COALESCE(NEW.periodo_anio, EXTRACT(YEAR FROM CURRENT_DATE)::INT);
  v_mes  := COALESCE(NEW.periodo_mes,  EXTRACT(MONTH FROM CURRENT_DATE)::INT);
  v_numero  := get_next_numero_asiento(NEW.empresa_id, v_anio, v_mes);
  v_num_str := 'AST-' || LPAD(v_anio::TEXT,4,'0') || '-'
                       || LPAD(v_mes::TEXT,2,'0')  || '-'
                       || LPAD(v_numero::TEXT,4,'0');

  -- Cuentas gasto
  v_sueldos    := get_cuenta_id(NEW.empresa_id, '6.2.01');
  v_inss_pat   := get_cuenta_id(NEW.empresa_id, '6.2.02');
  v_inatec     := get_cuenta_id(NEW.empresa_id, '6.2.03');
  v_vacaciones := get_cuenta_id(NEW.empresa_id, '6.2.04');
  v_aguinaldo  := get_cuenta_id(NEW.empresa_id, '6.2.05');
  v_indemn     := get_cuenta_id(NEW.empresa_id, '6.2.06');
  -- Cuentas pasivo
  v_p_inss_pat := get_cuenta_id(NEW.empresa_id, '2.1.05');
  v_p_inss_lab := get_cuenta_id(NEW.empresa_id, '2.1.06');
  v_p_inatec   := get_cuenta_id(NEW.empresa_id, '2.1.07');
  v_p_ir_sal   := get_cuenta_id(NEW.empresa_id, '2.1.08');
  v_p_vac      := get_cuenta_id(NEW.empresa_id, '2.1.09');
  v_p_agu      := get_cuenta_id(NEW.empresa_id, '2.1.10');
  v_p_ind      := get_cuenta_id(NEW.empresa_id, '2.1.11');
  v_p_neto     := get_cuenta_id(NEW.empresa_id, '2.1.02');

  IF v_sueldos IS NULL OR v_p_neto IS NULL THEN RETURN NEW; END IF;

  INSERT INTO asientos_contables (
    empresa_id, fecha, descripcion, concepto, tipo,
    referencia_tipo, referencia_id, referencia_num,
    numero_asiento, numero, periodo_anio, periodo_mes,
    estado, total_debe, total_haber
  ) VALUES (
    NEW.empresa_id, CURRENT_DATE,
    'Planilla ' || COALESCE(NEW.descripcion, v_mes::TEXT || '/' || v_anio::TEXT),
    'Nómina ' || v_mes::TEXT || '/' || v_anio::TEXT,
    'egreso', 'planilla', NEW.id, NEW.id::TEXT,
    v_num_str, v_numero, v_anio, v_mes,
    'aprobado', v_total_gasto, v_total_gasto
  ) RETURNING id INTO v_asiento_id;

  -- DÉBITOS (gastos)
  INSERT INTO asientos_detalle(asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id) VALUES
    (v_asiento_id, v_sueldos, 'Sueldos y salarios', v_salario_bruto, 0, 1, NEW.empresa_id);

  IF v_inss_patronal > 0 AND v_inss_pat IS NOT NULL THEN
    INSERT INTO asientos_detalle(asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id) VALUES
      (v_asiento_id, v_inss_pat, 'INSS Patronal 22.5%', v_inss_patronal, 0, 2, NEW.empresa_id);
  END IF;
  IF v_inatec_monto > 0 AND v_inatec IS NOT NULL THEN
    INSERT INTO asientos_detalle(asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id) VALUES
      (v_asiento_id, v_inatec, 'INATEC 2%', v_inatec_monto, 0, 3, NEW.empresa_id);
  END IF;
  IF v_prov_vacaciones > 0 AND v_vacaciones IS NOT NULL THEN
    INSERT INTO asientos_detalle(asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id) VALUES
      (v_asiento_id, v_vacaciones, 'Provisión vacaciones', v_prov_vacaciones, 0, 4, NEW.empresa_id);
  END IF;
  IF v_prov_aguinaldo > 0 AND v_aguinaldo IS NOT NULL THEN
    INSERT INTO asientos_detalle(asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id) VALUES
      (v_asiento_id, v_aguinaldo, 'Provisión décimo tercer mes', v_prov_aguinaldo, 0, 5, NEW.empresa_id);
  END IF;
  IF v_prov_indemn > 0 AND v_indemn IS NOT NULL THEN
    INSERT INTO asientos_detalle(asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id) VALUES
      (v_asiento_id, v_indemn, 'Provisión indemnización', v_prov_indemn, 0, 6, NEW.empresa_id);
  END IF;

  -- CRÉDITOS (pasivos)
  IF v_inss_patronal > 0 AND v_p_inss_pat IS NOT NULL THEN
    INSERT INTO asientos_detalle(asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id) VALUES
      (v_asiento_id, v_p_inss_pat, 'INSS Patronal por pagar', 0, v_inss_patronal, 7, NEW.empresa_id);
  END IF;
  IF v_inss_laboral > 0 AND v_p_inss_lab IS NOT NULL THEN
    INSERT INTO asientos_detalle(asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id) VALUES
      (v_asiento_id, v_p_inss_lab, 'INSS Laboral por pagar', 0, v_inss_laboral, 8, NEW.empresa_id);
  END IF;
  IF v_inatec_monto > 0 AND v_p_inatec IS NOT NULL THEN
    INSERT INTO asientos_detalle(asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id) VALUES
      (v_asiento_id, v_p_inatec, 'INATEC por pagar', 0, v_inatec_monto, 9, NEW.empresa_id);
  END IF;
  IF v_ir_salarios > 0 AND v_p_ir_sal IS NOT NULL THEN
    INSERT INTO asientos_detalle(asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id) VALUES
      (v_asiento_id, v_p_ir_sal, 'IR salarios por pagar', 0, v_ir_salarios, 10, NEW.empresa_id);
  END IF;
  IF v_prov_vacaciones > 0 AND v_p_vac IS NOT NULL THEN
    INSERT INTO asientos_detalle(asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id) VALUES
      (v_asiento_id, v_p_vac, 'Vacaciones acumuladas', 0, v_prov_vacaciones, 11, NEW.empresa_id);
  END IF;
  IF v_prov_aguinaldo > 0 AND v_p_agu IS NOT NULL THEN
    INSERT INTO asientos_detalle(asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id) VALUES
      (v_asiento_id, v_p_agu, 'Aguinaldo acumulado', 0, v_prov_aguinaldo, 12, NEW.empresa_id);
  END IF;
  IF v_prov_indemn > 0 AND v_p_ind IS NOT NULL THEN
    INSERT INTO asientos_detalle(asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id) VALUES
      (v_asiento_id, v_p_ind, 'Indemnización acumulada', 0, v_prov_indemn, 13, NEW.empresa_id);
  END IF;
  -- Neto a pagar a empleados
  IF v_neto_pagar > 0 AND v_p_neto IS NOT NULL THEN
    INSERT INTO asientos_detalle(asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id) VALUES
      (v_asiento_id, v_p_neto, 'Neto a pagar empleados', 0, v_neto_pagar, 14, NEW.empresa_id);
  END IF;

  -- Guardar asiento en planilla
  UPDATE planillas SET asiento_id = v_asiento_id WHERE id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contabilizar_planilla ON planillas;
CREATE TRIGGER trg_contabilizar_planilla
  AFTER INSERT OR UPDATE OF estado ON planillas
  FOR EACH ROW EXECUTE FUNCTION fn_contabilizar_planilla();

-- Agregar columna asiento_id a planillas si no existe
ALTER TABLE planillas ADD COLUMN IF NOT EXISTS asiento_id UUID REFERENCES asientos_contables(id) ON DELETE SET NULL;


-- ================================================================
-- 6. DEPRECIACIÓN MENSUAL → asiento
-- Asiento:
--   DB 6.2.12  Depreciación de Activos
--   CR 1.2.02/04/06  Depreciación Acumulada (según tipo activo)
-- ================================================================
CREATE OR REPLACE FUNCTION fn_contabilizar_depreciacion()
RETURNS TRIGGER AS $$
DECLARE
  v_asiento_id UUID;
  v_numero     INT; v_anio INT; v_mes INT;
  v_num_str    TEXT;
  v_gasto_dep  UUID;
  v_dep_acum   UUID;
  v_codigo_dep TEXT;
  v_tipo_activo TEXT;
BEGIN
  -- Solo al insertar o cuando cambia cuota_mensual
  IF TG_OP = 'UPDATE' AND NEW.cuota_mensual = OLD.cuota_mensual THEN RETURN NEW; END IF;
  IF NEW.cuota_mensual <= 0 THEN RETURN NEW; END IF;

  IF EXISTS (
    SELECT 1 FROM asientos_contables
    WHERE empresa_id = NEW.empresa_id
      AND referencia_tipo = 'depreciacion'
      AND referencia_id = NEW.id
      AND periodo_anio = NEW.anio
      AND periodo_mes = NEW.mes
      AND estado <> 'anulado'
  ) THEN RETURN NEW; END IF;

  v_anio := NEW.anio;
  v_mes  := NEW.mes;
  v_numero  := get_next_numero_asiento(NEW.empresa_id, v_anio, v_mes);
  v_num_str := 'AST-' || LPAD(v_anio::TEXT,4,'0') || '-'
                       || LPAD(v_mes::TEXT,2,'0')  || '-'
                       || LPAD(v_numero::TEXT,4,'0');

  v_gasto_dep := get_cuenta_id(NEW.empresa_id, '6.2.12');

  -- Resolver cuenta depreciación acumulada según tipo de activo
  SELECT a.tipo INTO v_tipo_activo
  FROM activos_fijos a WHERE a.id = NEW.activo_id;

  v_codigo_dep := CASE v_tipo_activo
    WHEN 'vehiculo'        THEN '1.2.02'
    WHEN 'equipo_oficina'  THEN '1.2.04'
    WHEN 'mobiliario'      THEN '1.2.06'
    ELSE '1.2.04'  -- default
  END;

  v_dep_acum := get_cuenta_id(NEW.empresa_id, v_codigo_dep);

  IF v_gasto_dep IS NULL OR v_dep_acum IS NULL THEN RETURN NEW; END IF;

  INSERT INTO asientos_contables (
    empresa_id, fecha, descripcion, concepto, tipo,
    referencia_tipo, referencia_id, referencia_num,
    numero_asiento, numero, periodo_anio, periodo_mes,
    estado, total_debe, total_haber
  ) VALUES (
    NEW.empresa_id,
    MAKE_DATE(v_anio, v_mes, 1) + INTERVAL '1 month' - INTERVAL '1 day',
    'Depreciación ' || v_mes::TEXT || '/' || v_anio::TEXT,
    'Dep. activo fijo',
    'egreso', 'depreciacion', NEW.id, NEW.id::TEXT,
    v_num_str, v_numero, v_anio, v_mes,
    'aprobado', NEW.cuota_mensual, NEW.cuota_mensual
  ) RETURNING id INTO v_asiento_id;

  INSERT INTO asientos_detalle(asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id) VALUES
    (v_asiento_id, v_gasto_dep, 'Gasto depreciación ' || v_mes::TEXT || '/' || v_anio::TEXT,
     NEW.cuota_mensual, 0, 1, NEW.empresa_id),
    (v_asiento_id, v_dep_acum,  'Depreciación acumulada ' || v_mes::TEXT || '/' || v_anio::TEXT,
     0, NEW.cuota_mensual, 2, NEW.empresa_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contabilizar_depreciacion ON depreciaciones;
CREATE TRIGGER trg_contabilizar_depreciacion
  AFTER INSERT ON depreciaciones
  FOR EACH ROW EXECUTE FUNCTION fn_contabilizar_depreciacion();


-- ================================================================
-- 7. ANTICIPO IR PAGADO → asiento
-- Asiento:
--   DB 1.1.09  Anticipos IR (activo — derecho a crédito fiscal)
--   CR 1.1.01/1.1.03  Caja o Banco (salida de dinero)
-- ================================================================
CREATE OR REPLACE FUNCTION fn_contabilizar_anticipo_ir()
RETURNS TRIGGER AS $$
DECLARE
  v_asiento_id UUID;
  v_numero     INT; v_anio INT; v_mes INT;
  v_num_str    TEXT;
  v_anticipo   UUID;  -- 1.1.09
  v_caja       UUID;  -- 1.1.01
BEGIN
  IF NEW.estado <> 'pagado' THEN RETURN NEW; END IF;
  IF OLD.estado = 'pagado'  THEN RETURN NEW; END IF;

  IF EXISTS (
    SELECT 1 FROM asientos_contables
    WHERE empresa_id = NEW.empresa_id
      AND referencia_tipo = 'anticipo_ir'
      AND referencia_id = NEW.id AND estado <> 'anulado'
  ) THEN RETURN NEW; END IF;

  v_anio := NEW.anio;
  v_mes  := NEW.mes;
  v_numero  := get_next_numero_asiento(NEW.empresa_id, v_anio, v_mes);
  v_num_str := 'AST-' || LPAD(v_anio::TEXT,4,'0') || '-'
                       || LPAD(v_mes::TEXT,2,'0')  || '-'
                       || LPAD(v_numero::TEXT,4,'0');

  v_anticipo := get_cuenta_id(NEW.empresa_id, '1.1.09');
  v_caja     := get_cuenta_id(NEW.empresa_id, '1.1.01');

  IF v_anticipo IS NULL OR v_caja IS NULL THEN RETURN NEW; END IF;

  INSERT INTO asientos_contables (
    empresa_id, fecha, descripcion, concepto, tipo,
    referencia_tipo, referencia_id, referencia_num,
    numero_asiento, numero, periodo_anio, periodo_mes,
    estado, total_debe, total_haber
  ) VALUES (
    NEW.empresa_id,
    COALESCE(NEW.fecha_pago, CURRENT_DATE),
    'Anticipo IR ' || NEW.mes::TEXT || '/' || NEW.anio::TEXT,
    'PMD 1% sobre ingresos',
    'egreso', 'anticipo_ir', NEW.id, NEW.id::TEXT,
    v_num_str, v_numero, v_anio, v_mes,
    'aprobado', NEW.monto_a_pagar, NEW.monto_a_pagar
  ) RETURNING id INTO v_asiento_id;

  INSERT INTO asientos_detalle(asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id) VALUES
    (v_asiento_id, v_anticipo, 'Anticipo IR PMD ' || NEW.mes::TEXT || '/' || NEW.anio::TEXT,
     NEW.monto_a_pagar, 0, 1, NEW.empresa_id),
    (v_asiento_id, v_caja, 'Pago anticipo IR',
     0, NEW.monto_a_pagar, 2, NEW.empresa_id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contabilizar_anticipo_ir ON anticipos_ir;
CREATE TRIGGER trg_contabilizar_anticipo_ir
  AFTER INSERT OR UPDATE OF estado ON anticipos_ir
  FOR EACH ROW EXECUTE FUNCTION fn_contabilizar_anticipo_ir();
