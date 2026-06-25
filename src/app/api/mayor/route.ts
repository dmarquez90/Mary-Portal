// src/app/api/mayor/route.ts
// Libro Mayor y Balance de Comprobación
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Helper: obtener empresa_id del usuario autenticado
async function getEmpresaId(supabase: any, userId: string): Promise<string | null> {
  const [{ data: en }, { data: ej }] = await Promise.all([
    supabase.from('empresas_persona_natural').select('id').eq('user_id', userId).single(),
    supabase.from('empresas_juridicas').select('id').eq('user_id', userId).single(),
  ])
  return en?.id ?? ej?.id ?? null
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const empresaId = await getEmpresaId(supabase, user.id)
  if (!empresaId) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

  const { searchParams } = new URL(request.url)
  const tipo = searchParams.get('tipo') // 'mayor' | 'balance'
  const anio = parseInt(searchParams.get('anio') || String(new Date().getFullYear()))
  const mes = searchParams.get('mes') ? parseInt(searchParams.get('mes')!) : null
  const cuenta_id = searchParams.get('cuenta_id')

  // ── LIBRO MAYOR – movimientos de una cuenta específica ──────
  if (tipo === 'mayor' && cuenta_id) {
    const { data: saldosAnteriores } = await supabase
      .from('saldos_mayor')
      .select('total_debe, total_haber')
      .eq('empresa_id', empresaId)
      .eq('cuenta_id', cuenta_id)
      .lt('anio', anio)

    let saldoInicialDebe = 0
    let saldoInicialHaber = 0

    saldosAnteriores?.forEach((s: any) => {
      saldoInicialDebe += s.total_debe
      saldoInicialHaber += s.total_haber
    })

    if (mes) {
      const { data: mesesAnteriores } = await supabase
        .from('saldos_mayor')
        .select('total_debe, total_haber')
        .eq('empresa_id', empresaId)
        .eq('cuenta_id', cuenta_id)
        .eq('anio', anio)
        .lt('mes', mes)

      mesesAnteriores?.forEach((s: any) => {
        saldoInicialDebe += s.total_debe
        saldoInicialHaber += s.total_haber
      })
    }

    let movQuery = supabase
      .from('asientos_detalle')
      .select(`
        id, debe, haber, descripcion, orden,
        asientos_contables!inner(
          id, numero, fecha, concepto, estado, periodo_anio, periodo_mes
        )
      `)
      .eq('empresa_id', empresaId)
      .eq('cuenta_id', cuenta_id)
      .eq('asientos_contables.estado', 'contabilizado')
      .eq('asientos_contables.periodo_anio', anio)
      .order('asientos_contables(fecha)', { ascending: true })
      .order('asientos_contables(numero)', { ascending: true })

    if (mes) {
      movQuery = movQuery.eq('asientos_contables.periodo_mes', mes)
    }

    const { data: movimientos, error } = await movQuery
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      saldo_inicial_debe: saldoInicialDebe,
      saldo_inicial_haber: saldoInicialHaber,
      movimientos,
    })
  }

  // ── BALANCE DE COMPROBACIÓN – todas las cuentas con movimiento ──
  if (tipo === 'balance') {
    let query = supabase
      .from('saldos_mayor')
      .select(`
        cuenta_id, codigo_cuenta, total_debe, total_haber, saldo_final,
        plan_cuentas!inner(nombre, tipo, naturaleza, nivel)
      `)
      .eq('empresa_id', empresaId)
      .eq('anio', anio)
      .order('codigo_cuenta')

    if (mes) query = query.eq('mes', mes)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    if (!mes) {
      const agrupado: Record<string, any> = {}
      data?.forEach((row: any) => {
        if (!agrupado[row.cuenta_id]) {
          agrupado[row.cuenta_id] = {
            cuenta_id: row.cuenta_id,
            codigo_cuenta: row.codigo_cuenta,
            nombre: row.plan_cuentas.nombre,
            tipo: row.plan_cuentas.tipo,
            naturaleza: row.plan_cuentas.naturaleza,
            nivel: row.plan_cuentas.nivel,
            total_debe: 0,
            total_haber: 0,
          }
        }
        agrupado[row.cuenta_id].total_debe += row.total_debe
        agrupado[row.cuenta_id].total_haber += row.total_haber
      })

      const cuentas = Object.values(agrupado).map((c: any) => ({
        ...c,
        saldo_deudor: c.naturaleza === 'deudora'
          ? Math.max(0, c.total_debe - c.total_haber)
          : Math.max(0, c.total_haber - c.total_debe) * -1,
        saldo_acreedor: c.naturaleza === 'acreedora'
          ? Math.max(0, c.total_haber - c.total_debe)
          : Math.max(0, c.total_debe - c.total_haber) * -1,
      }))

      const totalDebe = cuentas.reduce((s, c) => s + c.total_debe, 0)
      const totalHaber = cuentas.reduce((s, c) => s + c.total_haber, 0)

      return NextResponse.json({
        cuentas,
        totales: { debe: totalDebe, haber: totalHaber, cuadrado: Math.abs(totalDebe - totalHaber) < 0.01 }
      })
    }

    const cuentas = data?.map((row: any) => ({
      cuenta_id: row.cuenta_id,
      codigo_cuenta: row.codigo_cuenta,
      nombre: row.plan_cuentas.nombre,
      tipo: row.plan_cuentas.tipo,
      naturaleza: row.plan_cuentas.naturaleza,
      nivel: row.plan_cuentas.nivel,
      total_debe: row.total_debe,
      total_haber: row.total_haber,
      saldo_deudor: row.naturaleza === 'deudora'
        ? Math.max(0, row.total_debe - row.total_haber)
        : 0,
      saldo_acreedor: row.naturaleza === 'acreedora'
        ? Math.max(0, row.total_haber - row.total_debe)
        : 0,
    }))

    const totalDebe = cuentas?.reduce((s: number, c: any) => s + c.total_debe, 0) ?? 0
    const totalHaber = cuentas?.reduce((s: number, c: any) => s + c.total_haber, 0) ?? 0

    return NextResponse.json({
      cuentas,
      totales: { debe: totalDebe, haber: totalHaber, cuadrado: Math.abs(totalDebe - totalHaber) < 0.01 }
    })
  }

  // ── RESUMEN DE SALDOS POR TIPO (para Dashboard) ─────────────
  const { data: saldos } = await supabase
    .from('saldos_mayor')
    .select(`
      total_debe, total_haber,
      plan_cuentas!inner(tipo, nivel)
    `)
    .eq('empresa_id', empresaId)
    .eq('anio', anio)
    .eq('plan_cuentas.nivel', 3)

  const resumen = { activo: 0, pasivo: 0, patrimonio: 0, ingreso: 0, costo: 0, gasto: 0 }

  saldos?.forEach((s: any) => {
    const tipo = s.plan_cuentas.tipo
    resumen[tipo as keyof typeof resumen] += (s.total_debe - s.total_haber)
  })

  return NextResponse.json({ resumen })
}
