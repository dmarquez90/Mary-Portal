import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const empresaId = searchParams.get('empresa_id')
  const anio = searchParams.get('anio')
  const mes = searchParams.get('mes')
  if (!empresaId) return NextResponse.json({ error: 'empresa_id requerido' }, { status: 400 })

  let query = supabase
    .from('retenciones_definitivas')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('fecha_pago', { ascending: false })

  if (anio) query = query.eq('anio', parseInt(anio))
  if (mes) query = query.eq('mes', parseInt(mes))

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { base_imponible, tasa } = body
  const monto_retenido = Number((base_imponible * tasa).toFixed(2))

  const { data, error } = await supabase
    .from('retenciones_definitivas')
    .insert({ ...body, monto_retenido })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
