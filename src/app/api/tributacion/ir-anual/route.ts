import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { asientoIRAnualLiquidacion, asientoIRAnualPago } from '@/lib/tributacion/asientos'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const empresaId = searchParams.get('empresa_id')
  if (!empresaId) return NextResponse.json({ error: 'empresa_id requerido' }, { status: 400 })

  const { data, error } = await supabase
    .from('declaraciones_ir_anual')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('anio_fiscal', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { empresa_id, anio_fiscal, calcular_automatico } = body

  let payload: Record<string, unknown> = { ...body, created_by: user.id }

  if (calcular_automatico) {
    const fechaInicio = `${anio_fiscal}-01-01`
    const fechaFin   = `${anio_fiscal}-12-31`

    // ── Ingresos brutos: facturas emitidas o pagadas del año ──
    const { data: ventas } = await supabase
      .from('facturas')
      .select('subtotal, iva_total, total')
      .eq('empresa_id', empresa_id)
      .in('estado', ['emitida', 'pagada'])
      .gte('fecha_emision', fechaInicio)
      .lte('fecha_emision', fechaFin)

    const renta_bruta = ventas?.reduce((s, f) => s + Number(f.subtotal ?? 0), 0) ?? 0

    // ── Costo de ventas: compras recibidas/pagadas ────────────
    const { data: compras } = await supabase
      .from('compras')
      .select('subtotal')
      .eq('empresa_id', empresa_id)
      .in('estado', ['recibida', 'pagada'])
      .gte('fecha_compra', fechaInicio)
      .lte('fecha_compra', fechaFin)

    const costo_ventas = compras?.reduce((s, c) => s + Number(c.subtotal ?? 0), 0) ?? 0

    // ── Gastos de nómina del año ──────────────────────────────
    const { data: planillas } = await supabase
      .from('planillas')
      .select('total_salarios_brutos, total_inss_patronal, total_inatec, total_prov_vacaciones, total_prov_aguinaldo, total_prov_indemnizacion')
      .eq('empresa_id', empresa_id)
      .eq('periodo_anio', anio_fiscal)
      .in('estado', ['aprobada', 'pagada', 'declarada'])

    const gastos_nomina = planillas?.reduce((s, p) =>
      s + Number(p.total_salarios_brutos ?? 0)
        + Number(p.total_inss_patronal  ?? 0)
        + Number(p.total_inatec         ?? 0)
        + Number(p.total_prov_vacaciones   ?? 0)
        + Number(p.total_prov_aguinaldo    ?? 0)
        + Number(p.total_prov_indemnizacion ?? 0)
    , 0) ?? 0

    // ── Depreciación fiscal del año ───────────────────────────
    const { data: deps } = await supabase
      .from('depreciaciones')
      .select('cuota_mensual')
      .eq('empresa_id', empresa_id)
      .eq('anio', anio_fiscal)

    const depreciacion_fiscal = deps?.reduce((s, d) => s + Number(d.cuota_mensual ?? 0), 0) ?? 0

    // ── IMI pagado del año (deducible como gasto municipal) ───
    const { data: imis } = await supabase
      .from('declaraciones_imi')
      .select('monto_imi')
      .eq('empresa_id', empresa_id)
      .eq('anio', anio_fiscal)
      .eq('estado', 'pagado')

    const gastos_ventas = imis?.reduce((s, i) => s + Number(i.monto_imi ?? 0), 0) ?? 0

    // ── Anticipos pagados (para acreditar) ────────────────────
    const { data: anticipos } = await supabase
      .from('anticipos_ir')
      .select('monto_a_pagar')
      .eq('empresa_id', empresa_id)
      .eq('anio', anio_fiscal)
      .eq('estado', 'pagado')

    const anticipos_pagados = anticipos?.reduce((s, a) => s + Number(a.monto_a_pagar ?? 0), 0) ?? 0

    // ── Retenciones recibidas de clientes (2% sobre ventas) ───
    // Estas son las retenciones que los clientes nos aplicaron al pagarnos
    const retenciones_recibidas = body.retenciones_recibidas ?? 0

    // ── Otros gastos deducibles (manual) ─────────────────────
    const otros_gastos = Number(body.otros_gastos_deducibles ?? 0)
    const gastos_admin  = Number(body.gastos_administracion  ?? 0)
    const gastos_financ = Number(body.gastos_financieros     ?? 0)

    // ── Cálculo F-106 (LCT Art. 35-43, 52, 55) ───────────────
    const total_costos_gastos =
      costo_ventas       +  // Costo de Mercancías Vendidas
      gastos_nomina      +  // Sueldos, INSS patronal, INATEC, prestaciones
      depreciacion_fiscal+  // Depreciación fiscal LCT Art. 45
      gastos_ventas      +  // IMI y otros gastos de ventas
      gastos_admin       +  // Gastos de administración
      gastos_financ      +  // Gastos financieros
      otros_gastos          // Otros deducibles

    const renta_neta_gravable = Math.max(0, renta_bruta - total_costos_gastos)
    const ir_30_pct           = round2(renta_neta_gravable * 0.30)
    const pago_minimo         = round2(renta_bruta * 0.01) // PMD Art. 61 LCT
    const ir_a_pagar          = Math.max(ir_30_pct, pago_minimo)
    const ir_neto_pagar       = Math.max(0, round2(ir_a_pagar - anticipos_pagados - retenciones_recibidas))

    payload = {
      empresa_id,
      anio_fiscal,
      fecha_inicio_periodo:       fechaInicio,
      fecha_fin_periodo:          fechaFin,
      renta_bruta_actividades:    round2(renta_bruta),
      otras_rentas_gravables:     0,
      costo_ventas:               round2(costo_ventas),
      gastos_administracion:      round2(gastos_admin),
      gastos_ventas:              round2(gastos_ventas),
      gastos_financieros:         round2(gastos_financ),
      depreciacion_fiscal:        round2(depreciacion_fiscal),
      gastos_nomina:              round2(gastos_nomina),
      otros_gastos_deducibles:    round2(otros_gastos),
      ir_30_pct:                  ir_30_pct,
      pago_minimo_definitivo:     pago_minimo,
      ir_a_pagar:                 round2(ir_a_pagar),
      anticipos_pagados:          round2(anticipos_pagados),
      retenciones_recibidas:      round2(retenciones_recibidas),
      ir_neto_pagar:              ir_neto_pagar,
      estado:                     'borrador',
      created_by:                 user.id,
    }
  }

  const { data, error } = await supabase
    .from('declaraciones_ir_anual')
    .upsert(payload, { onConflict: 'empresa_id,anio_fiscal' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

// PATCH: presentar o pagar el IR anual → genera asiento
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { id, accion, empresa_id, fecha_presentacion, fecha_pago, numero_declaracion, forma_pago } = body

  const { data: decl } = await supabase
    .from('declaraciones_ir_anual').select('*').eq('id', id).single()
  if (!decl) return NextResponse.json({ error: 'Declaración no encontrada' }, { status: 404 })

  let asientoId: string | null = null
  let updateData: Record<string, unknown> = {}

  if (accion === 'presentar') {
    // Genera asiento de liquidación (cruzar anticipos contra IR a pagar)
    asientoId = await asientoIRAnualLiquidacion(supabase, empresa_id, {
      id: decl.id,
      anio_fiscal:            decl.anio_fiscal,
      ir_a_pagar:             decl.ir_a_pagar,
      anticipos_pagados:      decl.anticipos_pagados,
      retenciones_recibidas:  decl.retenciones_recibidas,
      ir_neto_pagar:          decl.ir_neto_pagar,
      fecha_presentacion:     fecha_presentacion || new Date().toISOString().split('T')[0],
    })
    updateData = {
      estado: 'presentada',
      fecha_presentacion: fecha_presentacion || new Date().toISOString().split('T')[0],
      numero_declaracion: numero_declaracion || null,
    }
  } else if (accion === 'pagar') {
    // Genera asiento de pago del saldo neto
    asientoId = await asientoIRAnualPago(supabase, empresa_id, {
      id: decl.id,
      anio_fiscal:    decl.anio_fiscal,
      ir_neto_pagar:  decl.ir_neto_pagar,
      fecha_pago:     fecha_pago || new Date().toISOString().split('T')[0],
      forma_pago:     forma_pago ?? 'banco',
    })
    updateData = {
      estado: 'pagada',
      fecha_pago: fecha_pago || new Date().toISOString().split('T')[0],
    }
  } else {
    return NextResponse.json({ error: 'Acción no válida. Use: presentar | pagar' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('declaraciones_ir_anual')
    .update({ ...updateData, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ...data, asiento_id: asientoId })
}

function round2(n: number): number { return Math.round(n * 100) / 100 }
