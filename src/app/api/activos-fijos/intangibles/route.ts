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
    .from('activos_intangibles')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('fecha_adquisicion', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const {
    empresa_id, codigo, nombre, descripcion, tipo,
    costo_adquisicion, fecha_adquisicion, fecha_inicio_amort,
    vida_util_anios, cuenta_activo_id, cuenta_amort_acum_id, cuenta_gasto_amort_id
  } = body

  const vida_util_anios_final = vida_util_anios ?? 3  // LCT: 3 años
  const vida_util_meses = Math.round(vida_util_anios_final * 12)
  const tasa_amortizacion_anual = Number((1 / vida_util_anios_final).toFixed(4))

  const { data, error } = await supabase
    .from('activos_intangibles')
    .insert({
      empresa_id, codigo, nombre, descripcion, tipo,
      costo_adquisicion,
      valor_en_libros: costo_adquisicion,
      fecha_adquisicion, fecha_inicio_amort,
      vida_util_anios: vida_util_anios_final,
      vida_util_meses,
      tasa_amortizacion_anual,
      cuenta_activo_id, cuenta_amort_acum_id, cuenta_gasto_amort_id,
      estado: 'activo'
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
