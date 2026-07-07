-- ============================================================
-- Nómina: RLS por permiso (espejo de matriz_permisos_seed)
--
-- Antes, las tablas de nómina usaban la política genérica "own_empresa"
-- (cualquier miembro de la empresa), por lo que un usuario con rol
-- ventas o cajero podía leer y modificar salarios, planillas e IR
-- consultando la API/PostgREST directamente, aunque la matriz de
-- permisos dice que nómina es solo-admin (nomina_ver / nomina_editar).
--
-- Diseño:
--  * Detalle por empleado (empleados, planilla_detalle, ir_laboral_acumulado,
--    prestaciones_sociales, liquidaciones, historial_salarial):
--      SELECT  -> nomina_ver
--      escribir-> nomina_editar
--  * planillas (encabezados con totales agregados):
--      SELECT  -> nomina_ver O reportes_dgi_ver
--      (IR Anual F106 suma gastos de nómina desde planillas; el contador
--       ve totales sin detalle por empleado — ver nota en permissions.ts)
--      escribir-> nomina_editar
--  * cargos (catálogo de puestos, no sensible):
--      SELECT  -> cualquier miembro de la empresa
--      escribir-> nomina_editar
-- ============================================================

-- ── Tablas con detalle por empleado ──────────────────────────
DO $mig$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'empleados',
    'planilla_detalle',
    'ir_laboral_acumulado',
    'prestaciones_sociales',
    'liquidaciones',
    'historial_salarial'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "own_empresa" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "nomina_select" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "nomina_insert" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "nomina_update" ON %I', t);
    EXECUTE format('DROP POLICY IF EXISTS "nomina_delete" ON %I', t);

    EXECUTE format(
      'CREATE POLICY "nomina_select" ON %I FOR SELECT
         USING (fn_tiene_permiso(auth.uid(), empresa_id, ''nomina_ver''))', t);
    EXECUTE format(
      'CREATE POLICY "nomina_insert" ON %I FOR INSERT
         WITH CHECK (fn_tiene_permiso(auth.uid(), empresa_id, ''nomina_editar''))', t);
    EXECUTE format(
      'CREATE POLICY "nomina_update" ON %I FOR UPDATE
         USING (fn_tiene_permiso(auth.uid(), empresa_id, ''nomina_editar''))
         WITH CHECK (fn_tiene_permiso(auth.uid(), empresa_id, ''nomina_editar''))', t);
    EXECUTE format(
      'CREATE POLICY "nomina_delete" ON %I FOR DELETE
         USING (fn_tiene_permiso(auth.uid(), empresa_id, ''nomina_editar''))', t);
  END LOOP;
END
$mig$;

-- ── planillas: totales visibles también para reportes DGI ────
DROP POLICY IF EXISTS "own_empresa"    ON planillas;
DROP POLICY IF EXISTS "nomina_select"  ON planillas;
DROP POLICY IF EXISTS "nomina_insert"  ON planillas;
DROP POLICY IF EXISTS "nomina_update"  ON planillas;
DROP POLICY IF EXISTS "nomina_delete"  ON planillas;

CREATE POLICY "nomina_select" ON planillas FOR SELECT
  USING (
    fn_tiene_permiso(auth.uid(), empresa_id, 'nomina_ver')
    OR fn_tiene_permiso(auth.uid(), empresa_id, 'reportes_dgi_ver')
  );
CREATE POLICY "nomina_insert" ON planillas FOR INSERT
  WITH CHECK (fn_tiene_permiso(auth.uid(), empresa_id, 'nomina_editar'));
CREATE POLICY "nomina_update" ON planillas FOR UPDATE
  USING (fn_tiene_permiso(auth.uid(), empresa_id, 'nomina_editar'))
  WITH CHECK (fn_tiene_permiso(auth.uid(), empresa_id, 'nomina_editar'));
CREATE POLICY "nomina_delete" ON planillas FOR DELETE
  USING (fn_tiene_permiso(auth.uid(), empresa_id, 'nomina_editar'));

-- ── cargos: catálogo no sensible, lectura para miembros ──────
DROP POLICY IF EXISTS "own_empresa"    ON cargos;
DROP POLICY IF EXISTS "cargos_select"  ON cargos;
DROP POLICY IF EXISTS "cargos_insert"  ON cargos;
DROP POLICY IF EXISTS "cargos_update"  ON cargos;
DROP POLICY IF EXISTS "cargos_delete"  ON cargos;

CREATE POLICY "cargos_select" ON cargos FOR SELECT
  USING (empresa_id = ANY(get_empresa_ids()));
CREATE POLICY "cargos_insert" ON cargos FOR INSERT
  WITH CHECK (fn_tiene_permiso(auth.uid(), empresa_id, 'nomina_editar'));
CREATE POLICY "cargos_update" ON cargos FOR UPDATE
  USING (fn_tiene_permiso(auth.uid(), empresa_id, 'nomina_editar'))
  WITH CHECK (fn_tiene_permiso(auth.uid(), empresa_id, 'nomina_editar'));
CREATE POLICY "cargos_delete" ON cargos FOR DELETE
  USING (fn_tiene_permiso(auth.uid(), empresa_id, 'nomina_editar'));
