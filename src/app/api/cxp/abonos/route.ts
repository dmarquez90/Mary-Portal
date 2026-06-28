// src/app/api/cxc/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const empresaId = searchParams.get('empresa_id')
  const clienteId = searchParams.get('cliente_id')
  const estado    = searchParams.get('estado')  // vigente | vencida | pagada

  if (!empresaId) return NextResponse.json({ error: 'empresa_id requerido' }, { status: 400 })

  let query = supabase
    .from('vista_saldos_cxc')
    .select('*, cliente:clientes(nombre, telefono, correo)')
    .eq('empresa_id', empresaId)
    .order('dias_vencido', { ascending: false })

  if (clienteId) query = query.eq('cliente_id', clienteId)
  if (estado && estado !== 'todos') query = query.eq('estado_cobro', estado)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
