
-- ============================================================
-- TRIGGER fn_contabilizar_factura v2
-- Fix: usa cuenta_banco_id/cuenta_caja_id de la factura
--      en lugar de ORDER BY created_at LIMIT 1
-- ============================================================
CREATE OR REPLACE FUNCTION fn_contabilizar_factura()
RETURNS TRIGGER AS $$
DECLARE
  v_asiento_id      UUID;
  v_numero          INT;
  v_anio            INT; v_mes INT;
  v_num_str         TEXT;
  v_caja_id         UUID; v_cxc_id UUID;
  v_banco_id        UUID; v_tarjeta_id UUID;
  v_ventas_id       UUID; v_iva_deb_id UUID;
  v_debe_id         UUID;
  -- Cuenta operativa (caja o banco) resuelta
  v_cuenta_caja_id  UUID;
  v_cuenta_banco_id UUID;
  -- Cuenta contable del banco seleccionado
  v_cuenta_contable_banco UUID;
BEGIN
  IF NEW.estado <> 'emitida' THEN RETURN NEW; END IF;
  IF OLD.estado = 'emitida'  THEN RETURN NEW; END IF;
  IF EXISTS (
    SELECT 1 FROM asientos_contables
    WHERE empresa_id = NEW.empresa_id
      AND referencia_tipo = 'factura'
      AND referencia_id = NEW.id
      AND estado <> 'anulado'
  ) THEN RETURN NEW; END IF;

  v_anio    := EXTRACT(YEAR  FROM NEW.fecha_emision)::INT;
  v_mes     := EXTRACT(MONTH FROM NEW.fecha_emision)::INT;
  v_numero  := get_next_numero_asiento(NEW.empresa_id, v_anio, v_mes);
  v_num_str := 'AST-' || LPAD(v_anio::TEXT,4,'0') || '-'
                       || LPAD(v_mes::TEXT,2,'0')  || '-'
                       || LPAD(v_numero::TEXT,4,'0');

  -- Cuentas contables base
  SELECT id INTO v_caja_id    FROM plan_cuentas WHERE empresa_id=NEW.empresa_id AND codigo='1.1.01' AND activa=true LIMIT 1;
  SELECT id INTO v_cxc_id     FROM plan_cuentas WHERE empresa_id=NEW.empresa_id AND codigo='1.1.05' AND activa=true LIMIT 1;
  SELECT id INTO v_tarjeta_id FROM plan_cuentas WHERE empresa_id=NEW.empresa_id AND codigo='1.1.02.02' AND activa=true LIMIT 1;
  SELECT id INTO v_ventas_id  FROM plan_cuentas WHERE empresa_id=NEW.empresa_id AND codigo='4.1.01' AND activa=true LIMIT 1;
  SELECT id INTO v_iva_deb_id FROM plan_cuentas WHERE empresa_id=NEW.empresa_id AND codigo='2.1.03' AND activa=true LIMIT 1;

  IF v_ventas_id IS NULL THEN RETURN NEW; END IF;

  -- ── Resolver cuenta banco ──────────────────────────────
  -- Prioridad: cuenta_banco_id explícito en la factura → su cuenta contable mapeada
  --            Fallback: primera cuenta activa de cuentas_banco → su cuenta contable
  --            Último recurso: 1.1.02.01 del plan de cuentas (legacy)
  IF NEW.tipo_pago IN ('transferencia','cheque','tarjeta') THEN
    IF NEW.cuenta_banco_id IS NOT NULL THEN
      SELECT cuenta_contable_id INTO v_cuenta_contable_banco
      FROM cuentas_banco WHERE id = NEW.cuenta_banco_id;
    END IF;

    IF v_cuenta_contable_banco IS NULL THEN
      SELECT cuenta_contable_id INTO v_cuenta_contable_banco
      FROM cuentas_banco
      WHERE empresa_id = NEW.empresa_id AND activa = true
      ORDER BY created_at LIMIT 1;
    END IF;

    -- Último recurso: código legacy 1.1.02.01
    IF v_cuenta_contable_banco IS NULL THEN
      SELECT id INTO v_cuenta_contable_banco
      FROM plan_cuentas WHERE empresa_id=NEW.empresa_id AND codigo='1.1.02.01' AND activa=true LIMIT 1;
    END IF;

    v_banco_id := v_cuenta_contable_banco;
  END IF;

  -- ── Resolver cuenta debe (débito) según tipo_pago ──────
  CASE NEW.tipo_pago
    WHEN 'contado'       THEN v_debe_id := COALESCE(v_caja_id,   v_cxc_id);
    WHEN 'credito'       THEN v_debe_id := COALESCE(v_cxc_id,    v_caja_id);
    WHEN 'transferencia' THEN v_debe_id := COALESCE(v_banco_id,  v_caja_id);
    WHEN 'cheque'        THEN v_debe_id := COALESCE(v_banco_id,  v_caja_id);
    WHEN 'tarjeta'       THEN v_debe_id := COALESCE(v_tarjeta_id, v_banco_id, v_caja_id);
    ELSE                      v_debe_id := COALESCE(v_caja_id,   v_cxc_id);
  END CASE;

  IF v_debe_id IS NULL THEN RETURN NEW; END IF;

  -- ── Asiento contable ───────────────────────────────────
  INSERT INTO asientos_contables (
    empresa_id, fecha, descripcion, concepto, tipo,
    referencia_tipo, referencia_id, referencia_num,
    numero_asiento, numero, periodo_anio, periodo_mes,
    ref_factura_id, estado, total_debe, total_haber
  ) VALUES (
    NEW.empresa_id, NEW.fecha_emision,
    'Venta ' || NEW.numero_factura || ' - ' || NEW.cliente_nombre,
    'Factura ' || NEW.numero_factura || ' (' || NEW.tipo_pago || ')',
    'ingreso','factura',NEW.id,NEW.numero_factura,
    v_num_str,v_numero,v_anio,v_mes,
    NEW.id,'aprobado',NEW.total,NEW.total
  ) RETURNING id INTO v_asiento_id;

  -- Línea 1: Débito (cobro)
  INSERT INTO asientos_detalle (asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
  VALUES (v_asiento_id, v_debe_id,
    CASE NEW.tipo_pago
      WHEN 'contado'       THEN 'Cobro contado - '
      WHEN 'credito'       THEN 'CxC - '
      WHEN 'transferencia' THEN 'Transferencia bancaria - '
      WHEN 'cheque'        THEN 'Cheque recibido - '
      WHEN 'tarjeta'       THEN 'Tarjeta POS - '
      ELSE 'Cobro - '
    END || NEW.numero_factura,
    NEW.total, 0, 1, NEW.empresa_id);

  -- Línea 2: Crédito Ventas
  INSERT INTO asientos_detalle (asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
  VALUES (v_asiento_id, v_ventas_id,
    'Venta - ' || NEW.numero_factura, 0, NEW.subtotal, 2, NEW.empresa_id);

  -- Línea 3: Crédito IVA (si aplica)
  IF NEW.iva_total > 0 AND v_iva_deb_id IS NOT NULL THEN
    INSERT INTO asientos_detalle (asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
    VALUES (v_asiento_id, v_iva_deb_id,
      'IVA 15% - ' || NEW.numero_factura, 0, NEW.iva_total, 3, NEW.empresa_id);
  END IF;

  -- ── Movimiento operativo (Caja o Banco) ───────────────
  IF NEW.tipo_pago = 'contado' THEN
    -- Usar cuenta_caja_id explícita o la primera activa
    v_cuenta_caja_id := NEW.cuenta_caja_id;
    IF v_cuenta_caja_id IS NULL THEN
      SELECT id INTO v_cuenta_caja_id FROM cuentas_caja
      WHERE empresa_id=NEW.empresa_id AND activa=true
      ORDER BY tipo='caja_general' DESC, created_at LIMIT 1;
    END IF;
    IF v_cuenta_caja_id IS NOT NULL THEN
      INSERT INTO movimientos_caja(empresa_id,cuenta_caja_id,tipo,monto,descripcion,ref_factura_id,asiento_id,fecha)
      VALUES(NEW.empresa_id, v_cuenta_caja_id, 'ingreso', NEW.total,
        'Venta contado ' || NEW.numero_factura || ' - ' || NEW.cliente_nombre,
        NEW.id, v_asiento_id, NEW.fecha_emision);
    END IF;

  ELSIF NEW.tipo_pago IN ('transferencia','cheque','tarjeta') THEN
    -- Usar cuenta_banco_id explícita o la primera activa
    v_cuenta_banco_id := NEW.cuenta_banco_id;
    IF v_cuenta_banco_id IS NULL THEN
      SELECT id INTO v_cuenta_banco_id FROM cuentas_banco
      WHERE empresa_id=NEW.empresa_id AND activa=true ORDER BY created_at LIMIT 1;
    END IF;
    IF v_cuenta_banco_id IS NOT NULL THEN
      INSERT INTO transacciones_banco(empresa_id,cuenta_banco_id,tipo,monto,descripcion,ref_factura_id,asiento_id,fecha)
      VALUES(NEW.empresa_id, v_cuenta_banco_id,
        CASE NEW.tipo_pago WHEN 'cheque' THEN 'cheque' WHEN 'tarjeta' THEN 'tarjeta' ELSE 'transferencia' END,
        NEW.total,
        'Cobro ' || NEW.tipo_pago || ' - ' || NEW.numero_factura || ' - ' || NEW.cliente_nombre,
        NEW.id, v_asiento_id, NEW.fecha_emision);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- TRIGGER fn_contabilizar_compra v2
-- Fix: usa cuenta correcta + calcula retención IR 2% para natural
-- ============================================================
CREATE OR REPLACE FUNCTION fn_contabilizar_compra()
RETURNS TRIGGER AS $$
DECLARE
  v_asiento_id          UUID;
  v_numero              INT; v_anio INT; v_mes INT;
  v_num_str             TEXT;
  v_inventario_id       UUID; v_iva_cred_id UUID;
  v_cxp_id              UUID; v_caja_id UUID;
  v_haber_id            UUID;
  v_retencion_ir_id     UUID;  -- 2.1.06 Retenciones IR por Enterar
  v_retencion_ir_favor  UUID;  -- 1.1.11 Retenciones IR a Favor (si empresa es retenida)
  v_cuenta_caja_id      UUID;
  v_cuenta_banco_id     UUID;
  v_cuenta_contable_banco UUID;
  -- Retención IR
  v_tipo_persona        TEXT;
  v_retencion_ir        NUMERIC;
  v_total_a_pagar       NUMERIC;
BEGIN
  IF NEW.estado <> 'recibida' THEN RETURN NEW; END IF;
  IF OLD.estado = 'recibida'  THEN RETURN NEW; END IF;
  IF EXISTS (
    SELECT 1 FROM asientos_contables
    WHERE empresa_id=NEW.empresa_id AND referencia_tipo='compra'
      AND referencia_id=NEW.id AND estado<>'anulado'
  ) THEN RETURN NEW; END IF;

  v_anio    := EXTRACT(YEAR  FROM NEW.fecha_compra)::INT;
  v_mes     := EXTRACT(MONTH FROM NEW.fecha_compra)::INT;
  v_numero  := get_next_numero_asiento(NEW.empresa_id, v_anio, v_mes);
  v_num_str := 'AST-' || LPAD(v_anio::TEXT,4,'0') || '-'
                       || LPAD(v_mes::TEXT,2,'0')  || '-'
                       || LPAD(v_numero::TEXT,4,'0');

  -- Cuentas contables base
  SELECT id INTO v_inventario_id FROM plan_cuentas WHERE empresa_id=NEW.empresa_id AND codigo='1.1.08' AND activa=true LIMIT 1;
  SELECT id INTO v_iva_cred_id   FROM plan_cuentas WHERE empresa_id=NEW.empresa_id AND codigo='1.1.09' AND activa=true LIMIT 1;
  SELECT id INTO v_cxp_id        FROM plan_cuentas WHERE empresa_id=NEW.empresa_id AND codigo='2.1.01' AND activa=true LIMIT 1;
  SELECT id INTO v_caja_id       FROM plan_cuentas WHERE empresa_id=NEW.empresa_id AND codigo='1.1.01' AND activa=true LIMIT 1;
  -- Retención IR por enterar (pasivo) - puede variar entre empresas
  SELECT id INTO v_retencion_ir_id FROM plan_cuentas
  WHERE empresa_id=NEW.empresa_id
    AND (codigo='2.1.06' OR nombre ILIKE '%retenci%ir%enterar%' OR nombre ILIKE '%retenci%ir%pagar%')
    AND activa=true LIMIT 1;

  IF v_inventario_id IS NULL THEN RETURN NEW; END IF;

  -- ── Retención IR 2% para proveedor persona natural ────
  SELECT COALESCE(tipo_persona,'juridica') INTO v_tipo_persona
  FROM proveedores WHERE id = NEW.proveedor_id;

  IF v_tipo_persona = 'natural' THEN
    v_retencion_ir  := ROUND(NEW.subtotal * 0.02, 2);
    v_total_a_pagar := NEW.total - v_retencion_ir;
  ELSE
    v_retencion_ir  := 0;
    v_total_a_pagar := NEW.total;
  END IF;

  -- Persistir retención calculada en la compra
  UPDATE compras
  SET retencion_ir  = v_retencion_ir,
      total_a_pagar = v_total_a_pagar
  WHERE id = NEW.id;

  -- ── Resolver cuenta banco ──────────────────────────────
  IF NEW.tipo_pago IN ('transferencia','cheque','tarjeta') THEN
    IF NEW.cuenta_banco_id IS NOT NULL THEN
      SELECT cuenta_contable_id INTO v_cuenta_contable_banco
      FROM cuentas_banco WHERE id = NEW.cuenta_banco_id;
    END IF;
    IF v_cuenta_contable_banco IS NULL THEN
      SELECT cuenta_contable_id INTO v_cuenta_contable_banco
      FROM cuentas_banco
      WHERE empresa_id = NEW.empresa_id AND activa = true
      ORDER BY created_at LIMIT 1;
    END IF;
    IF v_cuenta_contable_banco IS NULL THEN
      SELECT id INTO v_cuenta_contable_banco
      FROM plan_cuentas WHERE empresa_id=NEW.empresa_id AND codigo='1.1.02.01' AND activa=true LIMIT 1;
    END IF;
  END IF;

  -- ── Resolver cuenta haber según tipo_pago ─────────────
  CASE NEW.tipo_pago
    WHEN 'credito'       THEN v_haber_id := COALESCE(v_cxp_id, v_caja_id);
    WHEN 'contado'       THEN v_haber_id := COALESCE(v_caja_id, v_cxp_id);
    WHEN 'transferencia' THEN v_haber_id := COALESCE(v_cuenta_contable_banco, v_caja_id);
    WHEN 'cheque'        THEN v_haber_id := COALESCE(v_cuenta_contable_banco, v_caja_id);
    WHEN 'tarjeta'       THEN v_haber_id := COALESCE(v_cuenta_contable_banco, v_caja_id);
    ELSE                      v_haber_id := COALESCE(v_caja_id, v_cxp_id);
  END CASE;

  IF v_haber_id IS NULL THEN RETURN NEW; END IF;

  -- ── Total del asiento (base para cuadrar) ─────────────
  -- Con retención: Inventario + IVA = CxP/Caja + Retención IR
  -- Sin retención: Inventario + IVA = CxP/Caja (normal)

  INSERT INTO asientos_contables (
    empresa_id, fecha, descripcion, concepto, tipo,
    referencia_tipo, referencia_id, referencia_num,
    numero_asiento, numero, periodo_anio, periodo_mes,
    ref_compra_id, estado, total_debe, total_haber
  ) VALUES (
    NEW.empresa_id, NEW.fecha_compra,
    'Compra ' || NEW.numero_compra,
    'Compra ' || NEW.numero_compra || ' (' || NEW.tipo_pago || ')',
    'egreso','compra',NEW.id,NEW.numero_compra,
    v_num_str,v_numero,v_anio,v_mes,
    NEW.id,'aprobado',NEW.total,NEW.total
  ) RETURNING id INTO v_asiento_id;

  -- Línea 1: Débito Inventario
  INSERT INTO asientos_detalle (asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
  VALUES (v_asiento_id, v_inventario_id,
    'Inventario - ' || NEW.numero_compra, NEW.subtotal, 0, 1, NEW.empresa_id);

  -- Línea 2: Débito IVA Crédito Fiscal
  IF NEW.iva_total > 0 AND v_iva_cred_id IS NOT NULL THEN
    INSERT INTO asientos_detalle (asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
    VALUES (v_asiento_id, v_iva_cred_id,
      'IVA CF 15% - ' || NEW.numero_compra, NEW.iva_total, 0, 2, NEW.empresa_id);
  END IF;

  -- Línea 3: Crédito principal (CxP, Caja, o Banco)
  -- El monto a acreditar es total_a_pagar (ya descontada la retención si aplica)
  INSERT INTO asientos_detalle (asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
  VALUES (v_asiento_id, v_haber_id,
    CASE NEW.tipo_pago
      WHEN 'credito'       THEN 'CxP proveedor - '
      WHEN 'contado'       THEN 'Pago contado - '
      WHEN 'transferencia' THEN 'Transferencia bancaria - '
      WHEN 'cheque'        THEN 'Cheque emitido - '
      WHEN 'tarjeta'       THEN 'Tarjeta - '
      ELSE 'Pago - '
    END || NEW.numero_compra,
    0, v_total_a_pagar, 3, NEW.empresa_id);

  -- Línea 4: Crédito Retención IR (solo para proveedor natural)
  IF v_retencion_ir > 0 AND v_retencion_ir_id IS NOT NULL THEN
    INSERT INTO asientos_detalle (asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
    VALUES (v_asiento_id, v_retencion_ir_id,
      'Retención IR 2% - ' || NEW.numero_compra,
      0, v_retencion_ir, 4, NEW.empresa_id);
  END IF;

  -- ── Movimiento operativo ───────────────────────────────
  IF NEW.tipo_pago = 'contado' THEN
    v_cuenta_caja_id := NEW.cuenta_caja_id;
    IF v_cuenta_caja_id IS NULL THEN
      SELECT id INTO v_cuenta_caja_id FROM cuentas_caja
      WHERE empresa_id=NEW.empresa_id AND activa=true
      ORDER BY tipo='caja_general' DESC, created_at LIMIT 1;
    END IF;
    IF v_cuenta_caja_id IS NOT NULL THEN
      INSERT INTO movimientos_caja(empresa_id,cuenta_caja_id,tipo,monto,descripcion,ref_compra_id,asiento_id,fecha)
      VALUES(NEW.empresa_id, v_cuenta_caja_id, 'egreso', v_total_a_pagar,
        'Pago contado ' || NEW.numero_compra, NEW.id, v_asiento_id, NEW.fecha_compra);
    END IF;

  ELSIF NEW.tipo_pago IN ('transferencia','cheque','tarjeta') THEN
    v_cuenta_banco_id := NEW.cuenta_banco_id;
    IF v_cuenta_banco_id IS NULL THEN
      SELECT id INTO v_cuenta_banco_id FROM cuentas_banco
      WHERE empresa_id=NEW.empresa_id AND activa=true ORDER BY created_at LIMIT 1;
    END IF;
    IF v_cuenta_banco_id IS NOT NULL THEN
      INSERT INTO transacciones_banco(empresa_id,cuenta_banco_id,tipo,monto,descripcion,ref_compra_id,asiento_id,fecha)
      VALUES(NEW.empresa_id, v_cuenta_banco_id,
        CASE NEW.tipo_pago WHEN 'cheque' THEN 'cheque' WHEN 'tarjeta' THEN 'tarjeta' ELSE 'transferencia' END,
        v_total_a_pagar,
        'Pago ' || NEW.tipo_pago || ' - ' || NEW.numero_compra,
        NEW.id, v_asiento_id, NEW.fecha_compra);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
