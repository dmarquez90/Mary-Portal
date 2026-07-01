
-- Drop función vieja (retornaba TEXT, ahora retorna JSONB)
DROP FUNCTION IF EXISTS cerrar_periodo_contable(uuid, uuid);

-- ============================================================
-- PARTE 1: FUNCIÓN — encontrar período activo por fecha
-- ============================================================
CREATE OR REPLACE FUNCTION get_periodo_activo(p_empresa_id UUID, p_fecha DATE)
RETURNS UUID AS $$
DECLARE v_id UUID;
BEGIN
  SELECT id INTO v_id
  FROM periodos_contables
  WHERE empresa_id = p_empresa_id
    AND p_fecha BETWEEN fecha_inicio AND fecha_fin
    AND bloqueado = false
  ORDER BY fecha_inicio DESC
  LIMIT 1;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================
-- PARTE 2A: TRIGGER — asignar periodo_id al insertar asiento
-- ============================================================
CREATE OR REPLACE FUNCTION fn_asignar_periodo_asiento()
RETURNS TRIGGER AS $$
DECLARE v_periodo_id UUID;
BEGIN
  IF NEW.periodo_id IS NULL THEN
    SELECT id INTO v_periodo_id
    FROM periodos_contables
    WHERE empresa_id = NEW.empresa_id
      AND NEW.fecha BETWEEN fecha_inicio AND fecha_fin
    ORDER BY bloqueado ASC, fecha_inicio DESC
    LIMIT 1;
    NEW.periodo_id := v_periodo_id;
    IF NEW.periodo_anio IS NULL THEN NEW.periodo_anio := EXTRACT(YEAR  FROM NEW.fecha)::INT; END IF;
    IF NEW.periodo_mes  IS NULL THEN NEW.periodo_mes  := EXTRACT(MONTH FROM NEW.fecha)::INT; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_asignar_periodo ON asientos_contables;
CREATE TRIGGER trg_asignar_periodo
  BEFORE INSERT ON asientos_contables
  FOR EACH ROW EXECUTE FUNCTION fn_asignar_periodo_asiento();

-- ============================================================
-- PARTE 2B: TRIGGER — bloquear asientos en períodos cerrados
-- ============================================================
CREATE OR REPLACE FUNCTION fn_bloquear_periodo_cerrado()
RETURNS TRIGGER AS $$
DECLARE v_bloqueado BOOLEAN;
BEGIN
  IF NEW.periodo_id IS NOT NULL THEN
    SELECT bloqueado INTO v_bloqueado
    FROM periodos_contables WHERE id = NEW.periodo_id;
    IF v_bloqueado = true THEN
      RAISE EXCEPTION 'PERIODO_BLOQUEADO: El período contable está cerrado. Use un asiento de ajuste en el período actual.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bloquear_periodo ON asientos_contables;
CREATE TRIGGER trg_bloquear_periodo
  BEFORE INSERT OR UPDATE ON asientos_contables
  FOR EACH ROW EXECUTE FUNCTION fn_bloquear_periodo_cerrado();

-- ============================================================
-- PARTE 3: FUNCIÓN PRINCIPAL DE CIERRE CONTABLE
-- ============================================================
CREATE OR REPLACE FUNCTION cerrar_periodo_contable(
  p_periodo_id UUID,
  p_user_id    UUID
)
RETURNS JSONB AS $$
DECLARE
  v_periodo          periodos_contables%ROWTYPE;
  v_pendientes       INT;
  v_total_ingresos   NUMERIC := 0;
  v_total_costos     NUMERIC := 0;
  v_total_gastos     NUMERIC := 0;
  v_utilidad         NUMERIC := 0;
  v_asiento_id       UUID := NULL;
  v_num_asiento      INT;
  v_num_str          TEXT;
  r                  RECORD;
  v_siguiente_inicio DATE;
  v_siguiente_fin    DATE;
  v_siguiente_anio   INT;
  v_siguiente_mes    INT;
  v_siguiente_nombre TEXT;
  v_siguiente_existe INT;
  v_cta_utilidad_id  UUID;
BEGIN
  -- ── PASO 0: Cargar período ──────────────────────────────────
  SELECT * INTO v_periodo FROM periodos_contables WHERE id = p_periodo_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Período no encontrado');
  END IF;
  IF v_periodo.bloqueado THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El período ya está cerrado');
  END IF;

  -- ── PASO 1: Asientos en borrador ───────────────────────────
  SELECT COUNT(*) INTO v_pendientes
  FROM asientos_contables
  WHERE empresa_id = v_periodo.empresa_id
    AND periodo_id = p_periodo_id
    AND estado     = 'borrador';
  IF v_pendientes > 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'Existen ' || v_pendientes || ' asiento(s) en borrador pendientes de aprobar.',
      'pendientes', v_pendientes
    );
  END IF;

  -- ── PASO 2: Calcular saldos de cuentas de resultado ─────────
  SELECT COALESCE(SUM(d.haber - d.debe), 0) INTO v_total_ingresos
  FROM plan_cuentas pc
  JOIN asientos_detalle d ON d.cuenta_id = pc.id
  JOIN asientos_contables a ON a.id = d.asiento_id
  WHERE pc.empresa_id = v_periodo.empresa_id
    AND pc.tipo = 'ingreso'
    AND pc.permite_movimiento = true
    AND a.empresa_id = v_periodo.empresa_id
    AND a.periodo_id = p_periodo_id
    AND a.estado    != 'anulado';

  SELECT COALESCE(SUM(d.debe - d.haber), 0) INTO v_total_costos
  FROM plan_cuentas pc
  JOIN asientos_detalle d ON d.cuenta_id = pc.id
  JOIN asientos_contables a ON a.id = d.asiento_id
  WHERE pc.empresa_id = v_periodo.empresa_id
    AND pc.tipo = 'costo'
    AND pc.permite_movimiento = true
    AND a.empresa_id = v_periodo.empresa_id
    AND a.periodo_id = p_periodo_id
    AND a.estado    != 'anulado';

  SELECT COALESCE(SUM(d.debe - d.haber), 0) INTO v_total_gastos
  FROM plan_cuentas pc
  JOIN asientos_detalle d ON d.cuenta_id = pc.id
  JOIN asientos_contables a ON a.id = d.asiento_id
  WHERE pc.empresa_id = v_periodo.empresa_id
    AND pc.tipo = 'gasto'
    AND pc.permite_movimiento = true
    AND a.empresa_id = v_periodo.empresa_id
    AND a.periodo_id = p_periodo_id
    AND a.estado    != 'anulado';

  v_utilidad := ROUND(v_total_ingresos - v_total_costos - v_total_gastos, 2);

  -- ── PASO 3: Asiento de cierre (si hay movimientos) ──────────
  IF v_total_ingresos != 0 OR v_total_costos != 0 OR v_total_gastos != 0 THEN

    SELECT id INTO v_cta_utilidad_id
    FROM plan_cuentas
    WHERE empresa_id = v_periodo.empresa_id AND codigo = '3.2.03' LIMIT 1;

    IF v_cta_utilidad_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Cuenta 3.2.03 Utilidad/Pérdida del Ejercicio no encontrada en el plan de cuentas');
    END IF;

    SELECT COALESCE(MAX(numero), 0) + 1 INTO v_num_asiento
    FROM asientos_contables
    WHERE empresa_id   = v_periodo.empresa_id
      AND periodo_anio = v_periodo.anio
      AND periodo_mes  = v_periodo.mes;

    v_num_str := 'AST-' || LPAD(v_periodo.anio::TEXT,4,'0') || '-' ||
                 LPAD(v_periodo.mes::TEXT,2,'0') || '-' ||
                 LPAD(v_num_asiento::TEXT,4,'0');

    -- Insertar cabecera sin disparar el trigger de bloqueo
    -- (período aún abierto en este punto)
    INSERT INTO asientos_contables (
      empresa_id, periodo_id, fecha, descripcion, concepto,
      tipo, referencia_tipo, referencia_id, referencia_num,
      numero_asiento, numero, periodo_anio, periodo_mes,
      estado, total_debe, total_haber
    ) VALUES (
      v_periodo.empresa_id, p_periodo_id,
      v_periodo.fecha_fin,
      'Asiento de cierre — ' || v_periodo.nombre,
      'Cierre de cuentas de resultado ' || v_periodo.nombre,
      'cierre', 'periodo', p_periodo_id,
      'CIERRE-' || v_periodo.anio || '-' || LPAD(v_periodo.mes::TEXT,2,'0'),
      v_num_str, v_num_asiento,
      v_periodo.anio, v_periodo.mes,
      'aprobado', 0, 0
    ) RETURNING id INTO v_asiento_id;

    -- Líneas DÉBITO: saldar ingresos (naturaleza CR → debitar para cerrar)
    FOR r IN
      SELECT pc.id AS cuenta_id, pc.codigo, pc.nombre,
             ROUND(COALESCE(SUM(d.haber - d.debe), 0), 2) AS saldo
      FROM plan_cuentas pc
      JOIN asientos_detalle d ON d.cuenta_id = pc.id
      JOIN asientos_contables a ON a.id = d.asiento_id
      WHERE pc.empresa_id = v_periodo.empresa_id
        AND pc.tipo = 'ingreso' AND pc.permite_movimiento = true
        AND a.empresa_id = v_periodo.empresa_id
        AND a.periodo_id = p_periodo_id AND a.estado != 'anulado'
      GROUP BY pc.id, pc.codigo, pc.nombre
      HAVING ROUND(COALESCE(SUM(d.haber - d.debe), 0), 2) != 0
      ORDER BY pc.codigo
    LOOP
      INSERT INTO asientos_detalle (asiento_id, empresa_id, cuenta_id, descripcion, debe, haber, orden)
      VALUES (v_asiento_id, v_periodo.empresa_id, r.cuenta_id,
              'Cierre ' || r.codigo || ' ' || r.nombre, r.saldo, 0,
              CAST(REPLACE(r.codigo, '.', '') AS INT));
    END LOOP;

    -- Líneas CRÉDITO: saldar costos (naturaleza DB → acreditar para cerrar)
    FOR r IN
      SELECT pc.id AS cuenta_id, pc.codigo, pc.nombre,
             ROUND(COALESCE(SUM(d.debe - d.haber), 0), 2) AS saldo
      FROM plan_cuentas pc
      JOIN asientos_detalle d ON d.cuenta_id = pc.id
      JOIN asientos_contables a ON a.id = d.asiento_id
      WHERE pc.empresa_id = v_periodo.empresa_id
        AND pc.tipo = 'costo' AND pc.permite_movimiento = true
        AND a.empresa_id = v_periodo.empresa_id
        AND a.periodo_id = p_periodo_id AND a.estado != 'anulado'
      GROUP BY pc.id, pc.codigo, pc.nombre
      HAVING ROUND(COALESCE(SUM(d.debe - d.haber), 0), 2) != 0
      ORDER BY pc.codigo
    LOOP
      INSERT INTO asientos_detalle (asiento_id, empresa_id, cuenta_id, descripcion, debe, haber, orden)
      VALUES (v_asiento_id, v_periodo.empresa_id, r.cuenta_id,
              'Cierre ' || r.codigo || ' ' || r.nombre, 0, r.saldo,
              CAST(REPLACE(r.codigo, '.', '') AS INT) + 10000);
    END LOOP;

    -- Líneas CRÉDITO: saldar gastos (naturaleza DB → acreditar para cerrar)
    FOR r IN
      SELECT pc.id AS cuenta_id, pc.codigo, pc.nombre,
             ROUND(COALESCE(SUM(d.debe - d.haber), 0), 2) AS saldo
      FROM plan_cuentas pc
      JOIN asientos_detalle d ON d.cuenta_id = pc.id
      JOIN asientos_contables a ON a.id = d.asiento_id
      WHERE pc.empresa_id = v_periodo.empresa_id
        AND pc.tipo = 'gasto' AND pc.permite_movimiento = true
        AND a.empresa_id = v_periodo.empresa_id
        AND a.periodo_id = p_periodo_id AND a.estado != 'anulado'
      GROUP BY pc.id, pc.codigo, pc.nombre
      HAVING ROUND(COALESCE(SUM(d.debe - d.haber), 0), 2) != 0
      ORDER BY pc.codigo
    LOOP
      INSERT INTO asientos_detalle (asiento_id, empresa_id, cuenta_id, descripcion, debe, haber, orden)
      VALUES (v_asiento_id, v_periodo.empresa_id, r.cuenta_id,
              'Cierre ' || r.codigo || ' ' || r.nombre, 0, r.saldo,
              CAST(REPLACE(r.codigo, '.', '') AS INT) + 20000);
    END LOOP;

    -- Línea de resultado neto → 3.2.03
    IF v_utilidad > 0 THEN
      -- Ganancia: crédito patrimonial
      INSERT INTO asientos_detalle (asiento_id, empresa_id, cuenta_id, descripcion, debe, haber, orden)
      VALUES (v_asiento_id, v_periodo.empresa_id, v_cta_utilidad_id,
              'Utilidad neta del período — ' || v_periodo.nombre, 0, v_utilidad, 99999);
    ELSIF v_utilidad < 0 THEN
      -- Pérdida: débito patrimonial
      INSERT INTO asientos_detalle (asiento_id, empresa_id, cuenta_id, descripcion, debe, haber, orden)
      VALUES (v_asiento_id, v_periodo.empresa_id, v_cta_utilidad_id,
              'Pérdida neta del período — ' || v_periodo.nombre, ABS(v_utilidad), 0, 99999);
    END IF;

    -- Actualizar totales reales del asiento
    UPDATE asientos_contables SET
      total_debe  = (SELECT ROUND(SUM(debe),  2) FROM asientos_detalle WHERE asiento_id = v_asiento_id),
      total_haber = (SELECT ROUND(SUM(haber), 2) FROM asientos_detalle WHERE asiento_id = v_asiento_id)
    WHERE id = v_asiento_id;

  END IF;

  -- ── PASO 4: Bloquear el período ─────────────────────────────
  UPDATE periodos_contables SET
    estado            = 'cerrado',
    bloqueado         = true,
    fecha_cierre      = CURRENT_DATE,
    cerrado_por       = p_user_id,
    asiento_cierre_id = v_asiento_id
  WHERE id = p_periodo_id;

  -- ── PASO 5: Crear período siguiente ─────────────────────────
  v_siguiente_mes  := v_periodo.mes + 1;
  v_siguiente_anio := v_periodo.anio;
  IF v_siguiente_mes > 12 THEN
    v_siguiente_mes  := 1;
    v_siguiente_anio := v_siguiente_anio + 1;
  END IF;

  v_siguiente_inicio := (v_siguiente_anio || '-' || LPAD(v_siguiente_mes::TEXT,2,'0') || '-01')::DATE;
  v_siguiente_fin    := (DATE_TRUNC('month', v_siguiente_inicio) + INTERVAL '1 month - 1 day')::DATE;
  v_siguiente_nombre := 'Período ' || v_siguiente_anio || '-' || LPAD(v_siguiente_mes::TEXT,2,'0');

  SELECT COUNT(*) INTO v_siguiente_existe
  FROM periodos_contables
  WHERE empresa_id = v_periodo.empresa_id
    AND anio = v_siguiente_anio AND mes = v_siguiente_mes;

  IF v_siguiente_existe = 0 THEN
    INSERT INTO periodos_contables (
      empresa_id, nombre, fecha_inicio, fecha_fin,
      estado, anio, mes, bloqueado
    ) VALUES (
      v_periodo.empresa_id, v_siguiente_nombre,
      v_siguiente_inicio, v_siguiente_fin,
      'abierto', v_siguiente_anio, v_siguiente_mes, false
    );
  END IF;

  RETURN jsonb_build_object(
    'ok',                true,
    'periodo_cerrado',   v_periodo.nombre,
    'fecha_cierre',      CURRENT_DATE::TEXT,
    'total_ingresos',    v_total_ingresos,
    'total_costos',      v_total_costos,
    'total_gastos',      v_total_gastos,
    'utilidad_neta',     v_utilidad,
    'asiento_cierre_id', COALESCE(v_asiento_id::TEXT, 'sin movimientos'),
    'periodo_siguiente', v_siguiente_nombre,
    'mensaje',           'Período ' || v_periodo.nombre || ' cerrado. Resultado: C$ ' ||
                         v_utilidad::TEXT || '. Período siguiente: ' || v_siguiente_nombre || ' creado.'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- PARTE 5: RETROACTIVO — vincular asientos existentes
-- ============================================================
UPDATE asientos_contables
SET periodo_id = '4a7b5fc4-327b-422e-923b-13f25663132c'
WHERE empresa_id = '1c71f63d-3979-4639-a81c-7e6df095841d'
  AND periodo_id IS NULL
  AND fecha BETWEEN '2026-06-01' AND '2026-06-30';
