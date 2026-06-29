// src/app/api/caja-bancos/cheques/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function getEmpresaId(supabase: any, userId: string) {
  const [{ data: en }, { data: ej }] = await Promise.all([
    supabase.from('empresas_persona_natural').select('id').eq('user_id', userId).maybeSingle(),
    supabase.from('empresas_juridicas').select('id').eq('user_id', userId).maybeSingle(),
  ])
  return en?.id ?? ej?.id ?? null
}

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const empresaId = await getEmpresaId(supabase, user.id)
  if (!empresaId) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const estado = searchParams.get('estado')

  let query = supabase
    .from('cheques')
    .select('*, cuentas_banco(nombre, banco, moneda)')
    .eq('empresa_id', empresaId)
    .order('fecha_emision', { ascending: false })

  if (estado) query = query.eq('estado', estado)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ cheques: data })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const empresaId = await getEmpresaId(supabase, user.id)
  if (!empresaId) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

  const body = await req.json()
  const { cuenta_banco_id, numero_cheque, tipo, monto, beneficiario, fecha_emision, fecha_vencimiento, notas } = body

  if (!cuenta_banco_id || !numero_cheque || !tipo || !monto || !fecha_emision)
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })

  const { data, error } = await supabase
    .from('cheques')
    .insert({
      empresa_id: empresaId,
      cuenta_banco_id,
      numero_cheque,
      tipo,
      monto: Number(monto),
      beneficiario: beneficiario || null,
      fecha_emision,
      fecha_vencimiento: fecha_vencimiento || null,
      notas: notas || null,
      estado: 'activo',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ cheque: data })
}

export async function PATCH(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { id, estado } = body
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

  const { data, error } = await supabase
    .from('cheques')
    .update({ estado })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ cheque: data })
}
