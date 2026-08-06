-- ============================================================
-- Corrige el hallazgo CRÍTICO #1B/#1C del reporte de QA (2026-08-05):
--
-- 1) Renombra el estado 'recibida' de compras a 'registrada'. A petición
--    de Deybi: para efectos contables solo importa que la compra esté
--    registrada, no si fue "recibida" físicamente (eso se controla aparte,
--    en el físico). No cambia ningún comportamiento contable, solo el
--    nombre del estado.
--
-- 2) Siembra una caja "Caja General" por defecto para toda empresa nueva
--    (y aquí mismo, para las empresas que ya existen y no tienen ninguna).
--    Los triggers fn_contabilizar_factura / fn_contabilizar_compra YA
--    escriben en movimientos_caja/transacciones_banco cuando existe una
--    cuenta_caja o cuenta_banco activa — lo único que faltaba era que
--    nunca se creaba ninguna caja por defecto, así que no había dónde
--    registrar el efectivo. No hacía falta ninguna tabla ni trigger nuevo.
--
-- 3) Cierra el hueco de atomicidad: hoy, si falla el INSERT de detalle
--    (detalle_facturas / detalle_compras) DESPUÉS de que el encabezado ya
--    se insertó y su trigger AFTER INSERT ya generó y aprobó el asiento
--    contable, el frontend borraba el encabezado pero nunca revertía el
--    asiento — dejando un asiento aprobado en el libro diario sin factura
--    o compra real detrás. La corrección NO reescribe todo el flujo en una
--    transacción nueva: usa el mecanismo de anulación que YA existe
--    (fn_anular_factura_completo / fn_anular_compra_completo), marcando el
--    documento como 'anulada' en vez de borrarlo. Esto además conserva el
--    folio en la secuencia (como exige la DGI para facturas anuladas) en
--    vez de intentar "devolver" el consecutivo, que es una operación con
--    riesgo de condición de carrera entre dos usuarios concurrentes.
-- ============================================================

-- ── 1. Renombrar 'recibida' → 'registrada' en compras ─────────

ALTER TABLE compras DROP CONSTRAINT IF EXISTS compras_estado_check;
ALTER TABLE compras ADD CONSTRAINT compras_estado_check
  CHECK (estado = ANY (ARRAY['borrador'::text, 'registrada'::text, 'parcial'::text, 'pagada'::text, 'anulada'::text]));

UPDATE compras SET estado = 'registrada' WHERE estado = 'recibida';

CREATE OR REPLACE FUNCTION public.fn_contabilizar_compra()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
  IF NEW.estado <> 'registrada' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.estado = 'registrada' THEN RETURN NEW; END IF;
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

      INSERT INTO transacciones_banco(empresa_id,cuenta_banco_id,tipo,monto,descripcion,ref_compra_id,asiento_id,fecha,direccion)
      VALUES(NEW.empresa_id, v_cuenta_banco_id,
        CASE NEW.tipo_pago WHEN 'cheque' THEN 'cheque' WHEN 'tarjeta' THEN 'tarjeta' ELSE 'transferencia' END,
        v_monto_operativo,
        'Pago '||NEW.tipo_pago||' - '||NEW.numero_compra ||
        CASE WHEN v_tasa IS NOT NULL THEN ' (C$' || v_total_a_pagar || ' @ ' || v_tasa || ')' ELSE '' END,
        NEW.id, v_asiento_id, NEW.fecha_compra, 'salida')
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
$function$;

CREATE OR REPLACE FUNCTION public.fn_stock_cambio_estado_compra()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_det RECORD;
  v_stock_antes   NUMERIC;
  v_stock_despues NUMERIC;
  v_signo         NUMERIC;
  v_tipo_mov      TEXT;
  v_nota          TEXT;
BEGIN
  IF OLD.estado = NEW.estado THEN
    RETURN NEW;
  END IF;

  -- Caso A: pendiente/borrador → registrada (suma stock)
  IF NEW.estado = 'registrada' AND OLD.estado IN ('pendiente', 'borrador') THEN
    v_signo   := 1;
    v_tipo_mov := 'entrada';
    v_nota    := 'Registro de compra ' || NEW.numero_compra;

  -- Caso B: registrada → anulada (reversa stock)
  ELSIF NEW.estado = 'anulada' AND OLD.estado = 'registrada' THEN
    v_signo   := -1;
    v_tipo_mov := 'ajuste';
    v_nota    := 'Reversa por anulación de compra ' || NEW.numero_compra;

  ELSE
    RETURN NEW;
  END IF;

  FOR v_det IN
    SELECT producto_id, cantidad, precio_unitario
    FROM detalle_compras
    WHERE compra_id = NEW.id AND producto_id IS NOT NULL
  LOOP
    SELECT stock_actual INTO v_stock_antes
    FROM productos
    WHERE id = v_det.producto_id AND empresa_id = NEW.empresa_id;

    IF NOT FOUND THEN CONTINUE; END IF;

    v_stock_despues := v_stock_antes + (v_signo * v_det.cantidad);

    UPDATE productos
    SET stock_actual = v_stock_despues,
        updated_at   = NOW()
    WHERE id = v_det.producto_id AND empresa_id = NEW.empresa_id;

    INSERT INTO movimientos_inventario (
      empresa_id, producto_id, tipo, cantidad,
      costo_unitario, stock_antes, stock_despues,
      ref_compra_id, referencia, notas
    ) VALUES (
      NEW.empresa_id, v_det.producto_id, v_tipo_mov,
      ABS(v_signo * v_det.cantidad),
      v_det.precio_unitario, v_stock_antes, v_stock_despues,
      NEW.id,
      'CMP-' || NEW.numero_compra,
      v_nota
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_mover_stock_entrada_compra()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_empresa_id     UUID;
  v_estado_compra  TEXT;
  v_stock_antes    NUMERIC;
  v_stock_despues  NUMERIC;
  v_numero_compra  TEXT;
BEGIN
  IF NEW.producto_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT empresa_id, estado, numero_compra
  INTO v_empresa_id, v_estado_compra, v_numero_compra
  FROM compras WHERE id = NEW.compra_id;

  IF v_estado_compra != 'registrada' THEN
    RETURN NEW;
  END IF;

  SELECT stock_actual INTO v_stock_antes
  FROM productos
  WHERE id = NEW.producto_id AND empresa_id = v_empresa_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_stock_despues := v_stock_antes + NEW.cantidad;

  UPDATE productos
  SET stock_actual = v_stock_despues,
      precio_compra = NEW.precio_unitario,
      updated_at    = NOW()
  WHERE id = NEW.producto_id AND empresa_id = v_empresa_id;

  INSERT INTO movimientos_inventario (
    empresa_id, producto_id, tipo, cantidad,
    costo_unitario, stock_antes, stock_despues,
    ref_compra_id, referencia, notas
  ) VALUES (
    v_empresa_id, NEW.producto_id, 'entrada', NEW.cantidad,
    NEW.precio_unitario, v_stock_antes, v_stock_despues,
    NEW.compra_id,
    'CMP-' || v_numero_compra,
    'Entrada por compra ' || v_numero_compra
  );

  RETURN NEW;
END;
$function$;

-- ── 2. Caja General por defecto ────────────────────────────────

-- 2a. Backfill: toda empresa activa que hoy no tenga ninguna cuenta_caja
INSERT INTO cuentas_caja (empresa_id, nombre, tipo, moneda, saldo_inicial, saldo_actual, activa)
SELECT id, 'Caja General', 'caja_general', 'NIO', 0, 0, true
FROM (
  SELECT id FROM empresas_persona_natural
  UNION
  SELECT id FROM empresas_juridicas
) empresas
WHERE NOT EXISTS (
  SELECT 1 FROM cuentas_caja cc WHERE cc.empresa_id = empresas.id
);

-- 2b. A futuro: sembrar la Caja General dentro del mismo seed que ya
-- crea el plan de cuentas de toda empresa nueva.
CREATE OR REPLACE FUNCTION public.fn_seed_plan_cuentas_nueva_empresa()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  eid uuid := NEW.id;
  pid_1 uuid; pid_11 uuid; pid_12 uuid; pid_13 uuid;
  pid_2 uuid; pid_21 uuid; pid_22 uuid;
  pid_3 uuid; pid_31 uuid; pid_32 uuid; pid_33 uuid;
  pid_4 uuid; pid_41 uuid; pid_42 uuid;
  pid_5 uuid; pid_51 uuid;
  pid_6 uuid; pid_61 uuid; pid_62 uuid; pid_63 uuid; pid_64 uuid;
  anio_actual int := EXTRACT(YEAR FROM now())::int;
  mes_actual  int := EXTRACT(MONTH FROM now())::int;
BEGIN
  IF EXISTS (SELECT 1 FROM plan_cuentas WHERE empresa_id = eid) THEN RETURN NEW; END IF;

  -- NIVEL 1
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento) VALUES(eid,'1','ACTIVO','activo','deudora',1,false) RETURNING id INTO pid_1;
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento) VALUES(eid,'2','PASIVO','pasivo','acreedora',1,false) RETURNING id INTO pid_2;
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento) VALUES(eid,'3','PATRIMONIO','patrimonio','acreedora',1,false) RETURNING id INTO pid_3;
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento) VALUES(eid,'4','INGRESOS','ingreso','acreedora',1,false) RETURNING id INTO pid_4;
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento) VALUES(eid,'5','COSTOS','costo','deudora',1,false) RETURNING id INTO pid_5;
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento) VALUES(eid,'6','GASTOS','gasto','deudora',1,false) RETURNING id INTO pid_6;

  -- NIVEL 2
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'1.1','Activo Corriente','activo','deudora',2,false,pid_1) RETURNING id INTO pid_11;
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'1.2','Activo No Corriente','activo','deudora',2,false,pid_1) RETURNING id INTO pid_12;
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'1.3','Activo Diferido','activo','deudora',2,false,pid_1) RETURNING id INTO pid_13;
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'2.1','Pasivo Corriente','pasivo','acreedora',2,false,pid_2) RETURNING id INTO pid_21;
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'2.2','Pasivo No Corriente','pasivo','acreedora',2,false,pid_2) RETURNING id INTO pid_22;
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'3.1','Capital Social','patrimonio','acreedora',2,false,pid_3) RETURNING id INTO pid_31;
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'3.2','Resultados','patrimonio','acreedora',2,false,pid_3) RETURNING id INTO pid_32;
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'3.3','Dividendos','patrimonio','deudora',2,false,pid_3) RETURNING id INTO pid_33;
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'4.1','Ingresos Operacionales','ingreso','acreedora',2,false,pid_4) RETURNING id INTO pid_41;
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'4.2','Ingresos No Operacionales','ingreso','acreedora',2,false,pid_4) RETURNING id INTO pid_42;
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'5.1','Costo de Ventas','costo','deudora',2,false,pid_5) RETURNING id INTO pid_51;
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'6.1','Gastos de Operación','gasto','deudora',2,false,pid_6) RETURNING id INTO pid_61;
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'6.2','Gastos Financieros','gasto','deudora',2,false,pid_6) RETURNING id INTO pid_62;
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'6.3','Gastos No Deducibles','gasto','deudora',2,false,pid_6) RETURNING id INTO pid_63;
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'6.4','Gasto por Impuesto sobre la Renta','gasto','deudora',2,false,pid_6) RETURNING id INTO pid_64;

  -- NIVEL 3 – ACTIVO CORRIENTE
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'1.1.01','Caja General','activo','deudora',3,true,'Efectivo en caja',pid_11);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'1.1.02','Caja Chica','activo','deudora',3,true,pid_11);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'1.1.03','Banco Moneda Nacional','activo','deudora',3,true,'Cuentas bancarias en Córdobas',pid_11);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'1.1.04','Banco Moneda Extranjera','activo','deudora',3,true,'Cuentas bancarias en USD',pid_11);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'1.1.05','Cuentas por Cobrar Clientes','activo','deudora',3,true,'Facturas de crédito pendientes de cobro',pid_11);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'1.1.06','Otras Cuentas por Cobrar','activo','deudora',3,true,pid_11);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'1.1.07','Anticipo a Proveedores','activo','deudora',3,true,pid_11);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'1.1.08','Inventario de Mercancías','activo','deudora',3,true,'Costo de mercancías para venta (LCT art. 44)',pid_11);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'1.1.09','IVA Crédito Fiscal','activo','deudora',3,true,'IVA pagado en compras acreditable contra débito',pid_11);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'1.1.10','IR Pagado por Anticipado','activo','deudora',3,true,'Anticipos IR mensual 1% (LCT art. 63)',pid_11);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'1.1.11','Retenciones IR a Favor','activo','deudora',3,true,'Retenciones en la fuente recibidas de clientes',pid_11);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'1.1.12','Gastos Pagados por Anticipado','activo','deudora',3,true,pid_11);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'1.1.13','Adelantos y Préstamos a Empleados','activo','deudora',3,true,'Adelantos salariales y préstamos recuperados vía planilla',pid_11);

  -- NIVEL 3 – ACTIVO NO CORRIENTE
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'1.2.01','Edificios e Instalaciones','activo','deudora',3,true,'Dep. 5% anual (LCT art. 45 num 1a)',pid_12);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'1.2.02','Equipos de Cómputo y TIC','activo','deudora',3,true,'Dep. 50% anual (LCT art. 45 num 1e)',pid_12);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'1.2.03','Maquinaria y Equipos','activo','deudora',3,true,'Dep. 20% anual (LCT art. 45 num 1c)',pid_12);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'1.2.04','Vehículos','activo','deudora',3,true,'Dep. 20% anual (LCT art. 45 num 1d)',pid_12);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'1.2.05','Mobiliario y Equipo de Oficina','activo','deudora',3,true,'Dep. 20% anual (LCT art. 45 num 1b)',pid_12);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'1.2.06','Terrenos','activo','deudora',3,true,'No depreciable',pid_12);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'1.2.07','Dep. Acum. Edificios','activo','acreedora',3,true,'Cuenta contra-activo (saldo acreedor)',pid_12);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'1.2.08','Dep. Acum. Equipos Cómputo','activo','acreedora',3,true,pid_12);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'1.2.09','Dep. Acum. Maquinaria','activo','acreedora',3,true,pid_12);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'1.2.10','Dep. Acum. Vehículos','activo','acreedora',3,true,pid_12);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'1.2.11','Dep. Acum. Mobiliario','activo','acreedora',3,true,pid_12);

  -- NIVEL 3 – ACTIVO DIFERIDO
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'1.3.01','Gastos de Organización','activo','deudora',3,true,'Amort. 3 años (LCT art. 45 num 6)',pid_13);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'1.3.02','Gastos Pre-operativos','activo','deudora',3,true,'Amort. 3 años (LCT art. 45 num 7)',pid_13);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'1.3.03','Amort. Acum. Diferidos','activo','acreedora',3,true,pid_13);

  -- NIVEL 3 – PASIVO CORRIENTE
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'2.1.01','Cuentas por Pagar Proveedores','pasivo','acreedora',3,true,pid_21);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'2.1.02','Otras Cuentas por Pagar','pasivo','acreedora',3,true,pid_21);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'2.1.03','IVA Débito Fiscal','pasivo','acreedora',3,true,'IVA cobrado en ventas (15%) a pagar DGI',pid_21);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'2.1.04','IR por Pagar (Renta Anual)','pasivo','acreedora',3,true,'Tasa 30% renta neta o 1% ingresos brutos (LCT 52)',pid_21);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'2.1.05','Anticipos IR por Enterar','pasivo','acreedora',3,true,'Pago mínimo definitivo mensual 1%',pid_21);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'2.1.06','Retenciones IR por Enterar','pasivo','acreedora',3,true,'IR 2% retenido a personas naturales proveedores',pid_21);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'2.1.07','INSS Patronal por Pagar','pasivo','acreedora',3,true,'22.5% sobre salario base (Ley 539)',pid_21);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'2.1.08','INSS Laboral por Pagar','pasivo','acreedora',3,true,'7% sobre salario base, retenido al trabajador',pid_21);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'2.1.09','INATEC por Pagar','pasivo','acreedora',3,true,'2% sobre planilla salarial',pid_21);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'2.1.10','Sueldos y Salarios por Pagar','pasivo','acreedora',3,true,pid_21);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'2.1.11','IR Laboral por Enterar','pasivo','acreedora',3,true,'IR retenido a trabajadores (tabla progresiva art. 23)',pid_21);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'2.1.12','Vacaciones por Pagar','pasivo','acreedora',3,true,'Provisión vacaciones 8.33% mensual',pid_21);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'2.1.13','Aguinaldo por Pagar','pasivo','acreedora',3,true,'Provisión aguinaldo 8.33% mensual',pid_21);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'2.1.14','Indemnización por Pagar','pasivo','acreedora',3,true,'Provisión indemnización 8.33% mensual',pid_21);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'2.1.15','IMI por Pagar (Alcaldía)','pasivo','acreedora',3,true,'1% ingresos brutos mensual (Plan de Arbitrios)',pid_21);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'2.1.16','Préstamos Bancarios C/P','pasivo','acreedora',3,true,pid_21);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'2.1.17','Anticipo de Clientes','pasivo','acreedora',3,true,pid_21);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'2.1.18','ISC por Pagar','pasivo','acreedora',3,true,'Impuesto Selectivo al Consumo por enterar a la DGI',pid_21);

  -- NIVEL 3 – PASIVO NO CORRIENTE
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'2.2.01','Préstamos Bancarios L/P','pasivo','acreedora',3,true,pid_22);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'2.2.02','Otras Deudas a Largo Plazo','pasivo','acreedora',3,true,pid_22);

  -- NIVEL 3 – PATRIMONIO
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'3.1.01','Capital Aportado','patrimonio','acreedora',3,true,pid_31);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'3.1.02','Reserva Legal','patrimonio','acreedora',3,true,'10% de utilidad neta (Código Mercantil)',pid_31);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'3.1.03','Balance de Apertura de Inventario','patrimonio','acreedora',3,true,'Contrapartida del inventario inicial cargado al crear productos con stock — no es capital aportado en efectivo',pid_31);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'3.2.01','Utilidades Retenidas','patrimonio','acreedora',3,true,pid_32);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'3.2.02','Pérdidas Acumuladas','patrimonio','deudora',3,true,pid_32);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'3.2.03','Utilidad/Pérdida del Ejercicio','patrimonio','acreedora',3,true,'Se cierra al final del período fiscal',pid_32);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'3.3.01','Dividendos Decretados','patrimonio','deudora',3,true,'Ret. definitiva 10% (LCT art. 87)',pid_33);

  -- NIVEL 3 – INGRESOS
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'4.1.01','Ventas de Bienes','ingreso','acreedora',3,true,'Ventas gravadas con IVA 15%',pid_41);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'4.1.02','Ventas de Servicios','ingreso','acreedora',3,true,pid_41);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'4.1.03','Ventas Exentas de IVA','ingreso','acreedora',3,true,'Canasta básica y otros exentos (LCT art. 127)',pid_41);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'4.1.04','Devoluciones en Ventas','ingreso','deudora',3,true,'Nota de crédito — contra ingreso',pid_41);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'4.1.05','Descuentos en Ventas','ingreso','deudora',3,true,pid_41);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'4.2.01','Ingresos Financieros','ingreso','acreedora',3,true,pid_42);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'4.2.02','Utilidad en Venta de Activos','ingreso','acreedora',3,true,pid_42);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'4.2.03','Otros Ingresos','ingreso','acreedora',3,true,pid_42);

  -- NIVEL 3 – COSTOS
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'5.1.01','Costo de Mercancías Vendidas','costo','deudora',3,true,'Costo de inventario dado de baja por venta',pid_51);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'5.1.02','Compras de Mercancías','costo','deudora',3,true,pid_51);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'5.1.03','Devoluciones en Compras','costo','acreedora',3,true,pid_51);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'5.1.04','Fletes sobre Compras','costo','deudora',3,true,pid_51);

  -- NIVEL 3 – GASTOS DE OPERACIÓN
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'6.1.01','Sueldos y Salarios','gasto','deudora',3,true,pid_61);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'6.1.02','INSS Patronal','gasto','deudora',3,true,'22.5% sobre planilla – deducible IR (LCT art. 39)',pid_61);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'6.1.03','INATEC','gasto','deudora',3,true,'2% sobre planilla – deducible IR',pid_61);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'6.1.04','Vacaciones','gasto','deudora',3,true,pid_61);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'6.1.05','Aguinaldo','gasto','deudora',3,true,pid_61);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'6.1.06','Indemnización','gasto','deudora',3,true,pid_61);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'6.1.07','Alquileres','gasto','deudora',3,true,pid_61);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'6.1.08','Servicios Básicos','gasto','deudora',3,true,'Agua, luz, teléfono, internet',pid_61);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'6.1.09','Publicidad y Mercadeo','gasto','deudora',3,true,pid_61);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'6.1.10','Materiales y Suministros','gasto','deudora',3,true,pid_61);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'6.1.11','Gastos de Transporte','gasto','deudora',3,true,pid_61);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'6.1.12','Mantenimiento y Reparaciones','gasto','deudora',3,true,pid_61);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'6.1.13','Gastos Legales y Notariales','gasto','deudora',3,true,pid_61);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'6.1.14','Honorarios Profesionales','gasto','deudora',3,true,'Sujeto a retención IR 10% persona natural',pid_61);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'6.1.15','Seguros','gasto','deudora',3,true,pid_61);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'6.1.16','Depreciación del Ejercicio','gasto','deudora',3,true,'Dep. anual según art. 45 LCT',pid_61);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'6.1.17','Amortización del Ejercicio','gasto','deudora',3,true,pid_61);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'6.1.18','IMI – Impuesto Municipal','gasto','deudora',3,true,'1% ingresos brutos – deducible IR parcialmente',pid_61);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'6.1.19','Comisiones y Gastos Bancarios','gasto','deudora',3,true,pid_61);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'6.1.20','Gastos de Viaje y Viáticos','gasto','deudora',3,true,pid_61);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'6.1.21','ISC – Impuesto Selectivo al Consumo','gasto','deudora',3,true,'ISC no acreditable (LCT arts. 149 y ss.)',pid_61);

  -- NIVEL 3 – GASTOS FINANCIEROS
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'6.2.01','Intereses Bancarios','gasto','deudora',3,true,'Deducible hasta 1.5x tasa prom BCN (LCT art. 48)',pid_62);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'6.2.02','Pérdida Cambiaria','gasto','deudora',3,true,pid_62);

  -- NIVEL 3 – GASTOS NO DEDUCIBLES
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'6.3.01','Multas y Recargos DGI','gasto','deudora',3,true,'No deducibles del IR (LCT art. 43)',pid_63);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'6.3.02','Gastos Personales','gasto','deudora',3,true,'No deducibles del IR',pid_63);
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,padre_id) VALUES(eid,'6.3.03','Otros Gastos No Deducibles','gasto','deudora',3,true,pid_63);

  -- NIVEL 3 – GASTO POR IR
  INSERT INTO plan_cuentas(empresa_id,codigo,nombre,tipo,naturaleza,nivel,permite_movimiento,descripcion,padre_id) VALUES(eid,'6.4.01','IR del Ejercicio','gasto','deudora',3,true,'Gasto por IR anual reconocido en la liquidación F-106',pid_64);

  -- Período contable del mes actual
  INSERT INTO periodos_contables(empresa_id, anio, mes, estado, nombre, fecha_inicio, fecha_fin)
  VALUES(
    eid, anio_actual, mes_actual, 'abierto',
    'Período ' || anio_actual || '-' || LPAD(mes_actual::text, 2, '0'),
    DATE_TRUNC('month', now())::date,
    (DATE_TRUNC('month', now()) + INTERVAL '1 month - 1 day')::date
  )
  ON CONFLICT DO NOTHING;

  -- Caja General operativa por defecto (módulo Caja y Bancos) — sin esto,
  -- los triggers de facturación/compras no tienen dónde registrar el
  -- efectivo y "Caja y Bancos" queda desconectado (hallazgo CRÍTICO 1C).
  INSERT INTO cuentas_caja (empresa_id, nombre, tipo, moneda, saldo_inicial, saldo_actual, activa)
  VALUES (eid, 'Caja General', 'caja_general', 'NIO', 0, 0, true)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$function$;

-- ── 3. Cuenta patrimonial para saldo de apertura de inventario ──
-- (backfill para empresas existentes; las nuevas ya la reciben arriba)
INSERT INTO plan_cuentas (empresa_id, codigo, nombre, tipo, naturaleza, nivel, permite_movimiento, descripcion, padre_id)
SELECT
  pc31.empresa_id, '3.1.03', 'Balance de Apertura de Inventario', 'patrimonio', 'acreedora', 3, true,
  'Contrapartida del inventario inicial cargado al crear productos con stock — no es capital aportado en efectivo',
  pc31.id
FROM plan_cuentas pc31
WHERE pc31.codigo = '3.1'
  AND NOT EXISTS (
    SELECT 1 FROM plan_cuentas x WHERE x.empresa_id = pc31.empresa_id AND x.codigo = '3.1.03'
  );
