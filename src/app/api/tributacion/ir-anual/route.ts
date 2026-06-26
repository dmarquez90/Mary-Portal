import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

  let payload = { ...body, created_by: user.id }

  if (calcular_automatico) {
    // Calcular automáticamente desde las tablas del sistema
    const fechaInicio = `${anio_fiscal}-01-01`
    const fechaFin = `${anio_fiscal}-12-31`

    // Total ventas (ingresos brutos)
    const { data: ventas } = await supabase
      .from('facturas')
      .select('total, iva_total, subtotal')
      .eq('empresa_id', empresa_id)
      .eq('estado', 'pagada')
      .gte('fecha_emision', fechaInicio)
      .lte('fecha_emision', fechaFin)

    const renta_bruta = ventas?.reduce((s, f) => s + (f.subtotal ?? 0), 0) ?? 0

    // Total compras (costos)
    const { data: compras } = await supabase
      .from('compras')
      .select('total, iva_total, subtotal')
      .eq('empresa_id', empresa_id)
      .eq('estado', 'pagada')
      .gte('fecha_compra', fechaInicio)
      .lte('fecha_compra', fechaFin)

    const costo_ventas = compras?.reduce((s, c) => s + (c.subtotal ?? 0), 0) ?? 0

    // Gastos nómina del año
    const { data: planillas } = await supabase
      .from('planillas')
      .select('total_salarios_brutos, total_inss_patronal, total_inatec')
      .eq('empresa_id', empresa_id)
      .eq('periodo_anio', anio_fiscal)

    const gastos_nomina = planillas?.reduce(
      (s, p) => s + (p.total_salarios_brutos ?? 0) + (p.total_inss_patronal ?? 0) + (p.total_inatec ?? 0), 0
    ) ?? 0

    // Depreciación fiscal del año
    const { data: deps } = await supabase
      .from('depreciaciones')
      .select('cuota_mensual')
      .eq('empresa_id', empresa_id)
      .eq('anio', anio_fiscal)
      .eq('estado', 'contabilizada')

    const depreciacion_fiscal = deps?.reduce((s, d) => s + (d.cuota_mensual ?? 0), 0) ?? 0

    // Anticipos pagados en el año
    const { data: anticipos } = await supabase
      .from('anticipos_ir')
      .select('monto_a_pagar')
      .eq('empresa_id', empresa_id)
      .eq('anio', anio_fiscal)
      .eq('estado', 'pagado')

    const anticipos_pagados = anticipos?.reduce((s, a) => s + (a.monto_a_pagar ?? 0), 0) ?? 0

    // Calcular IR
    const total_costos = costo_ventas + gastos_nomina + depreciacion_fiscal + (body.otros_gastos_deducibles ?? 0)
    const renta_neta = Math.max(0, renta_bruta - total_costos)
    const ir_30 = renta_neta * 0.30
    const pago_minimo = renta_bruta * 0.01
    const ir_a_pagar = Math.max(ir_30, pago_minimo)
    const ir_neto = Math.max(0, ir_a_pagar - anticipos_pagados - (body.retenciones_recibidas ?? 0))

    payload = {
      ...payload,
      fecha_inicio_periodo: fechaInicio,
      fecha_fin_periodo: fechaFin,
      renta_bruta_actividades: renta_bruta,
      costo_ventas,
      gastos_nomina,
      depreciacion_fiscal,
      ir_30_pct: ir_30,
      pago_minimo_definitivo: pago_minimo,
      ir_a_pagar,
      anticipos_pagados,
      ir_neto_pagar: ir_neto,
      estado: 'borrador'
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
