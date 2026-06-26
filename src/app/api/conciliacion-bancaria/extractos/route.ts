import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const empresaId = searchParams.get('empresa_id')
  const cuentaId = searchParams.get('cuenta_banco_id')
  const conciliado = searchParams.get('conciliado')
  if (!empresaId) return NextResponse.json({ error: 'empresa_id requerido' }, { status: 400 })

  let query = supabase
    .from('extractos_bancarios')
    .select('*, transaccion:transacciones_banco(descripcion, referencia)')
    .eq('empresa_id', empresaId)
    .order('fecha', { ascending: false })

  if (cuentaId) query = query.eq('cuenta_banco_id', cuentaId)
  if (conciliado !== null) query = query.eq('conciliado', conciliado === 'true')

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  // body puede ser un array de líneas del extracto (carga masiva)
  const lineas = Array.isArray(body) ? body : [body]

  const { data, error } = await supabase
    .from('extractos_bancarios')
    .insert(lineas.map(l => ({ ...l, conciliado: false })))
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

// PATCH: conciliar una línea con una transacción SARA
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { extracto_id, transaccion_id } = await req.json()

  const { data, error } = await supabase
    .from('extractos_bancarios')
    .update({ conciliado: true, transaccion_id })
    .eq('id', extracto_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Marcar transacción como conciliada
  if (transaccion_id) {
    await supabase
      .from('transacciones_banco')
      .update({ estado: 'conciliado' })
      .eq('id', transaccion_id)
  }

  return NextResponse.json(data)
}
