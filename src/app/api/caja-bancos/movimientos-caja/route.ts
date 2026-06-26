// src/app/api/caja-bancos/movimientos-caja/route.ts
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
  const cajaId = searchParams.get('cuenta_caja_id')

  let query = supabase
    .from('movimientos_caja')
    .select('*, cuentas_caja(nombre, tipo)')
    .eq('empresa_id', empresaId)
    .order('fecha', { ascending: false })
    .limit(200)

  if (cajaId) query = query.eq('cuenta_caja_id', cajaId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ movimientos: data })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const empresaId = await getEmpresaId(supabase, user.id)
  if (!empresaId) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

  const body = await req.json()
  const { cuenta_caja_id, tipo, monto, descripcion, fecha, notas } = body

  if (!cuenta_caja_id || !tipo || !monto || !descripcion || !fecha)
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })

  const montoNum = Number(monto)

  const { data: mov, error: movErr } = await supabase
    .from('movimientos_caja')
    .insert({
      empresa_id: empresaId,
      cuenta_caja_id,
      tipo,
      monto: montoNum,
      descripcion,
      fecha,
      notas: notas || null,
      created_by: user.id,
    })
    .select()
    .single()

  if (movErr) return NextResponse.json({ error: movErr.message }, { status: 500 })

  // Actualizar saldo de caja
  const { data: caja } = await supabase
    .from('cuentas_caja')
    .select('saldo_actual')
    .eq('id', cuenta_caja_id)
    .single()

  if (caja) {
    const nuevoSaldo = tipo === 'ingreso'
      ? Number(caja.saldo_actual) + montoNum
      : Number(caja.saldo_actual) - montoNum

    await supabase
      .from('cuentas_caja')
      .update({ saldo_actual: nuevoSaldo, updated_at: new Date().toISOString() })
      .eq('id', cuenta_caja_id)
  }

  return NextResponse.json({ movimiento: mov })
}
