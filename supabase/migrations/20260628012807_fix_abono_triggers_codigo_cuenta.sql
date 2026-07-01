
-- ============================================================
-- Fix triggers CxC/CxP: codigo_cuenta → codigo
-- ============================================================

CREATE OR REPLACE FUNCTION fn_abono_cxc_asiento()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_cxc     UUID;
  v_destino UUID;
  v_asiento UUID;
  v_num     TEXT;
  v_numDoc  TEXT;
  v_desc    TEXT;
BEGIN
  IF NEW.estado != 'aplicado' THEN RETURN NEW; END IF;

  SELECT numero_factura INTO v_numDoc FROM facturas WHERE id = NEW.factura_id;
  v_desc := 'Cobro CxC Factura ' || COALESCE(v_numDoc, '');

  -- 1.1.05 CxC Clientes  ← usa "codigo" no "codigo_cuenta"
  SELECT id INTO v_cxc FROM plan_cuentas
   WHERE empresa_id = NEW.empresa_id AND codigo = '1.1.05' LIMIT 1;

  IF NEW.forma_pago = 'efectivo' THEN
    SELECT id INTO v_destino FROM plan_cuentas
     WHERE empresa_id = NEW.empresa_id AND codigo = '1.1.01' LIMIT 1;
  ELSE
    SELECT id INTO v_destino FROM plan_cuentas
     WHERE empresa_id = NEW.empresa_id AND codigo LIKE '1.1.02%'
     ORDER BY codigo LIMIT 1;
  END IF;

  IF v_cxc IS NULL OR v_destino IS NULL THEN RETURN NEW; END IF;

  SELECT 'ASI-' || LPAD(
    (COALESCE(MAX(CAST(REGEXP_REPLACE(numero_asiento,'[^0-9]','','g') AS INT)), 0) + 1)::TEXT,
    6, '0')
  INTO v_num FROM asientos_contables WHERE empresa_id = NEW.empresa_id;

  INSERT INTO asientos_contables
    (empresa_id, numero_asiento, fecha, descripcion, estado)
  VALUES
    (NEW.empresa_id, v_num, NEW.fecha, v_desc, 'contabilizado')
  RETURNING id INTO v_asiento;

  INSERT INTO asientos_detalle (asiento_id, cuenta_id, debe, haber, descripcion) VALUES
    (v_asiento, v_destino, ROUND(NEW.monto, 2), 0,                   v_desc),
    (v_asiento, v_cxc,     0,                   ROUND(NEW.monto, 2), v_desc);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_abono_cxc_asiento ON abonos_cxc;
CREATE TRIGGER trg_abono_cxc_asiento
  AFTER INSERT ON abonos_cxc
  FOR EACH ROW EXECUTE FUNCTION fn_abono_cxc_asiento();

-- ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_abono_cxp_asiento()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_cxp    UUID;
  v_origen UUID;
  v_asiento UUID;
  v_num    TEXT;
  v_numDoc TEXT;
  v_desc   TEXT;
BEGIN
  IF NEW.estado != 'aplicado' THEN RETURN NEW; END IF;

  SELECT numero_compra INTO v_numDoc FROM compras WHERE id = NEW.compra_id;
  v_desc := 'Pago CxP Compra ' || COALESCE(v_numDoc, '');

  -- 2.1.01 CxP Proveedores
  SELECT id INTO v_cxp FROM plan_cuentas
   WHERE empresa_id = NEW.empresa_id AND codigo = '2.1.01' LIMIT 1;

  IF NEW.forma_pago = 'efectivo' THEN
    SELECT id INTO v_origen FROM plan_cuentas
     WHERE empresa_id = NEW.empresa_id AND codigo = '1.1.01' LIMIT 1;
  ELSE
    SELECT id INTO v_origen FROM plan_cuentas
     WHERE empresa_id = NEW.empresa_id AND codigo LIKE '1.1.02%'
     ORDER BY codigo LIMIT 1;
  END IF;

  IF v_cxp IS NULL OR v_origen IS NULL THEN RETURN NEW; END IF;

  SELECT 'ASI-' || LPAD(
    (COALESCE(MAX(CAST(REGEXP_REPLACE(numero_asiento,'[^0-9]','','g') AS INT)), 0) + 1)::TEXT,
    6, '0')
  INTO v_num FROM asientos_contables WHERE empresa_id = NEW.empresa_id;

  INSERT INTO asientos_contables
    (empresa_id, numero_asiento, fecha, descripcion, estado)
  VALUES
    (NEW.empresa_id, v_num, NEW.fecha, v_desc, 'contabilizado')
  RETURNING id INTO v_asiento;

  INSERT INTO asientos_detalle (asiento_id, cuenta_id, debe, haber, descripcion) VALUES
    (v_asiento, v_cxp,    ROUND(NEW.monto, 2), 0,                   v_desc),
    (v_asiento, v_origen, 0,                   ROUND(NEW.monto, 2), v_desc);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_abono_cxp_asiento ON abonos_cxp;
CREATE TRIGGER trg_abono_cxp_asiento
  AFTER INSERT ON abonos_cxp
  FOR EACH ROW EXECUTE FUNCTION fn_abono_cxp_asiento();
