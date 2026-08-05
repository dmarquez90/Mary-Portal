import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calcularSubsidioIncapacidad } from '@/lib/nomina/calculos'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const empresaId  = searchParams.get('empresa_id')
  const empleadoId = searchParams.get('empleado_id')
  const tipo       = searchParams.get('tipo')
  if (!empresaId) return NextResponse.json({ error: 'empresa_id requerido' }, { status: 400 })

  let query = supabase
    .from('nomina_ausencias')
    .select('*, empleado:empleados(primer_nombre, primer_apellido, salario_base)')
    .eq('empresa_id', empresaId)
    .order('fecha_inicio', { ascending: false })

  if (empleadoId) query = query.eq('empleado_id', empleadoId)
  if (tipo)       query = query.eq('tipo', tipo)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

interface BodyAusencia {
  empresa_id:    string
  empleado_id:   string
  tipo:          'vacacion_descanso' | 'vacacion_pagada' | 'incapacidad_enfermedad'
  fecha_inicio:  string
  fecha_fin:     string
  dias?:         number   // si se omite, se calcula del rango de fechas (inclusive)
  dias_cubiertos_empresa?: number  // solo incapacidad_enfermedad (0-3)
  tasa_pago_dias_espera?:  number  // solo incapacidad_enfermedad (0-1)
  certificado_numero?: string
  notas?: string
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = (await req.json()) as BodyAusencia
  const { empresa_id, empleado_id, tipo, fecha_inicio, fecha_fin } = body

  if (!empresa_id || !empleado_id || !tipo || !fecha_inicio || !fecha_fin) {
    return NextResponse.json({ error: 'empresa_id, empleado_id, tipo, fecha_inicio y fecha_fin son requeridos' }, { status: 400 })
  }
  if (!['vacacion_descanso', 'vacacion_pagada', 'incapacidad_enfermedad'].includes(tipo)) {
    return NextResponse.json({ error: 'tipo inválido' }, { status: 400 })
  }

  const { data: empleado, error: errorEmpleado } = await supabase
    .from('empleados')
    .select('id, salario_base')
    .eq('id', empleado_id)
    .single()
  if (errorEmpleado || !empleado) return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 })

  const { data: prest, error: errorPrest } = await supabase
    .from('prestaciones_sociales')
    .select('acum_vacaciones, dias_vacaciones_acum, dias_vacaciones_gozadas, dias_vacaciones_pagadas')
    .eq('empresa_id', empresa_id)
    .eq('empleado_id', empleado_id)
    .maybeSingle()
  if (errorPrest) return NextResponse.json({ error: errorPrest.message }, { status: 500 })
  if (!prest) {
    return NextResponse.json({ error: 'El empleado no tiene registro de prestaciones sociales. Procese al menos una planilla primero.' }, { status: 400 })
  }

  const salarioDia = round2(Number(empleado.salario_base) / 30)

  // Días: si no vienen explícitos, se calculan del rango (inclusive)
  const msPorDia = 1000 * 60 * 60 * 24
  const diasCalculados = Math.round((new Date(fecha_fin).getTime() - new Date(fecha_inicio).getTime()) / msPorDia) + 1
  const dias = body.dias && body.dias > 0 ? body.dias : diasCalculados
  if (dias <= 0) return NextResponse.json({ error: 'El rango de fechas o los días indicados no son válidos' }, { status: 400 })

  const insertBase = {
    empresa_id,
    empleado_id,
    tipo,
    fecha_inicio,
    fecha_fin,
    dias,
    salario_dia: salarioDia,
    certificado_numero: body.certificado_numero ?? null,
    notas: body.notas ?? null,
    creado_por: user.id,
    estado: 'registrado' as const,
  }

  if (tipo === 'vacacion_descanso' || tipo === 'vacacion_pagada') {
    const diasDisponibles = round2(
      Number(prest.dias_vacaciones_acum) - Number(prest.dias_vacaciones_gozadas) - Number(prest.dias_vacaciones_pagadas)
    )
    if (dias > diasDisponibles) {
      return NextResponse.json({
        error: `No hay suficientes días de vacaciones acumulados. Disponibles: ${diasDisponibles.toFixed(2)}, solicitados: ${dias}`,
      }, { status: 400 })
    }

    const monto = round2(dias * salarioDia)

    const { data: ausencia, error: errorInsert } = await supabase
      .from('nomina_ausencias')
      .insert({ ...insertBase, monto, estado: 'pagado' })
      .select()
      .single()
    if (errorInsert) return NextResponse.json({ error: errorInsert.message }, { status: 500 })

    const nuevoAcumVacaciones = round2(Math.max(0, Number(prest.acum_vacaciones) - monto))
    const campoAActualizar = tipo === 'vacacion_descanso' ? 'dias_vacaciones_gozadas' : 'dias_vacaciones_pagadas'
    const valorActual = tipo === 'vacacion_descanso' ? Number(prest.dias_vacaciones_gozadas) : Number(prest.dias_vacaciones_pagadas)

    const { error: errorUpdate } = await supabase
      .from('prestaciones_sociales')
      .update({
        acum_vacaciones: nuevoAcumVacaciones,
        [campoAActualizar]: round2(valorActual + dias),
        updated_at: new Date().toISOString(),
      })
      .eq('empresa_id', empresa_id)
      .eq('empleado_id', empleado_id)
    if (errorUpdate) return NextResponse.json({ error: errorUpdate.message }, { status: 500 })

    return NextResponse.json({ ausencia, dias_disponibles_restantes: round2(diasDisponibles - dias) }, { status: 201 })
  }

  // incapacidad_enfermedad — no toca prestaciones_sociales; el efecto en las
  // provisiones ocurre al reducir 'dias_trabajados' en la planilla del mes.
  const { diasEspera, diasSubsidiadosInss, subsidioInss, pagoEmpresaDiasEspera } = calcularSubsidioIncapacidad({
    salarioDiario: salarioDia,
    diasIncapacidad: dias,
    diasEsperaCubiertosPorEmpresa: body.dias_cubiertos_empresa ?? 0,
    tasaPagoDiasEspera: body.tasa_pago_dias_espera ?? 0,
  })

  const { data: ausencia, error: errorInsert } = await supabase
    .from('nomina_ausencias')
    .insert({
      ...insertBase,
      monto: pagoEmpresaDiasEspera,
      dias_cubiertos_empresa: body.dias_cubiertos_empresa ?? 0,
      subsidio_inss: subsidioInss,
      estado: 'registrado',
    })
    .select()
    .single()
  if (errorInsert) return NextResponse.json({ error: errorInsert.message }, { status: 500 })

  return NextResponse.json({
    ausencia,
    detalle_subsidio: { diasEspera, diasSubsidiadosInss, subsidioInss, pagoEmpresaDiasEspera },
  }, { status: 201 })
}
