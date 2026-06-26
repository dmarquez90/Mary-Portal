// src/app/api/caja-bancos/cuentas-banco/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function getEmpresaId(supabase: any, userId: string) {
  const [{ data: en }, { data: ej }] = await Promise.all([
    supabase.from('empresas_persona_natural').select('id').eq('user_id', userId).maybeSingle(),
    supabase.from('empresas_juridicas').select('id').eq('user_id', userId).maybeSingle(),
  ])
  return en?.id ?? ej?.id ?? null
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const empresaId = await getEmpresaId(supabase, user.id)
  if (!empresaId) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

  const { data, error } = await supabase
    .from('cuentas_banco')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ cuentas: data })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const empresaId = await getEmpresaId(supabase, user.id)
  if (!empresaId) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

  const body = await req.json()
  const { nombre, banco, numero_cuenta, tipo, moneda, saldo_inicial, notas } = body

  if (!nombre || !tipo || !moneda) return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })

  const saldo = Number(saldo_inicial) || 0

  const { data, error } = await supabase
    .from('cuentas_banco')
    .insert({ empresa_id: empresaId, nombre, banco: banco || null, numero_cuenta: numero_cuenta || null, tipo, moneda, saldo_inicial: saldo, saldo_actual: saldo, notas: notas || null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ cuenta: data })
}

export async function PATCH(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { id, activa, ...rest } = body
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

  const { data, error } = await supabase
    .from('cuentas_banco')
    .update({ ...rest, activa, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ cuenta: data })
}
