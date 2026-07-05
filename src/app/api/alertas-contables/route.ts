// src/app/api/alertas-contables/route.ts
// Alertas de cuentas de activo (caja, bancos, CxC, inventario, etc.) que
// están actualmente en saldo negativo. El bloqueo de nuevos movimientos que
// empeoren esto vive en el trigger fn_validar_saldo_no_negativo (BD); esta
// ruta expone la función get_alertas_saldos_negativos() para que el
// dashboard muestre qué cuentas ya están en negativo y deben corregirse.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getEmpresaIdActual } from '@/lib/supabase/empresa-actual'

async function getEmpresaId(supabase: any, userId: string): Promise<string | null> {
  return getEmpresaIdActual(supabase, userId)
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const empresaId = await getEmpresaId(supabase, user.id)
  if (!empresaId) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

  const { data, error } = await supabase.rpc('get_alertas_saldos_negativos', {
    p_empresa_id: empresaId,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ alertas: data ?? [] })
}
