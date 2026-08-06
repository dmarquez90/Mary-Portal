import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// IBI — Impuesto de Bienes Inmuebles (Decreto 3-95), municipal, ANUAL.
// 1% sobre el 80% del valor catastral, en dos cuotas del 50%. El sistema
// no tiene el valor catastral (no hay integración con el catastro
// municipal) — se captura manualmente. El cálculo del monto lo hace el
// trigger fn_ibi_calcular_monto en la base de datos.

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const empresaId = searchParams.get('empresa_id')
  const anio = searchParams.get('anio')
  if (!empresaId) return NextResponse.json({ error: 'empresa_id requerido' }, { status: 400 })

  let query = supabase
    .from('declaraciones_ibi')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('anio', { ascending: false })

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
  const { empresa_id, anio, descripcion_inmueble, valor_catastral } = body
  if (!empresa_id || !anio) {
    return NextResponse.json({ error: 'empresa_id y anio son requeridos' }, { status: 400 })
  }
  if (!valor_catastral || Number(valor_catastral) <= 0) {
    return NextResponse.json({ error: 'valor_catastral es requerido (según certificado catastral o autoevalúo)' }, { status: 400 })
  }

  // Vencimientos habituales: primera cuota a fin de marzo, segunda a fin de
  // septiembre — varían por ordenanza municipal, quedan editables.
  const fecha_vencimiento_cuota1 = body.fecha_vencimiento_cuota1 ?? `${anio}-03-31`
  const fecha_vencimiento_cuota2 = body.fecha_vencimiento_cuota2 ?? `${anio}-09-30`

  const { data, error } = await supabase
    .from('declaraciones_ibi')
    .upsert({
      empresa_id, anio,
      descripcion_inmueble: descripcion_inmueble || 'Inmueble principal',
      valor_catastral: Number(valor_catastral),
      tasa: body.tasa ?? 0.01,
      fecha_vencimiento_cuota1,
      fecha_vencimiento_cuota2,
      notas: body.notas,
    }, { onConflict: 'empresa_id,anio,descripcion_inmueble' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const body = await req.json()
  const update: Record<string, unknown> = {}
  if (body.cuota === 1) {
    update.cuota1_pagada = true
    update.fecha_pago_cuota1 = body.fecha_pago ?? new Date().toISOString().split('T')[0]
    update.numero_recibo_cuota1 = body.numero_recibo ?? null
  } else if (body.cuota === 2) {
    update.cuota2_pagada = true
    update.fecha_pago_cuota2 = body.fecha_pago ?? new Date().toISOString().split('T')[0]
    update.numero_recibo_cuota2 = body.numero_recibo ?? null
  } else {
    return NextResponse.json({ error: 'Especifique cuota: 1 o 2' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('declaraciones_ibi')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
