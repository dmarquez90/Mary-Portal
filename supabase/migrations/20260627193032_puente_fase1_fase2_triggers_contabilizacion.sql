
-- ============================================================
-- SARA - Puente Fase 1 → Fase 2
-- Triggers de auto-contabilización: Facturas y Compras
-- ============================================================

-- FUNCIÓN AUXILIAR: número correlativo de asiento
CREATE OR REPLACE FUNCTION get_next_numero_asiento(p_empresa_id UUID, p_anio INT, p_mes INT)
RETURNS INT AS $$
DECLARE v_max INT;
BEGIN
  SELECT COALESCE(MAX(numero), 0) + 1 INTO v_max
  FROM asientos_contables
  WHERE empresa_id = p_empresa_id AND periodo_anio = p_anio AND periodo_mes = p_mes;
  RETURN v_max;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TRIGGER 1: CONTABILIZAR FACTURA DE VENTA
-- Estado 'emitida' → genera asiento
--
-- Asiento:
--   DÉBITO   1.1.05 Cuentas por Cobrar  (si crédito) ó
--   DÉBITO   1.1.01 Caja General        (si contado/transferencia/tarjeta/cheque)
--   CRÉDITO  4.1.01 Ventas de Bienes    = subtotal
--   CRÉDITO  2.1.03 IVA Débito Fiscal   = iva_total
-- ============================================================
CREATE OR REPLACE FUNCTION fn_contabilizar_factura()
RETURNS TRIGGER AS $$
DECLARE
  v_asiento_id  UUID;
  v_numero      INT;
  v_anio        INT;
  v_mes         INT;
  v_num_str     TEXT;
  -- IDs de cuentas
  v_caja_id     UUID;
  v_cxc_id      UUID;
  v_ventas_id   UUID;
  v_iva_deb_id  UUID;
  v_debe_id     UUID;
BEGIN
  -- Solo actuar cuando cambia a 'emitida'
  IF NEW.estado <> 'emitida' THEN RETURN NEW; END IF;
  IF OLD.estado = 'emitida' THEN RETURN NEW; END IF;

  -- Verificar que no exista ya un asiento para esta factura
  IF EXISTS (
    SELECT 1 FROM asientos_contables
    WHERE empresa_id = NEW.empresa_id
      AND referencia_tipo = 'factura'
      AND referencia_id = NEW.id
      AND estado <> 'anulado'
  ) THEN RETURN NEW; END IF;

  v_anio := EXTRACT(YEAR FROM NEW.fecha_emision)::INT;
  v_mes  := EXTRACT(MONTH FROM NEW.fecha_emision)::INT;
  v_numero := get_next_numero_asiento(NEW.empresa_id, v_anio, v_mes);
  v_num_str := 'AST-' || LPAD(v_anio::TEXT, 4, '0') || '-' || LPAD(v_mes::TEXT, 2, '0') || '-' || LPAD(v_numero::TEXT, 4, '0');

  -- Obtener IDs de cuentas del plan
  SELECT id INTO v_caja_id FROM plan_cuentas
  WHERE empresa_id = NEW.empresa_id AND codigo = '1.1.01' AND activa = true LIMIT 1;

  SELECT id INTO v_cxc_id FROM plan_cuentas
  WHERE empresa_id = NEW.empresa_id AND codigo = '1.1.05' AND activa = true LIMIT 1;

  SELECT id INTO v_ventas_id FROM plan_cuentas
  WHERE empresa_id = NEW.empresa_id AND codigo = '4.1.01' AND activa = true LIMIT 1;

  SELECT id INTO v_iva_deb_id FROM plan_cuentas
  WHERE empresa_id = NEW.empresa_id AND codigo = '2.1.03' AND activa = true LIMIT 1;

  -- Si faltan cuentas críticas, salir sin error
  IF v_ventas_id IS NULL OR (v_caja_id IS NULL AND v_cxc_id IS NULL) THEN
    RETURN NEW;
  END IF;

  -- Determinar cuenta débito según tipo de pago
  IF NEW.tipo_pago = 'credito' THEN
    v_debe_id := COALESCE(v_cxc_id, v_caja_id);
  ELSE
    v_debe_id := COALESCE(v_caja_id, v_cxc_id);
  END IF;

  -- Crear cabecera del asiento
  INSERT INTO asientos_contables (
    empresa_id, fecha, descripcion, concepto, tipo,
    referencia_tipo, referencia_id, referencia_num,
    numero_asiento, numero, periodo_anio, periodo_mes,
    ref_factura_id, estado, total_debe, total_haber
  ) VALUES (
    NEW.empresa_id,
    NEW.fecha_emision,
    'Factura de venta ' || NEW.numero_factura || ' - ' || NEW.cliente_nombre,
    'Venta a ' || NEW.cliente_nombre,
    'ingreso',
    'factura', NEW.id, NEW.numero_factura,
    v_num_str, v_numero, v_anio, v_mes,
    NEW.id, 'aprobado',
    NEW.total, NEW.total
  ) RETURNING id INTO v_asiento_id;

  -- Línea 1: DÉBITO (Caja o CxC)
  INSERT INTO asientos_detalle (asiento_id, cuenta_id, descripcion, debe, haber, orden, empresa_id)
  VALUES (v_asiento_id, v_debe_id,
    CASE WHEN NEW.tipo_pago = 'credito' THEN 'CxC - ' ELSE 'Cobro contado - ' END || NEW.numero_factura,
    NEW.total, 0, 1, NEW.empresa_id);

  -- Línea 2: CRÉDITO Ventas
  INSERT INTO asientos_detalle (asiento_id, cuenta_id, descripcion, debe, haber, orden, empresa_id)
  VALUES (v_asiento_id, v_ventas_id,
    'Venta - ' || NEW.numero_factura,
    0, NEW.subtotal, 2, NEW.empresa_id);

  -- Línea 3: CRÉDITO IVA Débito Fiscal (solo si hay IVA y existe la cuenta)
  IF NEW.iva_total > 0 AND v_iva_deb_id IS NOT NULL THEN
    INSERT INTO asientos_detalle (asiento_id, cuenta_id, descripcion, debe, haber, orden, empresa_id)
    VALUES (v_asiento_id, v_iva_deb_id,
      'IVA 15% - ' || NEW.numero_factura,
      0, NEW.iva_total, 3, NEW.empresa_id);
  END IF;

  -- Si es pago contado y existe cuenta caja, registrar movimiento en caja
  IF NEW.tipo_pago <> 'credito' AND v_caja_id IS NOT NULL THEN
    -- Verificar si existe alguna cuenta_caja activa para esta empresa
    IF EXISTS (SELECT 1 FROM cuentas_caja WHERE empresa_id = NEW.empresa_id AND activa = true LIMIT 1) THEN
      INSERT INTO movimientos_caja (
        empresa_id, cuenta_caja_id, tipo, monto, descripcion,
        referencia_tipo, referencia_id, fecha, created_at
      )
      SELECT
        NEW.empresa_id,
        id,
        'entrada',
        NEW.total,
        'Cobro factura ' || NEW.numero_factura || ' - ' || NEW.cliente_nombre,
        'factura', NEW.id,
        NEW.fecha_emision,
        NOW()
      FROM cuentas_caja
      WHERE empresa_id = NEW.empresa_id AND activa = true
      ORDER BY created_at LIMIT 1;
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
-- TRIGGER 2: CONTABILIZAR COMPRA
-- Estado 'recibida' → genera asiento
--
-- Asiento:
--   DÉBITO   1.1.08 Inventario           = subtotal
--   DÉBITO   1.1.09 IVA Crédito Fiscal   = iva_total
--   CRÉDITO  2.1.01 CxP Proveedores (crédito) ó
--   CRÉDITO  1.1.01 Caja General    (contado)
-- ============================================================
CREATE OR REPLACE FUNCTION fn_contabilizar_compra()
RETURNS TRIGGER AS $$
DECLARE
  v_asiento_id  UUID;
  v_numero      INT;
  v_anio        INT;
  v_mes         INT;
  v_num_str     TEXT;
  v_inventario_id UUID;
  v_iva_cred_id   UUID;
  v_cxp_id        UUID;
  v_caja_id       UUID;
  v_haber_id      UUID;
BEGIN
  -- Solo actuar cuando cambia a 'recibida'
  IF NEW.estado <> 'recibida' THEN RETURN NEW; END IF;
  IF OLD.estado = 'recibida' THEN RETURN NEW; END IF;

  -- Verificar que no exista ya un asiento
  IF EXISTS (
    SELECT 1 FROM asientos_contables
    WHERE empresa_id = NEW.empresa_id
      AND referencia_tipo = 'compra'
      AND referencia_id = NEW.id
      AND estado <> 'anulado'
  ) THEN RETURN NEW; END IF;

  v_anio := EXTRACT(YEAR FROM NEW.fecha_compra)::INT;
  v_mes  := EXTRACT(MONTH FROM NEW.fecha_compra)::INT;
  v_numero := get_next_numero_asiento(NEW.empresa_id, v_anio, v_mes);
  v_num_str := 'AST-' || LPAD(v_anio::TEXT, 4, '0') || '-' || LPAD(v_mes::TEXT, 2, '0') || '-' || LPAD(v_numero::TEXT, 4, '0');

  SELECT id INTO v_inventario_id FROM plan_cuentas
  WHERE empresa_id = NEW.empresa_id AND codigo = '1.1.08' AND activa = true LIMIT 1;

  SELECT id INTO v_iva_cred_id FROM plan_cuentas
  WHERE empresa_id = NEW.empresa_id AND codigo = '1.1.09' AND activa = true LIMIT 1;

  SELECT id INTO v_cxp_id FROM plan_cuentas
  WHERE empresa_id = NEW.empresa_id AND codigo = '2.1.01' AND activa = true LIMIT 1;

  SELECT id INTO v_caja_id FROM plan_cuentas
  WHERE empresa_id = NEW.empresa_id AND codigo = '1.1.01' AND activa = true LIMIT 1;

  IF v_inventario_id IS NULL OR (v_cxp_id IS NULL AND v_caja_id IS NULL) THEN
    RETURN NEW;
  END IF;

  -- Cuenta haber según tipo de pago
  IF NEW.tipo_pago = 'credito' THEN
    v_haber_id := COALESCE(v_cxp_id, v_caja_id);
  ELSE
    v_haber_id := COALESCE(v_caja_id, v_cxp_id);
  END IF;

  -- Cabecera del asiento
  INSERT INTO asientos_contables (
    empresa_id, fecha, descripcion, concepto, tipo,
    referencia_tipo, referencia_id, referencia_num,
    numero_asiento, numero, periodo_anio, periodo_mes,
    ref_compra_id, estado, total_debe, total_haber
  ) VALUES (
    NEW.empresa_id,
    NEW.fecha_compra,
    'Compra ' || NEW.numero_compra,
    'Compra de inventario ' || NEW.numero_compra,
    'egreso',
    'compra', NEW.id, NEW.numero_compra,
    v_num_str, v_numero, v_anio, v_mes,
    NEW.id, 'aprobado',
    NEW.total, NEW.total
  ) RETURNING id INTO v_asiento_id;

  -- Línea 1: DÉBITO Inventario
  INSERT INTO asientos_detalle (asiento_id, cuenta_id, descripcion, debe, haber, orden, empresa_id)
  VALUES (v_asiento_id, v_inventario_id, 'Inventario - ' || NEW.numero_compra, NEW.subtotal, 0, 1, NEW.empresa_id);

  -- Línea 2: DÉBITO IVA Crédito Fiscal
  IF NEW.iva_total > 0 AND v_iva_cred_id IS NOT NULL THEN
    INSERT INTO asientos_detalle (asiento_id, cuenta_id, descripcion, debe, haber, orden, empresa_id)
    VALUES (v_asiento_id, v_iva_cred_id, 'IVA CF 15% - ' || NEW.numero_compra, NEW.iva_total, 0, 2, NEW.empresa_id);
  END IF;

  -- Línea 3: CRÉDITO (CxP o Caja)
  INSERT INTO asientos_detalle (asiento_id, cuenta_id, descripcion, debe, haber, orden, empresa_id)
  VALUES (v_asiento_id, v_haber_id,
    CASE WHEN NEW.tipo_pago = 'credito' THEN 'CxP - ' ELSE 'Pago contado - ' END || NEW.numero_compra,
    0, NEW.total, 3, NEW.empresa_id);

  -- Si es contado, registrar salida de caja
  IF NEW.tipo_pago <> 'credito' AND v_caja_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM cuentas_caja WHERE empresa_id = NEW.empresa_id AND activa = true LIMIT 1) THEN
      INSERT INTO movimientos_caja (
        empresa_id, cuenta_caja_id, tipo, monto, descripcion,
        referencia_tipo, referencia_id, fecha, created_at
      )
      SELECT
        NEW.empresa_id, id, 'salida', NEW.total,
        'Pago compra ' || NEW.numero_compra,
        'compra', NEW.id, NEW.fecha_compra, NOW()
      FROM cuentas_caja
      WHERE empresa_id = NEW.empresa_id AND activa = true
      ORDER BY created_at LIMIT 1;
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
-- TRIGGER 3: ANULAR ASIENTO DE FACTURA
-- ============================================================
CREATE OR REPLACE FUNCTION fn_anular_asiento_factura()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.estado = 'anulada' AND OLD.estado <> 'anulada' THEN
    UPDATE asientos_contables
    SET estado = 'anulado', descripcion = descripcion || ' [ANULADO]'
    WHERE empresa_id = NEW.empresa_id
      AND referencia_tipo = 'factura'
      AND referencia_id = NEW.id
      AND estado <> 'anulado';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_anular_factura ON facturas;
CREATE TRIGGER trg_anular_factura
  AFTER UPDATE OF estado ON facturas
  FOR EACH ROW EXECUTE FUNCTION fn_anular_asiento_factura();

-- ============================================================
-- TRIGGER 4: ANULAR ASIENTO DE COMPRA
-- ============================================================
CREATE OR REPLACE FUNCTION fn_anular_asiento_compra()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.estado = 'anulada' AND OLD.estado <> 'anulada' THEN
    UPDATE asientos_contables
    SET estado = 'anulado', descripcion = descripcion || ' [ANULADO]'
    WHERE empresa_id = NEW.empresa_id
      AND referencia_tipo = 'compra'
      AND referencia_id = NEW.id
      AND estado <> 'anulado';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_anular_compra ON compras;
CREATE TRIGGER trg_anular_compra
  AFTER UPDATE OF estado ON compras
  FOR EACH ROW EXECUTE FUNCTION fn_anular_asiento_compra();

-- ============================================================
-- CONTABILIZACIÓN RETROACTIVA
-- Para facturas y compras ya existentes sin asiento
-- ============================================================

-- Retroactivo: facturas emitidas
UPDATE facturas
SET updated_at = NOW()
WHERE estado = 'emitida'
  AND NOT EXISTS (
    SELECT 1 FROM asientos_contables a
    WHERE a.referencia_tipo = 'factura'
      AND a.referencia_id = facturas.id
      AND a.estado <> 'anulado'
  );

-- Retroactivo: compras recibidas
UPDATE compras
SET updated_at = NOW()
WHERE estado = 'recibida'
  AND NOT EXISTS (
    SELECT 1 FROM asientos_contables a
    WHERE a.referencia_tipo = 'compra'
      AND a.referencia_id = compras.id
      AND a.estado <> 'anulado'
  );
