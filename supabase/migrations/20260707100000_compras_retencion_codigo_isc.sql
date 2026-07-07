-- Código de retención IR por compra (catálogo DGI: 22=2% general,
-- 27=10% servicios profesionales, etc.) e ISC pagado informativo para
-- la planilla de Crédito Fiscal ISC de la DMI.
ALTER TABLE compras ADD COLUMN IF NOT EXISTS retencion_codigo TEXT;
ALTER TABLE compras ADD COLUMN IF NOT EXISTS isc_total NUMERIC(15,2) NOT NULL DEFAULT 0;

-- Backfill: las retenciones históricas se calcularon siempre al 2% general
UPDATE compras SET retencion_codigo = '22' WHERE retencion_ir > 0 AND retencion_codigo IS NULL;

-- Fix RLS de declaraciones_isc: usaba el patrón legado user_id = auth.uid()
-- que no funciona para usuarios invitados (contador, auxiliar)
DROP POLICY IF EXISTS empresa_isc ON declaraciones_isc;
CREATE POLICY empresa_isc ON declaraciones_isc FOR ALL
  USING (empresa_id = ANY(get_empresa_ids()));
