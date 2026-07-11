-- ================================================================
-- CORRECCIONES INTEGRALES DE AUDITORÍA — 2026-07-11
-- Basado en AUDITORIA_SARA_2026-07-11.md
--
-- 1.  Cuentas nuevas: 6.4 Gasto IR, 6.4.01, 1.1.13 Adelantos a Empleados
-- 2.  Columnas nuevas: planillas.total_adelantos / total_prestamos_inss,
--     empresas.pmd_alicuota (PMD 1%/2%/3% según categoría DGI)
-- 3.  get_next_numero_asiento: advisory lock (elimina carrera de numeración)
-- 4.  fn_contabilizar_factura / fn_contabilizar_compra: guard TG_OP
--     (evita error "record old is not assigned yet" al INSERT directo)
-- 5.  fn_contabilizar_compra: respeta retención calculada en el formulario
--     (código/alícuota) y umbral C$1,000 del Art. 44 num 2.2 Regl. LCT
-- 6.  fn_contabilizar_nota_credito: 4.1.04 Devoluciones (antes debitaba
--     4.1.03 Ventas Exentas — contaminaba la Planilla de Ingresos VET)
-- 7.  fn_contabilizar_planilla: códigos correctos del plan real
--     (antes: sueldos→6.2.01 Intereses Bancarios, pasivos corridos)
-- 8.  fn_contabilizar_depreciacion: 6.1.16 y Dep. Acumulada 1.2.07-11
--     (antes buscaba 6.2.12 inexistente → la depreciación NUNCA se
--     contabilizaba) + backfill de depreciaciones históricas
-- 9.  fn_contabilizar_anticipo_ir: 1.1.10 (antes 1.1.09 = IVA Crédito)
-- 10. Reparación de datos: NC históricas 4.1.03→4.1.04, asientos de
--     planilla duplicados, liquidaciones IR sin gasto
-- ================================================================


-- ────────────────────────────────────────────────────────────────
-- 1. CUENTAS NUEVAS EN EL PLAN (para todas las empresas existentes)
-- ────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_emp   UUID;
  v_p6    UUID;   -- padre '6' Gastos
  v_p64   UUID;   -- '6.4'
  v_p11   UUID;   -- padre '1.1' Activo Corriente
BEGIN
  FOR v_emp IN SELECT DISTINCT empresa_id FROM plan_cuentas LOOP

    SELECT id INTO v_p6  FROM plan_cuentas WHERE empresa_id=v_emp AND codigo='6'   LIMIT 1;
    SELECT id INTO v_p11 FROM plan_cuentas WHERE empresa_id=v_emp AND codigo='1.1' LIMIT 1;

    -- 6.4 Gasto por Impuesto sobre la Renta (nivel 2)
    IF NOT EXISTS (SELECT 1 FROM plan_cuentas WHERE empresa_id=v_emp AND codigo='6.4') THEN
      INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id)
      VALUES (v_emp,'6.4','Gasto por Impuesto sobre la Renta','gasto','deudora',2,false,
              'IR anual del ejercicio (Art. 52 LCT). NO deducible para el propio IR.',v_p6);
    END IF;

    SELECT id INTO v_p64 FROM plan_cuentas WHERE empresa_id=v_emp AND codigo='6.4' LIMIT 1;

    IF NOT EXISTS (SELECT 1 FROM plan_cuentas WHERE empresa_id=v_emp AND codigo='6.4.01') THEN
      INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id)
      VALUES (v_emp,'6.4.01','IR del Ejercicio','gasto','deudora',3,true,
              'Gasto por IR anual reconocido en la liquidación F-106',v_p64);
    END IF;

    -- 1.1.13 Adelantos y Préstamos a Empleados (activo)
    IF NOT EXISTS (SELECT 1 FROM plan_cuentas WHERE empresa_id=v_emp AND codigo='1.1.13') THEN
      INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id)
      VALUES (v_emp,'1.1.13','Adelantos y Préstamos a Empleados','activo','deudora',3,true,
              'Adelantos salariales y préstamos recuperados vía planilla',v_p11);
    END IF;

  END LOOP;
END $$;


-- ────────────────────────────────────────────────────────────────
-- 2. COLUMNAS NUEVAS
-- ────────────────────────────────────────────────────────────────
ALTER TABLE planillas ADD COLUMN IF NOT EXISTS total_adelantos       NUMERIC(15,2) NOT NULL DEFAULT 0;
ALTER TABLE planillas ADD COLUMN IF NOT EXISTS total_prestamos_inss  NUMERIC(15,2) NOT NULL DEFAULT 0;

-- PMD / anticipo IR configurable: 0.01 (resto), 0.02 (principales), 0.03 (grandes) — Ley 987
ALTER TABLE empresas_juridicas
  ADD COLUMN IF NOT EXISTS pmd_alicuota NUMERIC(5,4) NOT NULL DEFAULT 0.01
  CHECK (pmd_alicuota > 0 AND pmd_alicuota <= 0.03);
ALTER TABLE empresas_persona_natural
  ADD COLUMN IF NOT EXISTS pmd_alicuota NUMERIC(5,4) NOT NULL DEFAULT 0.01
  CHECK (pmd_alicuota > 0 AND pmd_alicuota <= 0.03);

COMMENT ON COLUMN empresas_juridicas.pmd_alicuota IS
  'Alícuota PMD/anticipo IR: 0.01 resto, 0.02 principales, 0.03 grandes contribuyentes (Ley 987).';
COMMENT ON COLUMN empresas_persona_natural.pmd_alicuota IS
  'Alícuota PMD/anticipo IR: 0.01 resto, 0.02 principales, 0.03 grandes contribuyentes (Ley 987).';


-- ────────────────────────────────────────────────────────────────
-- 3. NUMERACIÓN DE ASIENTOS SIN CARRERA (advisory lock por período)
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_next_numero_asiento(p_empresa_id UUID, p_anio INT, p_mes INT)
RETURNS INT AS $$
DECLARE v_max INT;
BEGIN
  -- Serializa la asignación de correlativos dentro de la transacción
  PERFORM pg_advisory_xact_lock(hashtext(p_empresa_id::text || '-' || p_anio::text || '-' || p_mes::text));

  SELECT COALESCE(MAX(numero), 0) + 1 INTO v_max
  FROM asientos_contables
  WHERE empresa_id = p_empresa_id AND periodo_anio = p_anio AND periodo_mes = p_mes;
  RETURN v_max;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION get_next_numero_asiento(UUID, INT, INT) TO authenticated;


-- ────────────────────────────────────────────────────────────────
-- 4. fn_contabilizar_factura — guard TG_OP (resto idéntico a la
--    versión de 20260705130200)
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_contabilizar_factura()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_asiento_id      UUID;
  v_numero          INT;
  v_anio            INT; v_mes INT;
  v_num_str         TEXT;
  v_caja_id         UUID; v_cxc_id UUID;
  v_banco_id        UUID; v_tarjeta_id UUID;
  v_ventas_id       UUID; v_iva_deb_id UUID;
  v_debe_id         UUID;
  v_cuenta_caja_id  UUID;
  v_cuenta_banco_id UUID;
  v_cuenta_contable_banco UUID;
  v_cuenta_moneda   TEXT;
  v_tasa            NUMERIC;
  v_monto_operativo NUMERIC;
BEGIN
  IF NEW.estado <> 'emitida' THEN RETURN NEW; END IF;
  -- FIX AUDITORÍA: en INSERT no existe OLD; sin este guard el INSERT
  -- directo de una factura emitida lanzaba "record old is not assigned yet"
  IF TG_OP = 'UPDATE' AND OLD.estado = 'emitida' THEN RETURN NEW; END IF;
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

  SELECT id INTO v_caja_id    FROM plan_cuentas WHERE empresa_id=NEW.empresa_id AND codigo='1.1.01' AND activa=true LIMIT 1;
  SELECT id INTO v_cxc_id     FROM plan_cuentas WHERE empresa_id=NEW.empresa_id AND codigo='1.1.05' AND activa=true LIMIT 1;
  SELECT id INTO v_tarjeta_id FROM plan_cuentas WHERE empresa_id=NEW.empresa_id AND codigo='1.1.02.02' AND activa=true LIMIT 1;
  SELECT id INTO v_ventas_id  FROM plan_cuentas WHERE empresa_id=NEW.empresa_id AND codigo='4.1.01' AND activa=true LIMIT 1;
  SELECT id INTO v_iva_deb_id FROM plan_cuentas WHERE empresa_id=NEW.empresa_id AND codigo='2.1.03' AND activa=true LIMIT 1;

  IF v_ventas_id IS NULL THEN RETURN NEW; END IF;

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

    v_banco_id := v_cuenta_contable_banco;
  END IF;

  CASE NEW.tipo_pago
    WHEN 'contado'       THEN v_debe_id := COALESCE(v_caja_id,   v_cxc_id);
    WHEN 'credito'       THEN v_debe_id := COALESCE(v_cxc_id,    v_caja_id);
    WHEN 'transferencia' THEN v_debe_id := COALESCE(v_banco_id,  v_caja_id);
    WHEN 'cheque'        THEN v_debe_id := COALESCE(v_banco_id,  v_caja_id);
    WHEN 'tarjeta'       THEN v_debe_id := COALESCE(v_tarjeta_id, v_banco_id, v_caja_id);
    ELSE                      v_debe_id := COALESCE(v_caja_id,   v_cxc_id);
  END CASE;

  IF v_debe_id IS NULL THEN RETURN NEW; END IF;

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

  INSERT INTO asientos_detalle (asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
  VALUES (v_asiento_id, v_ventas_id,
    'Venta - ' || NEW.numero_factura, 0, NEW.subtotal, 2, NEW.empresa_id);

  IF NEW.iva_total > 0 AND v_iva_deb_id IS NOT NULL THEN
    INSERT INTO asientos_detalle (asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
    VALUES (v_asiento_id, v_iva_deb_id,
      'IVA 15% - ' || NEW.numero_factura, 0, NEW.iva_total, 3, NEW.empresa_id);
  END IF;

  IF NEW.tipo_pago = 'contado' THEN
    v_cuenta_caja_id := NEW.cuenta_caja_id;
    IF v_cuenta_caja_id IS NULL THEN
      SELECT id INTO v_cuenta_caja_id FROM cuentas_caja
      WHERE empresa_id=NEW.empresa_id AND activa=true
      ORDER BY tipo='caja_general' DESC, created_at LIMIT 1;
    END IF;
    IF v_cuenta_caja_id IS NOT NULL THEN
      SELECT moneda INTO v_cuenta_moneda FROM cuentas_caja WHERE id = v_cuenta_caja_id;
      v_tasa := NULL;
      v_monto_operativo := NEW.total;
      IF v_cuenta_moneda = 'USD' THEN
        v_tasa := COALESCE(NEW.tasa_cambio, fn_tasa_cambio_vigente(NEW.empresa_id, NEW.fecha_emision));
        IF v_tasa IS NULL OR v_tasa <= 0 THEN
          RAISE EXCEPTION 'No hay tasa de cambio registrada para convertir el cobro de % (C$%) a la caja en USD. Registra la tasa del día en Tasa de Cambio.', NEW.numero_factura, NEW.total;
        END IF;
        v_monto_operativo := ROUND(NEW.total / v_tasa, 2);
        UPDATE facturas SET moneda = 'USD', tasa_cambio = v_tasa, total_usd = v_monto_operativo WHERE id = NEW.id;
      END IF;

      INSERT INTO movimientos_caja(empresa_id,cuenta_caja_id,tipo,monto,descripcion,ref_factura_id,asiento_id,fecha,sesion_caja_id)
      VALUES(NEW.empresa_id, v_cuenta_caja_id, 'ingreso', v_monto_operativo,
        'Venta contado ' || NEW.numero_factura || ' - ' || NEW.cliente_nombre ||
        CASE WHEN v_tasa IS NOT NULL THEN ' (C$' || NEW.total || ' @ ' || v_tasa || ')' ELSE '' END,
        NEW.id, v_asiento_id, NEW.fecha_emision, NEW.sesion_caja_id);
    END IF;

  ELSIF NEW.tipo_pago IN ('transferencia','cheque','tarjeta') THEN
    v_cuenta_banco_id := NEW.cuenta_banco_id;
    IF v_cuenta_banco_id IS NULL THEN
      SELECT id INTO v_cuenta_banco_id FROM cuentas_banco
      WHERE empresa_id=NEW.empresa_id AND activa=true ORDER BY created_at LIMIT 1;
    END IF;
    IF v_cuenta_banco_id IS NOT NULL THEN
      SELECT moneda INTO v_cuenta_moneda FROM cuentas_banco WHERE id = v_cuenta_banco_id;
      v_tasa := NULL;
      v_monto_operativo := NEW.total;
      IF v_cuenta_moneda = 'USD' THEN
        v_tasa := COALESCE(NEW.tasa_cambio, fn_tasa_cambio_vigente(NEW.empresa_id, NEW.fecha_emision));
        IF v_tasa IS NULL OR v_tasa <= 0 THEN
          RAISE EXCEPTION 'No hay tasa de cambio registrada para convertir el cobro de % (C$%) a la cuenta bancaria en USD. Registra la tasa del día en Tasa de Cambio.', NEW.numero_factura, NEW.total;
        END IF;
        v_monto_operativo := ROUND(NEW.total / v_tasa, 2);
        UPDATE facturas SET moneda = 'USD', tasa_cambio = v_tasa, total_usd = v_monto_operativo WHERE id = NEW.id;
      END IF;

      INSERT INTO transacciones_banco(empresa_id,cuenta_banco_id,tipo,monto,descripcion,ref_factura_id,asiento_id,fecha)
      VALUES(NEW.empresa_id, v_cuenta_banco_id,
        CASE NEW.tipo_pago WHEN 'cheque' THEN 'cheque' WHEN 'tarjeta' THEN 'tarjeta' ELSE 'transferencia' END,
        v_monto_operativo,
        'Cobro ' || NEW.tipo_pago || ' - ' || NEW.numero_factura || ' - ' || NEW.cliente_nombre ||
        CASE WHEN v_tasa IS NOT NULL THEN ' (C$' || NEW.total || ' @ ' || v_tasa || ')' ELSE '' END,
        NEW.id, v_asiento_id, NEW.fecha_emision);
    END IF;
  END IF;

  PERFORM fn_costear_linea_venta(df.id)
  FROM detalle_facturas df
  WHERE df.factura_id = NEW.id;

  RETURN NEW;
END;
$function$;


-- ────────────────────────────────────────────────────────────────
-- 5. fn_contabilizar_compra — guard TG_OP + respeta retención del
--    formulario (código y alícuota) + umbral C$1,000
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_contabilizar_compra()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_asiento_id            UUID;
  v_numero                INT; v_anio INT; v_mes INT;
  v_num_str               TEXT;
  v_inventario_id         UUID; v_iva_cred_id UUID;
  v_cxp_id                UUID; v_caja_id UUID;
  v_haber_id              UUID;
  v_retencion_ir_id       UUID;
  v_cuenta_caja_id        UUID;
  v_cuenta_banco_id       UUID;
  v_cuenta_contable_banco UUID;
  v_tipo_persona          TEXT;
  v_retencion_ir          NUMERIC;
  v_total_a_pagar         NUMERIC;
  v_transaccion_id        UUID;
  v_num_cheque            TEXT;
  v_proveedor_nombre      TEXT;
  v_cuenta_moneda         TEXT;
  v_tasa                  NUMERIC;
  v_monto_operativo       NUMERIC;
BEGIN
  IF NEW.estado <> 'recibida' THEN RETURN NEW; END IF;
  -- FIX AUDITORÍA: guard TG_OP (ver fn_contabilizar_factura)
  IF TG_OP = 'UPDATE' AND OLD.estado = 'recibida' THEN RETURN NEW; END IF;
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

  SELECT id INTO v_inventario_id FROM plan_cuentas WHERE empresa_id=NEW.empresa_id AND codigo='1.1.08' AND activa=true LIMIT 1;
  SELECT id INTO v_iva_cred_id   FROM plan_cuentas WHERE empresa_id=NEW.empresa_id AND codigo='1.1.09' AND activa=true LIMIT 1;
  SELECT id INTO v_cxp_id        FROM plan_cuentas WHERE empresa_id=NEW.empresa_id AND codigo='2.1.01' AND activa=true LIMIT 1;
  SELECT id INTO v_caja_id       FROM plan_cuentas WHERE empresa_id=NEW.empresa_id AND codigo='1.1.01' AND activa=true LIMIT 1;
  SELECT id INTO v_retencion_ir_id FROM plan_cuentas
  WHERE empresa_id=NEW.empresa_id
    AND (codigo='2.1.06' OR nombre ILIKE '%retenci%ir%enterar%' OR nombre ILIKE '%retenci%ir%pagar%')
    AND activa=true LIMIT 1;

  IF v_inventario_id IS NULL THEN RETURN NEW; END IF;

  -- ── Retención IR ──────────────────────────────────────────────
  -- FIX AUDITORÍA: antes recalculaba SIEMPRE 2% plano para persona
  -- natural y sobreescribía la retención elegida en el formulario
  -- (ej. 10% servicios profesionales). Ahora:
  --   a) si la compra ya trae retencion_ir (calculada en el formulario
  --      con su código DGI), se respeta tal cual;
  --   b) si no trae, default 2% para persona natural SOLO si el
  --      subtotal supera C$1,000 (Art. 44 num. 2.2 Reglamento LCT).
  SELECT COALESCE(tipo_persona,'juridica') INTO v_tipo_persona
  FROM proveedores WHERE id = NEW.proveedor_id;

  IF COALESCE(NEW.retencion_ir, 0) > 0 THEN
    v_retencion_ir := NEW.retencion_ir;
  ELSIF v_tipo_persona = 'natural' AND NEW.retencion_codigo IS NULL AND NEW.subtotal > 1000 THEN
    v_retencion_ir := ROUND(NEW.subtotal * 0.02, 2);
  ELSE
    v_retencion_ir := 0;
  END IF;
  v_total_a_pagar := NEW.total - v_retencion_ir;

  UPDATE compras SET retencion_ir=v_retencion_ir, total_a_pagar=v_total_a_pagar,
    retencion_codigo = COALESCE(NEW.retencion_codigo, CASE WHEN v_retencion_ir > 0 THEN '22' ELSE NULL END)
  WHERE id=NEW.id;

  IF NEW.tipo_pago IN ('transferencia','cheque','tarjeta') THEN
    IF NEW.cuenta_banco_id IS NOT NULL THEN
      SELECT cuenta_contable_id INTO v_cuenta_contable_banco FROM cuentas_banco WHERE id=NEW.cuenta_banco_id;
    END IF;
    IF v_cuenta_contable_banco IS NULL THEN
      SELECT cuenta_contable_id INTO v_cuenta_contable_banco FROM cuentas_banco
      WHERE empresa_id=NEW.empresa_id AND activa=true ORDER BY created_at LIMIT 1;
    END IF;
    IF v_cuenta_contable_banco IS NULL THEN
      SELECT id INTO v_cuenta_contable_banco FROM plan_cuentas
      WHERE empresa_id=NEW.empresa_id AND codigo='1.1.02.01' AND activa=true LIMIT 1;
    END IF;
  END IF;

  CASE NEW.tipo_pago
    WHEN 'credito'       THEN v_haber_id := COALESCE(v_cxp_id, v_caja_id);
    WHEN 'contado'       THEN v_haber_id := COALESCE(v_caja_id, v_cxp_id);
    WHEN 'transferencia' THEN v_haber_id := COALESCE(v_cuenta_contable_banco, v_caja_id);
    WHEN 'cheque'        THEN v_haber_id := COALESCE(v_cuenta_contable_banco, v_caja_id);
    WHEN 'tarjeta'       THEN v_haber_id := COALESCE(v_cuenta_contable_banco, v_caja_id);
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
    'Compra ' || NEW.numero_compra,
    'Compra ' || NEW.numero_compra || ' (' || NEW.tipo_pago || ')',
    'egreso','compra',NEW.id,NEW.numero_compra,
    v_num_str,v_numero,v_anio,v_mes,
    NEW.id,'aprobado',NEW.total,NEW.total
  ) RETURNING id INTO v_asiento_id;

  INSERT INTO asientos_detalle (asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
  VALUES (v_asiento_id, v_inventario_id, 'Inventario - '||NEW.numero_compra, NEW.subtotal, 0, 1, NEW.empresa_id);

  IF NEW.iva_total > 0 AND v_iva_cred_id IS NOT NULL THEN
    INSERT INTO asientos_detalle (asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
    VALUES (v_asiento_id, v_iva_cred_id, 'IVA CF 15% - '||NEW.numero_compra, NEW.iva_total, 0, 2, NEW.empresa_id);
  END IF;

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

  IF v_retencion_ir > 0 AND v_retencion_ir_id IS NOT NULL THEN
    INSERT INTO asientos_detalle (asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
    VALUES (v_asiento_id, v_retencion_ir_id, 'Retención IR - '||NEW.numero_compra, 0, v_retencion_ir, 4, NEW.empresa_id);
  END IF;

  IF NEW.tipo_pago = 'contado' THEN
    v_cuenta_caja_id := NEW.cuenta_caja_id;
    IF v_cuenta_caja_id IS NULL THEN
      SELECT id INTO v_cuenta_caja_id FROM cuentas_caja
      WHERE empresa_id=NEW.empresa_id AND activa=true
      ORDER BY tipo='caja_general' DESC, created_at LIMIT 1;
    END IF;
    IF v_cuenta_caja_id IS NOT NULL THEN
      SELECT moneda INTO v_cuenta_moneda FROM cuentas_caja WHERE id = v_cuenta_caja_id;
      v_tasa := NULL;
      v_monto_operativo := v_total_a_pagar;
      IF v_cuenta_moneda = 'USD' THEN
        v_tasa := COALESCE(NEW.tasa_cambio, fn_tasa_cambio_vigente(NEW.empresa_id, NEW.fecha_compra));
        IF v_tasa IS NULL OR v_tasa <= 0 THEN
          RAISE EXCEPTION 'No hay tasa de cambio registrada para convertir el pago de % (C$%) a la caja en USD. Registra la tasa del día en Tasa de Cambio.', NEW.numero_compra, v_total_a_pagar;
        END IF;
        v_monto_operativo := ROUND(v_total_a_pagar / v_tasa, 2);
        UPDATE compras SET moneda = 'USD', tasa_cambio = v_tasa WHERE id = NEW.id;
      END IF;

      INSERT INTO movimientos_caja(empresa_id,cuenta_caja_id,tipo,monto,descripcion,ref_compra_id,asiento_id,fecha)
      VALUES(NEW.empresa_id, v_cuenta_caja_id, 'egreso', v_monto_operativo,
        'Pago contado '||NEW.numero_compra ||
        CASE WHEN v_tasa IS NOT NULL THEN ' (C$' || v_total_a_pagar || ' @ ' || v_tasa || ')' ELSE '' END,
        NEW.id, v_asiento_id, NEW.fecha_compra);
    END IF;

  ELSIF NEW.tipo_pago IN ('transferencia','cheque','tarjeta') THEN
    v_cuenta_banco_id := NEW.cuenta_banco_id;
    IF v_cuenta_banco_id IS NULL THEN
      SELECT id INTO v_cuenta_banco_id FROM cuentas_banco
      WHERE empresa_id=NEW.empresa_id AND activa=true ORDER BY created_at LIMIT 1;
    END IF;
    IF v_cuenta_banco_id IS NOT NULL THEN
      SELECT moneda INTO v_cuenta_moneda FROM cuentas_banco WHERE id = v_cuenta_banco_id;
      v_tasa := NULL;
      v_monto_operativo := v_total_a_pagar;
      IF v_cuenta_moneda = 'USD' THEN
        v_tasa := COALESCE(NEW.tasa_cambio, fn_tasa_cambio_vigente(NEW.empresa_id, NEW.fecha_compra));
        IF v_tasa IS NULL OR v_tasa <= 0 THEN
          RAISE EXCEPTION 'No hay tasa de cambio registrada para convertir el pago de % (C$%) a la cuenta bancaria en USD. Registra la tasa del día en Tasa de Cambio.', NEW.numero_compra, v_total_a_pagar;
        END IF;
        v_monto_operativo := ROUND(v_total_a_pagar / v_tasa, 2);
        UPDATE compras SET moneda = 'USD', tasa_cambio = v_tasa WHERE id = NEW.id;
      END IF;

      INSERT INTO transacciones_banco(empresa_id,cuenta_banco_id,tipo,monto,descripcion,ref_compra_id,asiento_id,fecha)
      VALUES(NEW.empresa_id, v_cuenta_banco_id,
        CASE NEW.tipo_pago WHEN 'cheque' THEN 'cheque' WHEN 'tarjeta' THEN 'tarjeta' ELSE 'transferencia' END,
        v_monto_operativo,
        'Pago '||NEW.tipo_pago||' - '||NEW.numero_compra ||
        CASE WHEN v_tasa IS NOT NULL THEN ' (C$' || v_total_a_pagar || ' @ ' || v_tasa || ')' ELSE '' END,
        NEW.id, v_asiento_id, NEW.fecha_compra)
      RETURNING id INTO v_transaccion_id;

      IF NEW.tipo_pago = 'cheque' THEN
        SELECT COALESCE(nombre, 'Sin nombre') INTO v_proveedor_nombre
        FROM proveedores WHERE id = NEW.proveedor_id LIMIT 1;

        v_num_cheque := 'CHQ-' || NEW.numero_compra;

        INSERT INTO cheques(
          empresa_id, cuenta_banco_id, numero_cheque, tipo,
          monto, beneficiario, fecha_emision,
          ref_compra_id, transaccion_banco_id, estado, notas
        ) VALUES (
          NEW.empresa_id, v_cuenta_banco_id, v_num_cheque, 'emitido',
          v_monto_operativo, v_proveedor_nombre, NEW.fecha_compra,
          NEW.id, v_transaccion_id, 'activo',
          'Cheque emitido por compra '||NEW.numero_compra
        );
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


-- ────────────────────────────────────────────────────────────────
-- 6. fn_contabilizar_nota_credito — debita 4.1.04 Devoluciones
--    (antes 4.1.03 Ventas Exentas). Resto idéntico a 20260705130400.
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_contabilizar_nota_credito()
RETURNS TRIGGER AS $$
DECLARE
  v_asiento_id   UUID;
  v_numero       INT;
  v_anio         INT; v_mes INT;
  v_num_str      TEXT;
  v_dev_ventas   UUID;  -- 4.1.04 Devoluciones en Ventas
  v_iva_deb      UUID;  -- 2.1.03
  v_contrapartida UUID;
  v_tipo_pago    TEXT;
  v_caja_id      UUID;
  v_banco_id     UUID;
  v_cxc_id       UUID;
  v_cuenta_caja_operativa UUID;
  v_cuenta_moneda TEXT;
  v_tasa_factura  NUMERIC;
  v_tasa          NUMERIC;
  v_monto_operativo NUMERIC;
BEGIN
  IF NEW.tipo <> 'credito' THEN RETURN NEW; END IF;

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

  -- FIX AUDITORÍA: 4.1.04 = Devoluciones en Ventas (naturaleza deudora).
  -- 4.1.03 es "Ventas Exentas de IVA" y contaminaba la Planilla de
  -- Ingresos del VET y el renglón de exentas de la DMI.
  v_dev_ventas := get_cuenta_id(NEW.empresa_id, '4.1.04');
  IF v_dev_ventas IS NULL THEN
    v_dev_ventas := get_cuenta_id(NEW.empresa_id, '4.1.03'); -- fallback plan viejo
  END IF;
  v_iva_deb    := get_cuenta_id(NEW.empresa_id, '2.1.03');
  v_cxc_id     := get_cuenta_id(NEW.empresa_id, '1.1.05');
  v_caja_id    := get_cuenta_id(NEW.empresa_id, '1.1.01');

  IF v_dev_ventas IS NULL THEN RETURN NEW; END IF;

  IF NEW.ref_factura_id IS NOT NULL THEN
    SELECT f.tipo_pago, f.tasa_cambio INTO v_tipo_pago, v_tasa_factura
    FROM facturas f WHERE f.id = NEW.ref_factura_id;

    IF v_tipo_pago IN ('transferencia','cheque','tarjeta') THEN
      SELECT cb.cuenta_contable_id INTO v_banco_id
      FROM facturas f
      JOIN cuentas_banco cb ON cb.id = f.cuenta_banco_id
      WHERE f.id = NEW.ref_factura_id;
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
    v_contrapartida := v_cxc_id;
  END IF;

  IF v_contrapartida IS NULL THEN v_contrapartida := v_cxc_id; END IF;

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

  INSERT INTO asientos_detalle (asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
  VALUES (v_asiento_id, v_dev_ventas,
    'Devolución venta NC ' || NEW.numero_nota, NEW.subtotal, 0, 1, NEW.empresa_id);

  IF NEW.iva > 0 AND v_iva_deb IS NOT NULL THEN
    INSERT INTO asientos_detalle (asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
    VALUES (v_asiento_id, v_iva_deb,
      'IVA s/devolución NC ' || NEW.numero_nota, NEW.iva, 0, 2, NEW.empresa_id);
  END IF;

  INSERT INTO asientos_detalle (asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
  VALUES (v_asiento_id, v_contrapartida,
    'Crédito a cliente NC ' || NEW.numero_nota, 0, NEW.total, 3, NEW.empresa_id);

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

  UPDATE notas_credito_debito SET asiento_id = v_asiento_id WHERE id = NEW.id;

  PERFORM fn_nc_restaurar_inventario(NEW.id, NEW.empresa_id, NEW.numero_nota);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ────────────────────────────────────────────────────────────────
-- 7. fn_contabilizar_planilla — códigos correctos del plan real
--    Gastos 6.1.01-06 · Pasivos 2.1.07-2.1.14 · Neto 2.1.10
--    Adelantos/préstamos → 1.1.13 · Otros descuentos → 2.1.02
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_contabilizar_planilla()
RETURNS TRIGGER AS $$
DECLARE
  v_asiento_id UUID;
  v_numero     INT; v_anio INT; v_mes INT;
  v_num_str    TEXT;
  -- Gastos
  v_sueldos    UUID; v_inss_pat_g UUID; v_inatec_g UUID;
  v_vac_g      UUID; v_agu_g      UUID; v_ind_g    UUID;
  -- Pasivos / Activo
  v_p_neto     UUID; v_p_inss_lab UUID; v_p_inss_pat UUID;
  v_p_inatec   UUID; v_p_ir       UUID; v_p_vac    UUID;
  v_p_agu      UUID; v_p_ind      UUID;
  v_adelantos_cta UUID; v_otras_cxp UUID;
  -- Montos
  v_bruto NUMERIC; v_inss_pat NUMERIC; v_inatec NUMERIC;
  v_inss_lab NUMERIC; v_ir NUMERIC; v_vac NUMERIC;
  v_agu NUMERIC; v_ind NUMERIC; v_neto NUMERIC;
  v_adelantos NUMERIC; v_otros_desc NUMERIC;
  v_total_debe NUMERIC; v_total_haber NUMERIC;
BEGIN
  IF NEW.estado NOT IN ('aprobada','pagada') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.estado IN ('aprobada','pagada') THEN RETURN NEW; END IF;

  -- Evitar duplicado (el API normalmente crea el asiento; este trigger
  -- es red de seguridad si el API falla)
  IF EXISTS (
    SELECT 1 FROM asientos_contables
    WHERE empresa_id = NEW.empresa_id
      AND referencia_tipo = 'planilla'
      AND referencia_id = NEW.id
      AND tipo = 'automatico_nomina'
      AND estado <> 'anulado'
  ) THEN RETURN NEW; END IF;

  v_bruto      := COALESCE(NEW.total_salarios_brutos, 0);
  v_inss_pat   := COALESCE(NEW.total_inss_patronal,   0);
  v_inatec     := COALESCE(NEW.total_inatec,          0);
  v_inss_lab   := COALESCE(NEW.total_inss_laboral,    0);
  v_ir         := COALESCE(NEW.total_ir_laboral,      0);
  v_vac        := COALESCE(NEW.total_prov_vacaciones, 0);
  v_agu        := COALESCE(NEW.total_prov_aguinaldo,  0);
  v_ind        := COALESCE(NEW.total_prov_indemnizacion, 0);
  v_neto       := COALESCE(NEW.total_neto_pagar, 0);
  v_adelantos  := COALESCE(NEW.total_adelantos, 0) + COALESCE(NEW.total_prestamos_inss, 0);
  v_otros_desc := COALESCE(NEW.total_otros_descuentos, 0);

  IF v_bruto <= 0 THEN RETURN NEW; END IF;

  v_anio := COALESCE(NEW.periodo_anio, EXTRACT(YEAR FROM CURRENT_DATE)::INT);
  v_mes  := COALESCE(NEW.periodo_mes,  EXTRACT(MONTH FROM CURRENT_DATE)::INT);
  v_numero  := get_next_numero_asiento(NEW.empresa_id, v_anio, v_mes);
  v_num_str := 'AST-' || LPAD(v_anio::TEXT,4,'0') || '-'
                       || LPAD(v_mes::TEXT,2,'0')  || '-'
                       || LPAD(v_numero::TEXT,4,'0');

  -- Cuentas de gasto (plan SARA real)
  v_sueldos    := get_cuenta_id(NEW.empresa_id, '6.1.01');
  v_inss_pat_g := get_cuenta_id(NEW.empresa_id, '6.1.02');
  v_inatec_g   := get_cuenta_id(NEW.empresa_id, '6.1.03');
  v_vac_g      := get_cuenta_id(NEW.empresa_id, '6.1.04');
  v_agu_g      := get_cuenta_id(NEW.empresa_id, '6.1.05');
  v_ind_g      := get_cuenta_id(NEW.empresa_id, '6.1.06');
  -- Cuentas de pasivo / activo
  v_p_inss_pat := get_cuenta_id(NEW.empresa_id, '2.1.07');
  v_p_inss_lab := get_cuenta_id(NEW.empresa_id, '2.1.08');
  v_p_inatec   := get_cuenta_id(NEW.empresa_id, '2.1.09');
  v_p_neto     := get_cuenta_id(NEW.empresa_id, '2.1.10');
  v_p_ir       := get_cuenta_id(NEW.empresa_id, '2.1.11');
  v_p_vac      := get_cuenta_id(NEW.empresa_id, '2.1.12');
  v_p_agu      := get_cuenta_id(NEW.empresa_id, '2.1.13');
  v_p_ind      := get_cuenta_id(NEW.empresa_id, '2.1.14');
  v_adelantos_cta := get_cuenta_id(NEW.empresa_id, '1.1.13');
  v_otras_cxp  := get_cuenta_id(NEW.empresa_id, '2.1.02');

  IF v_sueldos IS NULL OR v_p_neto IS NULL THEN RETURN NEW; END IF;

  v_total_debe  := v_bruto + v_inss_pat + v_inatec + v_vac + v_agu + v_ind;
  v_total_haber := v_neto + v_inss_lab + v_ir + v_inss_pat + v_inatec
                 + v_vac + v_agu + v_ind + v_adelantos + v_otros_desc;

  -- Si por redondeos difieren en más de 1 centavo, no crear asiento roto
  IF ABS(v_total_debe - v_total_haber) > 0.05 THEN
    RAISE WARNING 'Planilla % descuadrada: debe=% haber=%', NEW.id, v_total_debe, v_total_haber;
    RETURN NEW;
  END IF;

  INSERT INTO asientos_contables (
    empresa_id, fecha, descripcion, concepto, tipo,
    referencia_tipo, referencia_id, referencia_num,
    numero_asiento, numero, periodo_anio, periodo_mes,
    estado, total_debe, total_haber
  ) VALUES (
    NEW.empresa_id, COALESCE(NEW.fecha_pago, CURRENT_DATE),
    'Planilla de sueldos — ' || v_mes::TEXT || '/' || v_anio::TEXT,
    'Nómina ' || v_mes::TEXT || '/' || v_anio::TEXT,
    'automatico_nomina', 'planilla', NEW.id,
    'PLAN-' || v_anio::TEXT || '-' || LPAD(v_mes::TEXT,2,'0'),
    v_num_str, v_numero, v_anio, v_mes,
    'aprobado', v_total_debe, v_total_haber
  ) RETURNING id INTO v_asiento_id;

  -- DÉBITOS (gastos)
  INSERT INTO asientos_detalle(asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
  VALUES (v_asiento_id, v_sueldos, 'Sueldos y salarios', v_bruto, 0, 1, NEW.empresa_id);
  IF v_inss_pat > 0 AND v_inss_pat_g IS NOT NULL THEN
    INSERT INTO asientos_detalle(asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
    VALUES (v_asiento_id, v_inss_pat_g, 'INSS Patronal', v_inss_pat, 0, 2, NEW.empresa_id);
  END IF;
  IF v_inatec > 0 AND v_inatec_g IS NOT NULL THEN
    INSERT INTO asientos_detalle(asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
    VALUES (v_asiento_id, v_inatec_g, 'INATEC 2%', v_inatec, 0, 3, NEW.empresa_id);
  END IF;
  IF v_vac > 0 AND v_vac_g IS NOT NULL THEN
    INSERT INTO asientos_detalle(asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
    VALUES (v_asiento_id, v_vac_g, 'Provisión vacaciones', v_vac, 0, 4, NEW.empresa_id);
  END IF;
  IF v_agu > 0 AND v_agu_g IS NOT NULL THEN
    INSERT INTO asientos_detalle(asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
    VALUES (v_asiento_id, v_agu_g, 'Provisión aguinaldo', v_agu, 0, 5, NEW.empresa_id);
  END IF;
  IF v_ind > 0 AND v_ind_g IS NOT NULL THEN
    INSERT INTO asientos_detalle(asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
    VALUES (v_asiento_id, v_ind_g, 'Provisión indemnización', v_ind, 0, 6, NEW.empresa_id);
  END IF;

  -- CRÉDITOS
  INSERT INTO asientos_detalle(asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
  VALUES (v_asiento_id, v_p_neto, 'Neto a pagar empleados', 0, v_neto, 7, NEW.empresa_id);
  IF v_inss_lab > 0 AND v_p_inss_lab IS NOT NULL THEN
    INSERT INTO asientos_detalle(asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
    VALUES (v_asiento_id, v_p_inss_lab, 'INSS Laboral por pagar', 0, v_inss_lab, 8, NEW.empresa_id);
  END IF;
  IF v_inss_pat > 0 AND v_p_inss_pat IS NOT NULL THEN
    INSERT INTO asientos_detalle(asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
    VALUES (v_asiento_id, v_p_inss_pat, 'INSS Patronal por pagar', 0, v_inss_pat, 9, NEW.empresa_id);
  END IF;
  IF v_inatec > 0 AND v_p_inatec IS NOT NULL THEN
    INSERT INTO asientos_detalle(asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
    VALUES (v_asiento_id, v_p_inatec, 'INATEC por pagar', 0, v_inatec, 10, NEW.empresa_id);
  END IF;
  IF v_ir > 0 AND v_p_ir IS NOT NULL THEN
    INSERT INTO asientos_detalle(asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
    VALUES (v_asiento_id, v_p_ir, 'IR Laboral por enterar', 0, v_ir, 11, NEW.empresa_id);
  END IF;
  IF v_vac > 0 AND v_p_vac IS NOT NULL THEN
    INSERT INTO asientos_detalle(asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
    VALUES (v_asiento_id, v_p_vac, 'Vacaciones por pagar', 0, v_vac, 12, NEW.empresa_id);
  END IF;
  IF v_agu > 0 AND v_p_agu IS NOT NULL THEN
    INSERT INTO asientos_detalle(asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
    VALUES (v_asiento_id, v_p_agu, 'Aguinaldo por pagar', 0, v_agu, 13, NEW.empresa_id);
  END IF;
  IF v_ind > 0 AND v_p_ind IS NOT NULL THEN
    INSERT INTO asientos_detalle(asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
    VALUES (v_asiento_id, v_p_ind, 'Indemnización por pagar', 0, v_ind, 14, NEW.empresa_id);
  END IF;
  -- Recuperación de adelantos y préstamos (activo 1.1.13)
  IF v_adelantos > 0 AND v_adelantos_cta IS NOT NULL THEN
    INSERT INTO asientos_detalle(asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
    VALUES (v_asiento_id, v_adelantos_cta, 'Recuperación adelantos/préstamos', 0, v_adelantos, 15, NEW.empresa_id);
  END IF;
  -- Otros descuentos retenidos (embargos, etc.)
  IF v_otros_desc > 0 AND v_otras_cxp IS NOT NULL THEN
    INSERT INTO asientos_detalle(asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id)
    VALUES (v_asiento_id, v_otras_cxp, 'Otros descuentos retenidos', 0, v_otros_desc, 16, NEW.empresa_id);
  END IF;

  UPDATE planillas SET asiento_id = v_asiento_id WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contabilizar_planilla ON planillas;
CREATE TRIGGER trg_contabilizar_planilla
  AFTER INSERT OR UPDATE OF estado ON planillas
  FOR EACH ROW EXECUTE FUNCTION fn_contabilizar_planilla();


-- ────────────────────────────────────────────────────────────────
-- 8. DEPRECIACIÓN: helper reutilizable + trigger corregido + backfill
--    DB 6.1.16 Depreciación del Ejercicio
--    CR 1.2.07-1.2.11 Dep. Acumulada según categoría del activo
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_asiento_depreciacion(p_dep_id UUID)
RETURNS UUID AS $$
DECLARE
  v_dep        RECORD;
  v_asiento_id UUID;
  v_numero     INT;
  v_num_str    TEXT;
  v_gasto_dep  UUID;
  v_dep_acum   UUID;
  v_codigo_dep TEXT;
  v_categoria  TEXT;
BEGIN
  SELECT * INTO v_dep FROM depreciaciones WHERE id = p_dep_id;
  IF NOT FOUND OR v_dep.cuota_mensual IS NULL OR v_dep.cuota_mensual <= 0 THEN
    RETURN NULL;
  END IF;

  -- Evitar duplicado
  IF EXISTS (
    SELECT 1 FROM asientos_contables
    WHERE empresa_id = v_dep.empresa_id
      AND referencia_tipo = 'depreciacion'
      AND referencia_id = v_dep.id
      AND estado <> 'anulado'
  ) THEN RETURN NULL; END IF;

  v_gasto_dep := get_cuenta_id(v_dep.empresa_id, '6.1.16');

  SELECT a.categoria INTO v_categoria
  FROM activos_fijos a WHERE a.id = v_dep.activo_id;

  v_codigo_dep := CASE v_categoria
    WHEN 'edificio'          THEN '1.2.07'
    WHEN 'equipo_tic'        THEN '1.2.08'
    WHEN 'equipo_computo'    THEN '1.2.08'
    WHEN 'equipo_produccion' THEN '1.2.09'
    WHEN 'herramientas'      THEN '1.2.09'
    WHEN 'vehiculo'          THEN '1.2.10'
    WHEN 'mobiliario'        THEN '1.2.11'
    ELSE '1.2.11'
  END;

  v_dep_acum := get_cuenta_id(v_dep.empresa_id, v_codigo_dep);
  IF v_gasto_dep IS NULL OR v_dep_acum IS NULL THEN RETURN NULL; END IF;

  v_numero  := get_next_numero_asiento(v_dep.empresa_id, v_dep.anio, v_dep.mes);
  v_num_str := 'AST-' || LPAD(v_dep.anio::TEXT,4,'0') || '-'
                       || LPAD(v_dep.mes::TEXT,2,'0')  || '-'
                       || LPAD(v_numero::TEXT,4,'0');

  INSERT INTO asientos_contables (
    empresa_id, fecha, descripcion, concepto, tipo,
    referencia_tipo, referencia_id, referencia_num,
    numero_asiento, numero, periodo_anio, periodo_mes,
    estado, total_debe, total_haber
  ) VALUES (
    v_dep.empresa_id,
    (MAKE_DATE(v_dep.anio, v_dep.mes, 1) + INTERVAL '1 month' - INTERVAL '1 day')::DATE,
    'Depreciación ' || v_dep.mes::TEXT || '/' || v_dep.anio::TEXT,
    'Dep. activo fijo (Art. 45 LCT)',
    'egreso', 'depreciacion', v_dep.id,
    'DEP-' || v_dep.anio::TEXT || '-' || LPAD(v_dep.mes::TEXT,2,'0'),
    v_num_str, v_numero, v_dep.anio, v_dep.mes,
    'aprobado', v_dep.cuota_mensual, v_dep.cuota_mensual
  ) RETURNING id INTO v_asiento_id;

  INSERT INTO asientos_detalle(asiento_id,cuenta_id,descripcion,debe,haber,orden,empresa_id) VALUES
    (v_asiento_id, v_gasto_dep, 'Gasto depreciación ' || v_dep.mes::TEXT || '/' || v_dep.anio::TEXT,
     v_dep.cuota_mensual, 0, 1, v_dep.empresa_id),
    (v_asiento_id, v_dep_acum,  'Depreciación acumulada ' || v_dep.mes::TEXT || '/' || v_dep.anio::TEXT,
     0, v_dep.cuota_mensual, 2, v_dep.empresa_id);

  RETURN v_asiento_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION fn_contabilizar_depreciacion()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM fn_asiento_depreciacion(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contabilizar_depreciacion ON depreciaciones;
CREATE TRIGGER trg_contabilizar_depreciacion
  AFTER INSERT ON depreciaciones
  FOR EACH ROW EXECUTE FUNCTION fn_contabilizar_depreciacion();

-- Backfill: contabilizar depreciaciones históricas que quedaron sin asiento
DO $$
DECLARE v_id UUID;
BEGIN
  FOR v_id IN
    SELECT d.id FROM depreciaciones d
    WHERE d.cuota_mensual > 0
      AND NOT EXISTS (
        SELECT 1 FROM asientos_contables ac
        WHERE ac.referencia_tipo='depreciacion' AND ac.referencia_id=d.id
          AND ac.estado <> 'anulado'
      )
    ORDER BY d.anio, d.mes
  LOOP
    PERFORM fn_asiento_depreciacion(v_id);
  END LOOP;
END $$;


-- ────────────────────────────────────────────────────────────────
-- 9. fn_contabilizar_anticipo_ir — 1.1.10 (antes 1.1.09 IVA Crédito)
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_contabilizar_anticipo_ir()
RETURNS TRIGGER AS $$
DECLARE
  v_asiento_id UUID;
  v_numero     INT; v_anio INT; v_mes INT;
  v_num_str    TEXT;
  v_anticipo   UUID;  -- 1.1.10 IR Pagado por Anticipado
  v_caja       UUID;
BEGIN
  IF NEW.estado <> 'pagado' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.estado = 'pagado' THEN RETURN NEW; END IF;

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

  -- FIX AUDITORÍA: 1.1.10 = IR Pagado por Anticipado.
  -- 1.1.09 es IVA Crédito Fiscal y quedaba contaminado.
  v_anticipo := get_cuenta_id(NEW.empresa_id, '1.1.10');
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
    'PMD sobre ingresos brutos',
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


-- ────────────────────────────────────────────────────────────────
-- 10. REPARACIÓN DE DATOS HISTÓRICOS
-- ────────────────────────────────────────────────────────────────

-- 10a. NC históricas: mover líneas de 4.1.03 (Ventas Exentas) a 4.1.04
UPDATE asientos_detalle ad
SET cuenta_id = pc_dev.id
FROM asientos_contables ac,
     plan_cuentas pc_exenta,
     plan_cuentas pc_dev
WHERE ac.id = ad.asiento_id
  AND ac.referencia_tipo = 'nota_credito'
  AND pc_exenta.id = ad.cuenta_id
  AND pc_exenta.codigo = '4.1.03'
  AND pc_dev.empresa_id = pc_exenta.empresa_id
  AND pc_dev.codigo = '4.1.04'
  AND ad.debe > 0;

-- 10b. Asientos de planilla duplicados: anular los posteriores,
--      conservar el primero, y apuntar planillas.asiento_id al vigente
WITH dups AS (
  SELECT id, referencia_id,
         ROW_NUMBER() OVER (PARTITION BY empresa_id, referencia_id
                            ORDER BY created_at, id) AS rn
  FROM asientos_contables
  WHERE referencia_tipo = 'planilla'
    AND tipo IN ('automatico_nomina','egreso')
    AND estado <> 'anulado'
)
UPDATE asientos_contables ac
SET estado = 'anulado',
    descripcion = ac.descripcion || ' [ANULADO — duplicado corregido por auditoría]'
FROM dups
WHERE ac.id = dups.id AND dups.rn > 1;

UPDATE planillas p
SET asiento_id = ac.id
FROM asientos_contables ac
WHERE ac.referencia_tipo = 'planilla'
  AND ac.referencia_id = p.id
  AND ac.tipo IN ('automatico_nomina','egreso')
  AND ac.estado <> 'anulado';

-- 10c. Liquidaciones IR históricas: reclasificar el débito de 2.1.04
--      (pasivo) hacia 6.4.01 (gasto IR del ejercicio)
UPDATE asientos_detalle ad
SET cuenta_id = pc_gasto.id,
    descripcion = ad.descripcion || ' [reclasificado a Gasto IR]'
FROM asientos_contables ac,
     plan_cuentas pc_pasivo,
     plan_cuentas pc_gasto
WHERE ac.id = ad.asiento_id
  AND ac.referencia_tipo = 'ir_anual'
  AND ac.referencia_num NOT LIKE 'PAGO-%'
  AND pc_pasivo.id = ad.cuenta_id
  AND pc_pasivo.codigo = '2.1.04'
  AND pc_gasto.empresa_id = pc_pasivo.empresa_id
  AND pc_gasto.codigo = '6.4.01'
  AND ad.debe > 0;
