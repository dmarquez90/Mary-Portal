// src/app/api/caja-bancos/resumen/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getEmpresaIdActual } from '@/lib/supabase/empresa-actual'

async function getEmpresaId(supabase: any, userId: string) {
  return getEmpresaIdActual(supabase, userId)
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
    { data: ingMesBanco },
    { data: egMesBanco },
    { data: movMesCaja },
    { data: chequesPend },
  ] = await Promise.all([
    supabase.from('cuentas_banco').select('*').eq('empresa_id', empresaId).eq('activa', true).order('created_at'),
    supabase.from('cuentas_caja').select('*').eq('empresa_id', empresaId).eq('activa', true).order('created_at'),
    supabase.from('transacciones_banco').select('monto').eq('empresa_id', empresaId).eq('tipo', 'ingreso').gte('fecha', mesStr),
    supabase.from('transacciones_banco').select('monto').eq('empresa_id', empresaId).eq('tipo', 'egreso').gte('fecha', mesStr),
    supabase.from('movimientos_caja').select('tipo, monto').eq('empresa_id', empresaId).eq('estado', 'registrado').gte('fecha', mesStr),
    supabase.from('cheques').select('id').eq('empresa_id', empresaId).eq('estado', 'activo'),
  ])

  // ── Banco (cuentas_banco + transacciones_banco) ──────────────
  const bancoTotalNIO = (cuentasBanco ?? []).filter((c: any) => c.moneda === 'NIO').reduce((s: number, c: any) => s + Number(c.saldo_actual), 0)
  const bancoTotalUSD = (cuentasBanco ?? []).filter((c: any) => c.moneda === 'USD').reduce((s: number, c: any) => s + Number(c.saldo_actual), 0)
  const bancoIngresosMes = (ingMesBanco ?? []).reduce((s: number, t: any) => s + Number(t.monto), 0)
  const bancoEgresosMes = (egMesBanco ?? []).reduce((s: number, t: any) => s + Number(t.monto), 0)

  // ── Caja (cuentas_caja + movimientos_caja) ───────────────────
  const cajaTotalNIO = (cuentasCaja ?? []).filter((c: any) => c.moneda === 'NIO').reduce((s: number, c: any) => s + Number(c.saldo_actual), 0)
  const cajaTotalUSD = (cuentasCaja ?? []).filter((c: any) => c.moneda === 'USD').reduce((s: number, c: any) => s + Number(c.saldo_actual), 0)
  const cajaIngresosMes = (movMesCaja ?? [])
    .filter((m: any) => m.tipo === 'ingreso')
    .reduce((s: number, m: any) => s + Number(m.monto), 0)
  const cajaEgresosMes = (movMesCaja ?? [])
    .filter((m: any) => m.tipo === 'egreso')
    .reduce((s: number, m: any) => s + Number(m.monto), 0)

  return NextResponse.json({
    banco: {
      totalNIO: bancoTotalNIO,
      totalUSD: bancoTotalUSD,
      ingresosMes: bancoIngresosMes,
      egresosMes: bancoEgresosMes,
    },
    caja: {
      totalNIO: cajaTotalNIO,
      totalUSD: cajaTotalUSD,
      ingresosMes: cajaIngresosMes,
      egresosMes: cajaEgresosMes,
    },
    // Combinado (banco + caja) — usado en la pestaña "Resumen"
    totalNIO: bancoTotalNIO + cajaTotalNIO,
    totalUSD: bancoTotalUSD + cajaTotalUSD,
    totalCaja: cajaTotalNIO + cajaTotalUSD,
    ingresosMes: bancoIngresosMes + cajaIngresosMes,
    egresosMes: bancoEgresosMes + cajaEgresosMes,
    chequesPendientes: chequesPend?.length ?? 0,
    numCuentasBanco: cuentasBanco?.length ?? 0,
    numCajas: cuentasCaja?.length ?? 0,
  })
}
