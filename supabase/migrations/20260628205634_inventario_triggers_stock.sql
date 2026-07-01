
-- ============================================================
-- MIGRACIÓN 2: Triggers de inventario + validación de stock
-- ============================================================

-- ─────────────────────────────────────────────
-- TRIGGER 1: BEFORE INSERT en detalle_facturas
-- Valida que haya stock suficiente antes de vender
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_validar_stock_factura()
RETURNS TRIGGER AS $$
DECLARE
  v_stock_actual NUMERIC;
  v_nombre_producto TEXT;
  v_empresa_id UUID;
BEGIN
  -- Solo valida si el producto no es NULL (puede ser servicio/descripción libre)
  IF NEW.producto_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Obtener empresa_id desde la factura
  SELECT empresa_id INTO v_empresa_id
  FROM facturas WHERE id = NEW.factura_id;

  -- Obtener stock actual y nombre del producto
  SELECT stock_actual, nombre
  INTO v_stock_actual, v_nombre_producto
  FROM productos
  WHERE id = NEW.producto_id AND empresa_id = v_empresa_id;

  -- Si no se encontró el producto, dejar pasar (trigger de contabilidad lo manejará)
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Validar stock suficiente
  IF v_stock_actual < NEW.cantidad THEN
    RAISE EXCEPTION 'Stock insuficiente para "%". Disponible: % | Solicitado: %',
      v_nombre_producto,
      ROUND(v_stock_actual, 2),
      ROUND(NEW.cantidad, 2);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validar_stock_factura ON detalle_facturas;
CREATE TRIGGER trg_validar_stock_factura
  BEFORE INSERT ON detalle_facturas
  FOR EACH ROW
  EXECUTE FUNCTION fn_validar_stock_factura();


-- ─────────────────────────────────────────────
-- TRIGGER 2: AFTER INSERT en detalle_facturas
-- Descuenta stock_actual y registra movimiento de salida
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_mover_stock_salida()
RETURNS TRIGGER AS $$
DECLARE
  v_empresa_id    UUID;
  v_stock_antes   NUMERIC;
  v_stock_despues NUMERIC;
  v_numero_factura TEXT;
BEGIN
  -- Solo actúa si hay producto vinculado
  IF NEW.producto_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Obtener empresa_id y numero de factura
  SELECT empresa_id, numero_factura
  INTO v_empresa_id, v_numero_factura
  FROM facturas WHERE id = NEW.factura_id;

  -- Obtener stock antes
  SELECT stock_actual INTO v_stock_antes
  FROM productos
  WHERE id = NEW.producto_id AND empresa_id = v_empresa_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_stock_despues := v_stock_antes - NEW.cantidad;

  -- Actualizar stock_actual en productos
  UPDATE productos
  SET stock_actual = v_stock_despues,
      updated_at   = NOW()
  WHERE id = NEW.producto_id AND empresa_id = v_empresa_id;

  -- Registrar movimiento de inventario
  INSERT INTO movimientos_inventario (
    empresa_id, producto_id, tipo, cantidad,
    costo_unitario, stock_antes, stock_despues,
    ref_factura_id, referencia, notas
  ) VALUES (
    v_empresa_id, NEW.producto_id, 'salida', NEW.cantidad,
    NEW.precio_unitario, v_stock_antes, v_stock_despues,
    NEW.factura_id,
    'FAC-' || v_numero_factura,
    'Venta registrada por factura ' || v_numero_factura
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mover_stock_salida ON detalle_facturas;
CREATE TRIGGER trg_mover_stock_salida
  AFTER INSERT ON detalle_facturas
  FOR EACH ROW
  EXECUTE FUNCTION fn_mover_stock_salida();


-- ─────────────────────────────────────────────
-- TRIGGER 3: AFTER INSERT en detalle_compras
-- Suma stock_actual cuando la compra ya llega como 'recibida'
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_mover_stock_entrada_compra()
RETURNS TRIGGER AS $$
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

  -- Obtener estado y datos de la compra
  SELECT empresa_id, estado, numero_compra
  INTO v_empresa_id, v_estado_compra, v_numero_compra
  FROM compras WHERE id = NEW.compra_id;

  -- Solo procesa si la compra está en estado 'recibida'
  IF v_estado_compra != 'recibida' THEN
    RETURN NEW;
  END IF;

  -- Obtener stock antes
  SELECT stock_actual INTO v_stock_antes
  FROM productos
  WHERE id = NEW.producto_id AND empresa_id = v_empresa_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_stock_despues := v_stock_antes + NEW.cantidad;

  -- Actualizar stock
  UPDATE productos
  SET stock_actual = v_stock_despues,
      precio_compra = NEW.precio_unitario,  -- actualiza último costo
      updated_at    = NOW()
  WHERE id = NEW.producto_id AND empresa_id = v_empresa_id;

  -- Registrar movimiento de entrada
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
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_mover_stock_entrada_compra ON detalle_compras;
CREATE TRIGGER trg_mover_stock_entrada_compra
  AFTER INSERT ON detalle_compras
  FOR EACH ROW
  EXECUTE FUNCTION fn_mover_stock_entrada_compra();


-- ─────────────────────────────────────────────
-- TRIGGER 4: AFTER UPDATE en compras
-- Maneja recepción tardía (pendiente → recibida)
-- y anulación (recibida → anulada): reversa el stock
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_stock_cambio_estado_compra()
RETURNS TRIGGER AS $$
DECLARE
  v_det RECORD;
  v_stock_antes   NUMERIC;
  v_stock_despues NUMERIC;
  v_signo         NUMERIC;
  v_tipo_mov      TEXT;
  v_nota          TEXT;
BEGIN
  -- Solo actúa cuando cambia el estado
  IF OLD.estado = NEW.estado THEN
    RETURN NEW;
  END IF;

  -- Caso A: pendiente/borrador → recibida (suma stock)
  IF NEW.estado = 'recibida' AND OLD.estado IN ('pendiente', 'borrador') THEN
    v_signo   := 1;
    v_tipo_mov := 'entrada';
    v_nota    := 'Recepción de compra ' || NEW.numero_compra;

  -- Caso B: recibida → anulada (reversa stock)
  ELSIF NEW.estado = 'anulada' AND OLD.estado = 'recibida' THEN
    v_signo   := -1;
    v_tipo_mov := 'ajuste';
    v_nota    := 'Reversa por anulación de compra ' || NEW.numero_compra;

  ELSE
    -- Otro cambio de estado no relevante para inventario
    RETURN NEW;
  END IF;

  -- Iterar sobre los detalles de la compra
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
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_stock_cambio_estado_compra ON compras;
CREATE TRIGGER trg_stock_cambio_estado_compra
  AFTER UPDATE OF estado ON compras
  FOR EACH ROW
  EXECUTE FUNCTION fn_stock_cambio_estado_compra();
