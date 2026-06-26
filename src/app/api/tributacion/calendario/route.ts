import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const empresaId = searchParams.get('empresa_id')
  const anio = searchParams.get('anio')
  const estado = searchParams.get('estado')
  if (!empresaId) return NextResponse.json({ error: 'empresa_id requerido' }, { status: 400 })

  let query = supabase
    .from('calendario_tributario')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('fecha_vencimiento', { ascending: true })

  if (anio) query = query.eq('anio', parseInt(anio))
  if (estado) query = query.eq('estado', estado)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST: generar calendario para un año completo
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { empresa_id, anio } = await req.json()
  if (!empresa_id || !anio) {
    return NextResponse.json({ error: 'empresa_id y anio requeridos' }, { status: 400 })
  }

  const { data, error } = await supabase.rpc('generar_calendario_tributario', {
    p_empresa_id: empresa_id,
    p_anio: anio
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ generadas: data }, { status: 201 })
}

// PATCH: actualizar estado de una obligación
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { id, estado, fecha_cumplimiento, notas } = await req.json()
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const { data, error } = await supabase
    .from('calendario_tributario')
    .update({ estado, fecha_cumplimiento, notas, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
