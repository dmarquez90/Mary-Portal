// src/app/api/mayor/route.ts
// Libro Mayor y Balance de Comprobación
// Schema real BD:
//   saldos_mayor:      empresa_id, periodo_id, cuenta_id, saldo_debe, saldo_haber, saldo_neto
//   asientos_detalle:  asiento_id, cuenta_id, empresa_id, debe, haber, descripcion, orden
//   asientos_contables: empresa_id, periodo_anio, periodo_mes, estado, fecha, numero, concepto
//   periodos_contables: empresa_id, anio, mes, estado
//   plan_cuentas:       empresa_id, codigo, nombre, tipo, naturaleza, nivel
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function getEmpresaId(supabase: any, userId: string): Promise<string | null> {
  const [{ data: en }, { data: ej }] = await Promise.all([
    supabase.from('empresas_persona_natural').select('id').eq('user_id', userId).maybeSingle(),
    supabase.from('empresas_juridicas').select('id').eq('user_id', userId).maybeSingle(),
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
  const tipo      = searchParams.get('tipo')
  const anio      = parseInt(searchParams.get('anio') || String(new Date().getFullYear()))
  const mes       = searchParams.get('mes') ? parseInt(searchParams.get('mes')!) : null
  const cuenta_id = searchParams.get('cuenta_id')

  // ── LIBRO MAYOR – movimientos de una cuenta específica ──────
  if (tipo === 'mayor' && cuenta_id) {
    const { data: periodosAnteriores } = await supabase
      .from('periodos_contables')
      .select('id')
      .eq('empresa_id', empresaId)
      .lt('anio', anio)

    const idsPeriodosAnteriores = (periodosAnteriores ?? []).map((p: any) => p.id)

    let saldoInicialDebe  = 0
    let saldoInicialHaber = 0

    if (idsPeriodosAnteriores.length > 0) {
      const { data: saldosAnt } = await supabase
        .from('saldos_mayor')
        .select('saldo_debe, saldo_haber')
        .eq('empresa_id', empresaId)
        .eq('cuenta_id', cuenta_id)
        .in('periodo_id', idsPeriodosAnteriores)

      saldosAnt?.forEach((s: any) => {
        saldoInicialDebe  += Number(s.saldo_debe)
        saldoInicialHaber += Number(s.saldo_haber)
      })
    }

    if (mes) {
      const { data: periodosMesAnt } = await supabase
        .from('periodos_contables')
        .select('id')
        .eq('empresa_id', empresaId)
        .eq('anio', anio)
        .lt('mes', mes)

      const idsAnt = (periodosMesAnt ?? []).map((p: any) => p.id)
      if (idsAnt.length > 0) {
        const { data: saldosMesAnt } = await supabase
          .from('saldos_mayor')
          .select('saldo_debe, saldo_haber')
          .eq('empresa_id', empresaId)
          .eq('cuenta_id', cuenta_id)
          .in('periodo_id', idsAnt)

        saldosMesAnt?.forEach((s: any) => {
          saldoInicialDebe  += Number(s.saldo_debe)
          saldoInicialHaber += Number(s.saldo_haber)
        })
      }
    }

    let movQuery = supabase
      .from('asientos_detalle')
      .select(`
        id, debe, haber, descripcion, orden,
        asientos_contables!inner(
          id, numero, fecha, concepto, estado, periodo_anio, periodo_mes
        )
      `)
      .eq('cuenta_id', cuenta_id)
      .eq('asientos_contables.empresa_id', empresaId)
      .eq('asientos_contables.estado', 'contabilizado')
      .eq('asientos_contables.periodo_anio', anio)
      .order('orden', { ascending: true })

    if (mes) movQuery = movQuery.eq('asientos_contables.periodo_mes', mes)

    const { data: movimientos, error } = await movQuery
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      saldo_inicial_debe:  Math.round(saldoInicialDebe  * 100) / 100,
      saldo_inicial_haber: Math.round(saldoInicialHaber * 100) / 100,
      movimientos,
    })
  }

  // ── BALANCE DE COMPROBACIÓN ─────────────────────────────────
  if (tipo === 'balance') {
    let periodoQuery = supabase
      .from('periodos_contables')
      .select('id')
      .eq('empresa_id', empresaId)
      .eq('anio', anio)

    if (mes) periodoQuery = periodoQuery.eq('mes', mes)

    const { data: periodos } = await periodoQuery
    const idsPeriodos = (periodos ?? []).map((p: any) => p.id)

    if (idsPeriodos.length === 0) {
      return NextResponse.json({
        cuentas: [],
        totales: { debe: 0, haber: 0, cuadrado: true },
      })
    }

    const { data: saldos, error } = await supabase
      .from('saldos_mayor')
      .select(`
        cuenta_id, saldo_debe, saldo_haber, saldo_neto,
        plan_cuentas!inner(codigo, nombre, tipo, naturaleza, nivel)
      `)
      .eq('empresa_id', empresaId)
      .in('periodo_id', idsPeriodos)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const agrupado: Record<string, any> = {}
    saldos?.forEach((row: any) => {
      const pc = row.plan_cuentas
      if (!agrupado[row.cuenta_id]) {
        agrupado[row.cuenta_id] = {
          cuenta_id:     row.cuenta_id,
          codigo_cuenta: pc.codigo,
          nombre:        pc.nombre,
          tipo:          pc.tipo,
          naturaleza:    pc.naturaleza,
          nivel:         pc.nivel,
          total_debe:    0,
          total_haber:   0,
        }
      }
      agrupado[row.cuenta_id].total_debe  += Number(row.saldo_debe)
      agrupado[row.cuenta_id].total_haber += Number(row.saldo_haber)
    })

    const cuentas = Object.values(agrupado)
      .sort((a: any, b: any) => a.codigo_cuenta.localeCompare(b.codigo_cuenta))
      .map((c: any) => {
        const debe  = Math.round(c.total_debe  * 100) / 100
        const haber = Math.round(c.total_haber * 100) / 100
        return {
          ...c,
          total_debe:     debe,
          total_haber:    haber,
          saldo_deudor:   c.naturaleza === 'deudora'   ? Math.max(0, debe - haber) : 0,
          saldo_acreedor: c.naturaleza === 'acreedora' ? Math.max(0, haber - debe) : 0,
        }
      })

    const totalDebe  = Math.round(cuentas.reduce((s, c) => s + c.total_debe,  0) * 100) / 100
    const totalHaber = Math.round(cuentas.reduce((s, c) => s + c.total_haber, 0) * 100) / 100

    return NextResponse.json({
      cuentas,
      totales: { debe: totalDebe, haber: totalHaber, cuadrado: Math.abs(totalDebe - totalHaber) < 0.01 },
    })
  }

  // ── RESUMEN POR TIPO (Dashboard) ────────────────────────────
  const { data: periodosAnio } = await supabase
    .from('periodos_contables')
    .select('id')
    .eq('empresa_id', empresaId)
    .eq('anio', anio)

  const idsPeriodosAnio = (periodosAnio ?? []).map((p: any) => p.id)

  if (idsPeriodosAnio.length === 0) {
    return NextResponse.json({ resumen: { activo: 0, pasivo: 0, patrimonio: 0, ingreso: 0, costo: 0, gasto: 0 } })
  }

  const { data: saldos } = await supabase
    .from('saldos_mayor')
    .select('saldo_debe, saldo_haber, plan_cuentas!inner(tipo, nivel)')
    .eq('empresa_id', empresaId)
    .in('periodo_id', idsPeriodosAnio)
    .eq('plan_cuentas.nivel', 3)

  const resumen: Record<string, number> = {
    activo: 0, pasivo: 0, patrimonio: 0, ingreso: 0, costo: 0, gasto: 0,
  }

  saldos?.forEach((s: any) => {
    const t = s.plan_cuentas?.tipo
    if (t && resumen[t] !== undefined) {
      resumen[t] = Math.round((resumen[t] + Number(s.saldo_debe) - Number(s.saldo_haber)) * 100) / 100
    }
  })

  return NextResponse.json({ resumen })
}
