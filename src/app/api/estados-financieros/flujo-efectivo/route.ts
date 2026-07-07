import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calcularFlujoEfectivo } from '@/lib/estados-financieros'
import { getEmpresaIdActual } from '@/lib/supabase/empresa-actual'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const empresaId = searchParams.get('empresa_id')
      || await getEmpresaIdActual(supabase, user.id)
    const fechaInicio = searchParams.get('fecha_inicio')
    const fechaFin = searchParams.get('fecha_fin')

    if (!empresaId || !fechaInicio || !fechaFin) {
      return NextResponse.json({ error: 'Parámetros requeridos: empresa_id, fecha_inicio, fecha_fin' }, { status: 400 })
    }

    // RLS (fn_puede_ver_empresa) filtra por membresía en empresa_usuarios,
    // cubriendo dueño original, usuarios invitados y ambos tipos de empresa.
    const [{ data: ej }, { data: en }] = await Promise.all([
      supabase.from('empresas_juridicas').select('nombre_empresa, numero_ruc').eq('id', empresaId).maybeSingle(),
      supabase.from('empresas_persona_natural').select('nombre_completo, numero_ruc').eq('id', empresaId).maybeSingle(),
    ])
    const empresa = ej
      ? { nombre_empresa: ej.nombre_empresa, numero_ruc: ej.numero_ruc }
      : en
      ? { nombre_empresa: en.nombre_completo, numero_ruc: en.numero_ruc }
      : null

    if (!empresa) return NextResponse.json({ error: 'Sin acceso a esta empresa' }, { status: 403 })

    const resultado = await calcularFlujoEfectivo(
      supabase, empresaId, new Date(fechaInicio), new Date(fechaFin)
    )

    const conciliado = Math.abs(resultado.totales.conciliacion) < 0.01

    return NextResponse.json({
      empresa: { nombre: empresa.nombre_empresa, ruc: empresa.numero_ruc },
      periodo: { inicio: fechaInicio, fin: fechaFin },
      ...resultado,
      conciliado,
      alerta_conciliacion: !conciliado
        ? `Diferencia de conciliación: C$ ${resultado.totales.conciliacion.toFixed(2)}`
        : null,
      metadatos: {
        metodo: 'Indirecto',
        norma: 'NIIF PYMES Sección 7',
        generado_en: new Date().toISOString(),
      }
    })
  } catch (error) {
    console.error('Error flujo efectivo:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
