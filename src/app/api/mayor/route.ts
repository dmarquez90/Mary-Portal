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

    // Filtramos por la fecha real del asiento (columna `fecha`), no por las
    // columnas redundantes periodo_anio/periodo_mes: estas se calculan una
    // sola vez al insertar y pueden quedar desincronizadas de `fecha` (p.ej.
    // por un bug de zona horaria al calcularlas), lo que hacía que un asiento
    // de marzo apareciera dentro del Mayor de febrero. `fecha` es la única
    // fuente de verdad para decidir a qué período pertenece un movimiento.
    const mesInicio = mes ?? 1
    const mesFin = mes ?? 12
    const fechaInicio = `${anio}-${String(mesInicio).padStart(2, '0')}-01`
    const anioFinExcl = mesFin === 12 ? anio + 1 : anio
    const mesFinExcl = mesFin === 12 ? 1 : mesFin + 1
    const fechaFinExclusiva = `${anioFinExcl}-${String(mesFinExcl).padStart(2, '0')}-01`

    const movQuery = supabase
      .from('asientos_detalle')
      .select(`
        id, debe, haber, descripcion, orden,
        asientos_contables!inner(
          id, numero, fecha, concepto, estado, periodo_anio, periodo_mes
        )
      `)
      .eq('cuenta_id', cuenta_id)
      .eq('asientos_contables.empresa_id', empresaId)
      // Los asientos generados automáticamente por ventas/compras quedan en
      // estado 'aprobado' (no 'contabilizado'); solo excluimos los anulados.
      .neq('asientos_contables.estado', 'anulado')
      .gte('asientos_contables.fecha', fechaInicio)
      .lt('asientos_contables.fecha', fechaFinExclusiva)
      .order('fecha', { referencedTable: 'asientos_contables', ascending: true })
      .order('orden', { ascending: true })

    const { data: movimientos, error } = await movQuery
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      saldo_inicial_debe:  Math.round(saldoInicialDebe  * 100) / 100,
      saldo_inicial_haber: Math.round(saldoInicialHaber * 100) / 100,
      movimientos,
    })
  }

  // ── BALANCE DE COMPROBACIÓN ─────────────────────────────────
  // Se calcula en vivo desde asientos_detalle/asientos_contables vía la
  // función get_libro_mayor(), en vez de la tabla saldos_mayor (que no se
  // llena automáticamente y por eso siempre aparecía vacía).
  if (tipo === 'balance') {
    const { data: filas, error } = await supabase.rpc('get_libro_mayor', {
      p_empresa_id: empresaId,
      p_anio: anio,
      p_mes_inicio: mes ?? 1,
      p_mes_fin: mes ?? 12,
    })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const cuentas = (filas ?? [])
      .map((f: any) => ({
        cuenta_id:      f.cuenta_id,
        codigo_cuenta:  f.codigo,
        nombre:         f.nombre,
        tipo:           f.tipo,
        total_debe:     Math.round(Number(f.total_debe)  * 100) / 100,
        total_haber:    Math.round(Number(f.total_haber) * 100) / 100,
        saldo_deudor:   Math.round(Number(f.saldo_deudor)   * 100) / 100,
        saldo_acreedor: Math.round(Number(f.saldo_acreedor) * 100) / 100,
      }))
      .sort((a: any, b: any) => a.codigo_cuenta.localeCompare(b.codigo_cuenta))

    const totalDebe  = Math.round(cuentas.reduce((s: number, c: any) => s + c.total_debe,  0) * 100) / 100
    const totalHaber = Math.round(cuentas.reduce((s: number, c: any) => s + c.total_haber, 0) * 100) / 100

    return NextResponse.json({
      cuentas,
      totales: { debe: totalDebe, haber: totalHaber, cuadrado: Math.abs(totalDebe - totalHaber) < 0.01 },
    })
  }

  // ── RESUMEN POR TIPO (Dashboard) ────────────────────────────
  // Igual que el balance, se calcula en vivo con get_libro_mayor() para
  // todo el año en vez de depender de saldos_mayor / periodos_contables.
  const { data: filasAnio, error: errorResumen } = await supabase.rpc('get_libro_mayor', {
    p_empresa_id: empresaId,
    p_anio: anio,
    p_mes_inicio: 1,
    p_mes_fin: 12,
  })

  if (errorResumen) return NextResponse.json({ error: errorResumen.message }, { status: 500 })

  const resumen: Record<string, number> = {
    activo: 0, pasivo: 0, patrimonio: 0, ingreso: 0, costo: 0, gasto: 0,
  }

  filasAnio?.forEach((f: any) => {
    if (f.tipo && resumen[f.tipo] !== undefined) {
      resumen[f.tipo] = Math.round((resumen[f.tipo] + Number(f.total_debe) - Number(f.total_haber)) * 100) / 100
    }
  })

  return NextResponse.json({ resumen })
}
