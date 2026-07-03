import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calcularBalanceGeneral } from '@/lib/estados-financieros'
import { ValidadorVETCompliance, ValidacionVET } from '@/lib/validaciones/vet-compliance'

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

interface BodyValidacion {
  periodo_desde: string
  periodo_hasta: string
  reportes_a_validar: string[]
  usuario_id: string
}

interface ResultadoReporte {
  codigo: string
  ejecutado: boolean
  validaciones: ValidacionVET[]
  mensaje?: string
}

async function validarPlanillaIngresos(supabase: SupabaseServerClient, empresaId: string, desde: string, hasta: string) {
  const { data: facturas } = await supabase
    .from('facturas')
    .select('subtotal, iva_total')
    .eq('empresa_id', empresaId)
    .gte('fecha_emision', desde)
    .lte('fecha_emision', hasta)
    .in('estado', ['emitida', 'pagada'])

  const filas = facturas ?? []
  const ventasGravadas = filas.filter((f) => Number(f.iva_total) > 0).reduce((acc, f) => acc + Number(f.subtotal), 0)
  const ventasExentas = filas.filter((f) => Number(f.iva_total) === 0).reduce((acc, f) => acc + Number(f.subtotal), 0)
  const libroVentas = filas.map((f) => ({ subtotal: Number(f.subtotal) }))

  return ValidadorVETCompliance.validarPlanillaIngresos(ventasGravadas, ventasExentas, 0, libroVentas)
}

async function validarCreditoIVA(supabase: SupabaseServerClient, empresaId: string, desde: string, hasta: string) {
  const { data: compras } = await supabase
    .from('compras')
    .select('subtotal, iva_total')
    .eq('empresa_id', empresaId)
    .gte('fecha_compra', desde)
    .lte('fecha_compra', hasta)
    .eq('estado', 'recibida')

  const filas = compras ?? []
  const comprasTotal = filas.reduce((acc, c) => acc + Number(c.subtotal), 0)
  const ivaAcreditable = filas.reduce((acc, c) => acc + Number(c.iva_total), 0)

  return ValidadorVETCompliance.validarCreditoFiscalIVA(ivaAcreditable, comprasTotal)
}

async function validarRetencionesIR(supabase: SupabaseServerClient, empresaId: string, desde: string, hasta: string) {
  const { data: compras } = await supabase
    .from('compras')
    .select('subtotal, proveedor:proveedores(tipo_persona)')
    .eq('empresa_id', empresaId)
    .gte('fecha_compra', desde)
    .lte('fecha_compra', hasta)
    .eq('estado', 'recibida')

  const comprasPN = (compras ?? [])
    .filter((c) => (c.proveedor as { tipo_persona?: string } | null)?.tipo_persona === 'natural')
    .reduce((acc, c) => acc + Number(c.subtotal), 0)

  const { data: retenciones } = await supabase
    .from('retenciones_aplicadas')
    .select('monto_retenido')
    .eq('empresa_id', empresaId)
    .gte('fecha_retencion', desde)
    .lte('fecha_retencion', hasta)

  const retencionesIR2 = (retenciones ?? []).reduce((acc, r) => acc + Number(r.monto_retenido), 0)

  return ValidadorVETCompliance.validarRetencionesIR(retencionesIR2, comprasPN)
}

async function validarBalanceGeneral(supabase: SupabaseServerClient, empresaId: string, hasta: string) {
  const resultado = await calcularBalanceGeneral(supabase, empresaId, new Date(hasta))
  const { total_activos, total_pasivos, total_patrimonio } = resultado.totales

  return ValidadorVETCompliance.validarBalanceGeneral(total_activos, 0, total_pasivos, 0, total_patrimonio)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ empresa_id: string }> }) {
  const { empresa_id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = (await req.json()) as BodyValidacion
  const { periodo_desde, periodo_hasta, reportes_a_validar, usuario_id } = body

  if (!periodo_desde || !periodo_hasta || !Array.isArray(reportes_a_validar) || reportes_a_validar.length === 0) {
    return NextResponse.json(
      { error: 'periodo_desde, periodo_hasta y reportes_a_validar son requeridos' },
      { status: 400 }
    )
  }

  const resultados: ResultadoReporte[] = []

  for (const codigo of reportes_a_validar) {
    switch (codigo) {
      case 'PLANILLA_INGRESOS':
        resultados.push({
          codigo,
          ejecutado: true,
          validaciones: await validarPlanillaIngresos(supabase, empresa_id, periodo_desde, periodo_hasta),
        })
        break
      case 'CREDITO_IVA':
        resultados.push({
          codigo,
          ejecutado: true,
          validaciones: await validarCreditoIVA(supabase, empresa_id, periodo_desde, periodo_hasta),
        })
        break
      case 'RETENCIONES_IR':
        resultados.push({
          codigo,
          ejecutado: true,
          validaciones: await validarRetencionesIR(supabase, empresa_id, periodo_desde, periodo_hasta),
        })
        break
      case 'BALANCE_GENERAL':
        resultados.push({
          codigo,
          ejecutado: true,
          validaciones: await validarBalanceGeneral(supabase, empresa_id, periodo_hasta),
        })
        break
      case 'DECLARACION_IVA':
        // TODO: requiere fn_calcular_iva_periodo, que no existe en la base de datos.
        // No se inventa la fórmula fiscal; se deja pendiente hasta que se defina.
        resultados.push({
          codigo,
          ejecutado: false,
          validaciones: [],
          mensaje: 'No implementado: falta fn_calcular_iva_periodo en la base de datos',
        })
        break
      default:
        resultados.push({
          codigo,
          ejecutado: false,
          validaciones: [],
          mensaje: 'Código de reporte no reconocido',
        })
    }
  }

  const todasLasValidaciones = resultados.flatMap((r) => r.validaciones)
  const resumen = ValidadorVETCompliance.generarResumen(todasLasValidaciones)

  const { error: errorEvento } = await supabase.from('auditoría_eventos_vet').insert({
    empresa_id,
    usuario_id: usuario_id ?? user.id,
    tipo_evento: 'validacion_consolidada',
    entidad_afectada: reportes_a_validar.join(','),
    'período_desde': periodo_desde,
    'período_hasta': periodo_hasta,
    detalles: { resultados, resumen },
    es_exitoso: resumen.es_valido,
    errores: todasLasValidaciones.filter((v) => v.tipo === 'error').map((v) => v.mensaje),
    advertencias: todasLasValidaciones.filter((v) => v.tipo === 'warning').map((v) => v.mensaje),
  })
  if (errorEvento) return NextResponse.json({ error: errorEvento.message }, { status: 403 })

  return NextResponse.json({ resultados, resumen })
}
