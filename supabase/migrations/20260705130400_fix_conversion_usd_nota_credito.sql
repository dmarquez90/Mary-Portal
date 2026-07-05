-- ============================================================
-- Multi-moneda (4/4b): fn_contabilizar_nota_credito convierte el
-- egreso de caja cuando la devolución sale por una cuenta en USD.
-- Hereda la tasa de la factura original (NEW.ref_factura_id) en vez
-- de usar la tasa de hoy — una devolución debe revertir al mismo
-- tipo de cambio con el que se cobró, no al del día de la NC.
-- ============================================================

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
  v_cuenta_caja_operativa UUID; -- cuentas_caja.id (no plan_cuentas) para el egreso físico
  v_cuenta_moneda TEXT;
  v_tasa_factura  NUMERIC;
  v_tasa          NUMERIC;
  v_monto_operativo NUMERIC;
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
    SELECT f.tipo_pago, f.tasa_cambio INTO v_tipo_pago, v_tasa_factura
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

  -- Crear asiento (siempre en córdobas, igual que la factura original)
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

  -- ── Egreso físico de caja cuando la devolución es en efectivo ──
  -- Convierte a la moneda real de la caja, heredando la tasa de la
  -- factura original (no la tasa de hoy).
  IF v_tipo_pago = 'contado' THEN
    IF NEW.sesion_caja_id IS NOT NULL THEN
      SELECT cuenta_caja_id INTO v_cuenta_caja_operativa
      FROM sesiones_caja WHERE id = NEW.sesion_caja_id;
    END IF;
    IF v_cuenta_caja_operativa IS NULL AND NEW.ref_factura_id IS NOT NULL THEN
      SELECT cuenta_caja_id INTO v_cuenta_caja_operativa
      FROM facturas WHERE id = NEW.ref_factura_id;
    END IF;
    IF v_cuenta_caja_operativa IS NULL THEN
      SELECT id INTO v_cuenta_caja_operativa FROM cuentas_caja
      WHERE empresa_id = NEW.empresa_id AND activa = true
      ORDER BY tipo='caja_general' DESC, created_at LIMIT 1;
    END IF;
    IF v_cuenta_caja_operativa IS NOT NULL THEN
      SELECT moneda INTO v_cuenta_moneda FROM cuentas_caja WHERE id = v_cuenta_caja_operativa;
      v_tasa := NULL;
      v_monto_operativo := NEW.total;
      IF v_cuenta_moneda = 'USD' THEN
        v_tasa := COALESCE(v_tasa_factura, fn_tasa_cambio_vigente(NEW.empresa_id, NEW.fecha));
        IF v_tasa IS NULL OR v_tasa <= 0 THEN
          RAISE EXCEPTION 'No hay tasa de cambio registrada para convertir la devolución % (C$%) a la caja en USD.', NEW.numero_nota, NEW.total;
        END IF;
        v_monto_operativo := ROUND(NEW.total / v_tasa, 2);
      END IF;

      INSERT INTO movimientos_caja(empresa_id,cuenta_caja_id,tipo,monto,descripcion,ref_factura_id,asiento_id,fecha,sesion_caja_id)
      VALUES(NEW.empresa_id, v_cuenta_caja_operativa, 'egreso', v_monto_operativo,
        'Devolución NC ' || NEW.numero_nota ||
        CASE WHEN v_tasa IS NOT NULL THEN ' (C$' || NEW.total || ' @ ' || v_tasa || ')' ELSE '' END,
        NEW.ref_factura_id, v_asiento_id, NEW.fecha, NEW.sesion_caja_id);
    END IF;
  END IF;

  -- Guardar asiento_id en la nota
  UPDATE notas_credito_debito SET asiento_id = v_asiento_id WHERE id = NEW.id;

  -- Inventario: restaurar stock por cada ítem de la NC
  -- (solo si tiene detalles con producto_id)
  PERFORM fn_nc_restaurar_inventario(NEW.id, NEW.empresa_id, NEW.numero_nota);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
