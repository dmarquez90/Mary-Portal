import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const empresaId = searchParams.get('empresa_id')
  const cuentaId = searchParams.get('cuenta_banco_id')
  if (!empresaId) return NextResponse.json({ error: 'empresa_id requerido' }, { status: 400 })

  let query = supabase
    .from('conciliaciones_bancarias')
    .select('*, cuenta:cuentas_banco(nombre, banco, numero_cuenta)')
    .eq('empresa_id', empresaId)
    .order('anio', { ascending: false })
    .order('mes', { ascending: false })

  if (cuentaId) query = query.eq('cuenta_banco_id', cuentaId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { empresa_id, cuenta_banco_id, anio, mes, fecha_corte } = body

  // Calcular saldo según libros desde transacciones_banco
  const { data: cuenta } = await supabase
    .from('cuentas_banco')
    .select('saldo_actual')
    .eq('id', cuenta_banco_id)
    .single()

  const saldo_libros = cuenta?.saldo_actual ?? 0

  const { data, error } = await supabase
    .from('conciliaciones_bancarias')
    .upsert({
      empresa_id, cuenta_banco_id, anio, mes, fecha_corte,
      saldo_segun_banco: body.saldo_segun_banco ?? 0,
      saldo_segun_libros: saldo_libros,
      diferencia_total: (body.saldo_segun_banco ?? 0) - saldo_libros,
      depositos_en_transito: body.depositos_en_transito ?? 0,
      cheques_pendientes: body.cheques_pendientes ?? 0,
      errores_banco: body.errores_banco ?? 0,
      errores_libros: body.errores_libros ?? 0,
      estado: 'en_proceso',
      notas: body.notas,
      created_by: user.id
    }, { onConflict: 'empresa_id,cuenta_banco_id,anio,mes' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
