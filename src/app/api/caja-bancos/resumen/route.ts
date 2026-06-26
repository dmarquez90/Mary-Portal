// src/app/api/caja-bancos/resumen/route.ts
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

  const inicioMes = new Date()
  inicioMes.setDate(1)
  const mesStr = inicioMes.toISOString().split('T')[0]

  const [
    { data: cuentasBanco },
    { data: cuentasCaja },
    { data: ingMes },
    { data: egMes },
    { data: chequesPend },
  ] = await Promise.all([
    supabase.from('cuentas_banco').select('*').eq('empresa_id', empresaId).eq('activa', true).order('created_at'),
    supabase.from('cuentas_caja').select('*').eq('empresa_id', empresaId).eq('activa', true).order('created_at'),
    supabase.from('transacciones_banco').select('monto').eq('empresa_id', empresaId).eq('tipo', 'ingreso').gte('fecha', mesStr),
    supabase.from('transacciones_banco').select('monto').eq('empresa_id', empresaId).eq('tipo', 'egreso').gte('fecha', mesStr),
    supabase.from('cheques').select('id').eq('empresa_id', empresaId).eq('estado', 'activo'),
  ])

  const totalNIO = (cuentasBanco ?? []).filter((c: any) => c.moneda === 'NIO').reduce((s: number, c: any) => s + Number(c.saldo_actual), 0)
  const totalUSD = (cuentasBanco ?? []).filter((c: any) => c.moneda === 'USD').reduce((s: number, c: any) => s + Number(c.saldo_actual), 0)
  const totalCaja = (cuentasCaja ?? []).reduce((s: number, c: any) => s + Number(c.saldo_actual), 0)
  const ingresosMes = (ingMes ?? []).reduce((s: number, t: any) => s + Number(t.monto), 0)
  const egresosMes = (egMes ?? []).reduce((s: number, t: any) => s + Number(t.monto), 0)

  return NextResponse.json({
    totalNIO,
    totalUSD,
    totalCaja,
    ingresosMes,
    egresosMes,
    chequesPendientes: chequesPend?.length ?? 0,
    numCuentasBanco: cuentasBanco?.length ?? 0,
    numCajas: cuentasCaja?.length ?? 0,
  })
}
