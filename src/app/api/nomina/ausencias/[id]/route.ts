import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// Anular una ausencia: revierte su efecto en prestaciones_sociales (si
// aplica) y la marca como 'anulado' en vez de borrarla, para no perder
// el rastro de auditoría.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  if (body.accion !== 'anular') {
    return NextResponse.json({ error: "Solo se soporta accion: 'anular'" }, { status: 400 })
  }

  const { data: ausencia, error: errorAusencia } = await supabase
    .from('nomina_ausencias')
    .select('*')
    .eq('id', id)
    .single()
  if (errorAusencia || !ausencia) return NextResponse.json({ error: 'Ausencia no encontrada' }, { status: 404 })
  if (ausencia.estado === 'anulado') {
    return NextResponse.json({ error: 'Esta ausencia ya está anulada' }, { status: 400 })
  }

  if (ausencia.tipo === 'vacacion_descanso' || ausencia.tipo === 'vacacion_pagada') {
    const { data: prest, error: errorPrest } = await supabase
      .from('prestaciones_sociales')
      .select('acum_vacaciones, dias_vacaciones_gozadas, dias_vacaciones_pagadas')
      .eq('empresa_id', ausencia.empresa_id)
      .eq('empleado_id', ausencia.empleado_id)
      .maybeSingle()
    if (errorPrest) return NextResponse.json({ error: errorPrest.message }, { status: 500 })

    if (prest) {
      const campo = ausencia.tipo === 'vacacion_descanso' ? 'dias_vacaciones_gozadas' : 'dias_vacaciones_pagadas'
      const valorActual = ausencia.tipo === 'vacacion_descanso' ? Number(prest.dias_vacaciones_gozadas) : Number(prest.dias_vacaciones_pagadas)

      const { error: errorUpdate } = await supabase
        .from('prestaciones_sociales')
        .update({
          acum_vacaciones: round2(Number(prest.acum_vacaciones) + Number(ausencia.monto)),
          [campo]: round2(Math.max(0, valorActual - Number(ausencia.dias))),
          updated_at: new Date().toISOString(),
        })
        .eq('empresa_id', ausencia.empresa_id)
        .eq('empleado_id', ausencia.empleado_id)
      if (errorUpdate) return NextResponse.json({ error: errorUpdate.message }, { status: 500 })
    }
  }
  // incapacidad_enfermedad no toca prestaciones_sociales, así que anularla
  // no requiere revertir nada más que su propio estado.

  const { data: actualizada, error: errorFinal } = await supabase
    .from('nomina_ausencias')
    .update({ estado: 'anulado', updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (errorFinal) return NextResponse.json({ error: errorFinal.message }, { status: 500 })

  return NextResponse.json(actualizada)
}
