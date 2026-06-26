import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const empresaId = searchParams.get('empresa_id')
  const anio = searchParams.get('anio')
  if (!empresaId) return NextResponse.json({ error: 'empresa_id requerido' }, { status: 400 })

  let query = supabase
    .from('declaraciones_imi')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('anio', { ascending: false })
    .order('mes', { ascending: false })

  if (anio) query = query.eq('anio', parseInt(anio))

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { empresa_id, anio, mes } = body

  let ingresos = body.ingresos_brutos_mes
  if (!ingresos) {
    const fechaInicio = `${anio}-${String(mes).padStart(2, '0')}-01`
    const diasMes = new Date(anio, mes, 0).getDate()
    const fechaFin = `${anio}-${String(mes).padStart(2, '0')}-${diasMes}`

    const { data: facturas } = await supabase
      .from('facturas')
      .select('total')
      .eq('empresa_id', empresa_id)
      .in('estado', ['pagada', 'emitida'])
      .gte('fecha_emision', fechaInicio)
      .lte('fecha_emision', fechaFin)

    ingresos = facturas?.reduce((s, f) => s + (f.total ?? 0), 0) ?? 0
  }

  const tasa = 0.01
  const monto_imi = Number((ingresos * tasa).toFixed(2))

  const mesSig = mes === 12 ? 1 : mes + 1
  const anioSig = mes === 12 ? anio + 1 : anio
  const fecha_vencimiento = `${anioSig}-${String(mesSig).padStart(2, '0')}-15`

  const { data, error } = await supabase
    .from('declaraciones_imi')
    .upsert({
      empresa_id, anio, mes,
      fecha_vencimiento,
      ingresos_brutos_mes: ingresos,
      tasa,
      monto_imi,
      es_matricula: body.es_matricula ?? false,
      monto_matricula: body.monto_matricula ?? 0,
      estado: body.estado ?? 'pendiente',
      fecha_pago: body.fecha_pago,
      numero_recibo: body.numero_recibo,
      notas: body.notas
    }, { onConflict: 'empresa_id,anio,mes' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
