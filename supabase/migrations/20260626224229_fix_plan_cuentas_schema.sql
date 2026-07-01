
-- Agregar columnas faltantes a plan_cuentas
ALTER TABLE public.plan_cuentas
  ADD COLUMN IF NOT EXISTS naturaleza text DEFAULT 'deudora',
  ADD COLUMN IF NOT EXISTS descripcion text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Establecer naturaleza correcta según tipo contable (regla contable universal)
UPDATE public.plan_cuentas SET naturaleza = CASE
  WHEN tipo IN ('activo', 'costo', 'gasto') THEN 'deudora'
  WHEN tipo IN ('pasivo', 'patrimonio', 'ingreso') THEN 'acreedora'
  ELSE 'deudora'
END;

-- Agregar empresa_id a asientos_detalle (para filtros por empresa)
ALTER TABLE public.asientos_detalle
  ADD COLUMN IF NOT EXISTS empresa_id uuid REFERENCES public.empresas_persona_natural(id);

-- Poblar empresa_id en asientos_detalle desde el asiento padre
UPDATE public.asientos_detalle ad
SET empresa_id = ac.empresa_id
FROM public.asientos_contables ac
WHERE ad.asiento_id = ac.id AND ad.empresa_id IS NULL;
