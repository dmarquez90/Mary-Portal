// src/app/api/plan-cuentas/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { seedPlanCuentas } from '@/lib/seed-plan-cuentas'

// GET — Obtener todas las cuentas de la empresa
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: empresa } = await supabase
    .from('empresas')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!empresa) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

  const { searchParams } = new URL(request.url)
  const tipo = searchParams.get('tipo')
  const soloMovimiento = searchParams.get('permite_movimiento') === 'true'
  const nivel = searchParams.get('nivel')

  let query = supabase
    .from('plan_cuentas')
    .select('*')
    .eq('empresa_id', empresa.id)
    .eq('activa', true)
    .order('codigo')

  if (tipo) query = query.eq('tipo', tipo)
  if (soloMovimiento) query = query.eq('permite_movimiento', true)
  if (nivel) query = query.eq('nivel', parseInt(nivel))

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ cuentas: data })
}

// POST — Crear nueva cuenta o inicializar plan predeterminado
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: empresa } = await supabase
    .from('empresas')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (!empresa) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

  const body = await request.json()

  // Si se solicita la inicialización con el plan predeterminado
  if (body.action === 'seed') {
    const { error } = await seedPlanCuentas(supabase, empresa.id)
    if (error) return NextResponse.json({ error }, { status: 500 })
    return NextResponse.json({ ok: true, message: 'Plan de cuentas inicializado' })
  }

  // Crear una cuenta manualmente
  const { codigo, nombre, tipo, naturaleza, nivel, cuenta_padre_id, descripcion, permite_movimiento } = body

  if (!codigo || !nombre || !tipo || !naturaleza || !nivel) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('plan_cuentas')
    .insert({
      empresa_id: empresa.id,
      codigo, nombre, tipo, naturaleza, nivel,
      cuenta_padre_id: cuenta_padre_id || null,
      descripcion: descripcion || null,
      permite_movimiento: permite_movimiento ?? true,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ cuenta: data })
}

// PATCH — Editar cuenta
export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await request.json()
  const { id, nombre, descripcion, activa } = body

  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

  const { data, error } = await supabase
    .from('plan_cuentas')
    .update({ nombre, descripcion, activa, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ cuenta: data })
}
