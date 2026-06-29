// src/app/api/caja-bancos/transacciones/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function getEmpresaId(supabase: any, userId: string) {
  const [{ data: en }, { data: ej }] = await Promise.all([
    supabase.from('empresas_persona_natural').select('id').eq('user_id', userId).maybeSingle(),
    supabase.from('empresas_juridicas').select('id').eq('user_id', userId).maybeSingle(),
  ])
  return en?.id ?? ej?.id ?? null
}

// Tipos que representan ENTRADA de dinero a la cuenta
const TIPOS_INGRESO = new Set(['ingreso', 'deposito', 'transferencia'])

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const empresaId = await getEmpresaId(supabase, user.id)
  if (!empresaId) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

  const { searchParams } = new URL(req.url)
  const cuentaId = searchParams.get('cuenta_banco_id')

  let query = supabase
    .from('transacciones_banco')
    .select('*, cuentas_banco(nombre, banco, moneda)')
    .eq('empresa_id', empresaId)
    .order('fecha', { ascending: false })
    .limit(200)

  if (cuentaId) query = query.eq('cuenta_banco_id', cuentaId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ transacciones: data })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const empresaId = await getEmpresaId(supabase, user.id)
  if (!empresaId) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

  const body = await req.json()
  const { cuenta_banco_id, tipo, monto, descripcion, fecha, referencia, monto_usd, tipo_cambio, notas } = body

  if (!cuenta_banco_id || !tipo || !monto || !descripcion || !fecha)
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })

  const montoNum = Number(monto)
  const esIngreso = TIPOS_INGRESO.has(tipo)

  // Insertar transacción
  const { data: tx, error: txErr } = await supabase
    .from('transacciones_banco')
    .insert({
      empresa_id: empresaId,
      cuenta_banco_id,
      tipo,
      monto: montoNum,
      monto_usd: monto_usd ? Number(monto_usd) : null,
      tipo_cambio: tipo_cambio ? Number(tipo_cambio) : null,
      descripcion,
      fecha,
      referencia: referencia || null,
      notas: notas || null,
      created_by: user.id,
    })
    .select()
    .single()

  if (txErr) return NextResponse.json({ error: txErr.message }, { status: 500 })

  // Actualizar saldo bancario según si es entrada o salida
  const { data: cuenta } = await supabase
    .from('cuentas_banco')
    .select('saldo_actual')
    .eq('id', cuenta_banco_id)
    .single()

  if (cuenta) {
    const nuevoSaldo = esIngreso
      ? Number(cuenta.saldo_actual) + montoNum
      : Number(cuenta.saldo_actual) - montoNum

    await supabase
      .from('cuentas_banco')
      .update({ saldo_actual: nuevoSaldo, updated_at: new Date().toISOString() })
      .eq('id', cuenta_banco_id)
  }

  return NextResponse.json({ transaccion: tx })
}

export async function PATCH(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { id, estado } = body
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

  const { data, error } = await supabase
    .from('transacciones_banco')
    .update({ estado })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ transaccion: data })
}
