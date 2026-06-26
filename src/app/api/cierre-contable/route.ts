import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const empresaId = searchParams.get('empresa_id')
  if (!empresaId) return NextResponse.json({ error: 'empresa_id requerido' }, { status: 400 })

  const { data, error } = await supabase
    .from('periodos_contables')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('fecha_inicio', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST: ejecutar cierre de período
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { periodo_id } = await req.json()
  if (!periodo_id) return NextResponse.json({ error: 'periodo_id requerido' }, { status: 400 })

  const { data, error } = await supabase.rpc('cerrar_periodo_contable', {
    p_periodo_id: periodo_id,
    p_user_id: user.id
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if ((data as string).startsWith('ERROR')) {
    return NextResponse.json({ error: data }, { status: 400 })
  }

  return NextResponse.json({ mensaje: data })
}
