import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  calcularEmpleadoPlanilla,
} from '@/lib/nomina/calculos'
import { crearAsientoPlanilla } from '@/lib/nomina/asientos'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const empresaId = searchParams.get('empresa_id')
  if (!empresaId) return NextResponse.json({ error: 'empresa_id requerido' }, { status: 400 })

  const { data, error } = await supabase
    .from('planillas')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('periodo_anio', { ascending: false })
    .order('periodo_mes',  { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { empresa_id, periodo_mes, periodo_anio, fecha_pago, detalles } = body

  // Verificar que no exista planilla para ese período
  const { data: existe } = await supabase
    .from('planillas')
    .select('id')
    .eq('empresa_id', empresa_id)
    .eq('periodo_mes', periodo_mes)
    .eq('periodo_anio', periodo_anio)
    .single()

  if (existe) {
    return NextResponse.json(
      { error: `Ya existe una planilla para ${periodo_mes}/${periodo_anio}` },
      { status: 409 }
    )
  }

  // Calcular totales
  let totales = {
    total_salarios_brutos:    0,
    total_inss_laboral:       0,
    total_inss_patronal:      0,
    total_inatec:             0,
    total_ir_laboral:         0,
    total_otros_descuentos:   0,
    total_neto_pagar:         0,
    total_prov_vacaciones:    0,
    total_prov_aguinaldo:     0,
    total_prov_indemnizacion: 0,
  }

  const detallesCalculados = detalles.map((d: any) => {
    const resultado = calcularEmpleadoPlanilla({
      empleadoId:          d.empleado_id,
      salarioBase:         d.salario_base,
      diasTrabajados:      d.dias_trabajados ?? 30,
      horasExtra:          d.horas_extra ?? 0,
      comisiones:          d.comisiones ?? 0,
      bonificaciones:      d.bonificaciones ?? 0,
      otrosIngresos:       d.otros_ingresos ?? 0,
      adelantos:           d.adelantos ?? 0,
      prestamosInss:       d.prestamos_inss ?? 0,
      otrosDescuentos:     d.otros_descuentos ?? 0,
      regimenInss:         d.regimen_inss ?? 'integral',
      mesActual:           periodo_mes,
      acumBrutoAnteriores: d.acum_bruto_anteriores ?? 0,
      acumINSSAnteriores:  d.acum_inss_anteriores ?? 0,
      acumIRAnteriores:    d.acum_ir_anteriores ?? 0,
    })

    totales.total_salarios_brutos    += resultado.salarioBruto
    totales.total_inss_laboral       += resultado.inssLaboral
    totales.total_inss_patronal      += resultado.inssPatronal
    totales.total_inatec             += resultado.inatec
    totales.total_ir_laboral         += resultado.irLaboral
    totales.total_otros_descuentos   += resultado.otrosDescuentos
    totales.total_neto_pagar         += resultado.netoPagar
    totales.total_prov_vacaciones    += resultado.provVacaciones
    totales.total_prov_aguinaldo     += resultado.provAguinaldo
    totales.total_prov_indemnizacion += resultado.provIndemnizacion

    return {
      empleado_id:        d.empleado_id,
      empresa_id,
      dias_trabajados:    resultado.diasTrabajados,
      horas_extra:        d.horas_extra ?? 0,
      valor_horas_extra:  resultado.valorHorasExtra,
      comisiones:         resultado.comisiones,
      bonificaciones:     resultado.bonificaciones,
      otros_ingresos:     resultado.otrosIngresos,
      salario_base:       resultado.salarioBase,
      salario_bruto:      resultado.salarioBruto,
      inss_laboral:       resultado.inssLaboral,
      inss_patronal:      resultado.inssPatronal,
      inatec:             resultado.inatec,
      ir_laboral:         resultado.irLaboral,
      adelantos:          resultado.adelantos,
      prestamos_inss:     resultado.prestamosInss,
      otros_descuentos:   resultado.otrosDescuentos,
      total_deducciones:  resultado.totalDeducciones,
      neto_pagar:         resultado.netoPagar,
      prov_vacaciones:    resultado.provVacaciones,
      prov_aguinaldo:     resultado.provAguinaldo,
      prov_indemnizacion: resultado.provIndemnizacion,
      base_anual_ir:      (d.acum_bruto_anteriores ?? 0) + resultado.salarioBruto,
    }
  })

  // Redondear totales
  Object.keys(totales).forEach((k) => {
    (totales as any)[k] = Math.round((totales as any)[k] * 100) / 100
  })

  // Crear planilla cabecera
  const { data: planilla, error: errPlan } = await supabase
    .from('planillas')
    .insert({
      empresa_id,
      periodo_mes,
      periodo_anio,
      fecha_pago,
      estado: 'calculada',
      ...totales,
    })
    .select()
    .single()

  if (errPlan || !planilla) {
    return NextResponse.json({ error: errPlan?.message }, { status: 500 })
  }

  // Insertar detalles
  const detallesConPlanilla = detallesCalculados.map((d: any) => ({
    ...d,
    planilla_id: planilla.id,
  }))

  const { error: errDet } = await supabase
    .from('planilla_detalle')
    .insert(detallesConPlanilla)

  if (errDet) {
    await supabase.from('planillas').delete().eq('id', planilla.id)
    return NextResponse.json({ error: errDet.message }, { status: 500 })
  }

  // Actualizar acumulados IR y prestaciones sociales
  for (const d of detallesCalculados) {
    // IR acumulado
    await supabase.from('ir_laboral_acumulado').upsert({
      empresa_id,
      empleado_id:       d.empleado_id,
      anio_fiscal:       periodo_anio,
      mes:               periodo_mes,
      salario_bruto:     d.salario_bruto,
      inss_laboral:      d.inss_laboral,
      renta_gravable:    d.salario_bruto - d.inss_laboral,
      ir_retenido:       d.ir_laboral,
      acum_anual_bruto:  d.base_anual_ir,
    }, { onConflict: 'empresa_id,empleado_id,anio_fiscal,mes' })

    // Prestaciones: fetch → update si existe, insert si es nuevo empleado
    const { data: prest } = await supabase
      .from('prestaciones_sociales')
      .select('acum_vacaciones, acum_aguinaldo, acum_indemnizacion, dias_vacaciones_acum')
      .eq('empresa_id', empresa_id)
      .eq('empleado_id', d.empleado_id)
      .maybeSingle()

    if (prest) {
      await supabase.from('prestaciones_sociales').update({
        acum_vacaciones:      Number(prest.acum_vacaciones)    + d.prov_vacaciones,
        acum_aguinaldo:       Number(prest.acum_aguinaldo)     + d.prov_aguinaldo,
        acum_indemnizacion:   Number(prest.acum_indemnizacion) + d.prov_indemnizacion,
        dias_vacaciones_acum: Number(prest.dias_vacaciones_acum) + (d.dias_trabajados / 30),
        ultimo_periodo_mes:   periodo_mes,
        ultimo_periodo_anio:  periodo_anio,
        updated_at:           new Date().toISOString(),
      })
      .eq('empresa_id', empresa_id)
      .eq('empleado_id', d.empleado_id)
    } else {
      // Primer mes procesado para este empleado: crear registro inicial
      await supabase.from('prestaciones_sociales').insert({
        empresa_id,
        empleado_id:          d.empleado_id,
        acum_vacaciones:      d.prov_vacaciones,
        acum_aguinaldo:       d.prov_aguinaldo,
        acum_indemnizacion:   d.prov_indemnizacion,
        dias_vacaciones_acum: d.dias_trabajados / 30,
        dias_vacaciones_gozadas: 0,
        ultimo_periodo_mes:   periodo_mes,
        ultimo_periodo_anio:  periodo_anio,
      })
    }
  }

  return NextResponse.json({ planilla, detalles: detallesCalculados }, { status: 201 })
}
