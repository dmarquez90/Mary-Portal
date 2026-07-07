import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calcularBalanceGeneral } from '@/lib/estados-financieros'
import { getEmpresaIdActual } from '@/lib/supabase/empresa-actual'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const empresaId = searchParams.get('empresa_id')
      || await getEmpresaIdActual(supabase, user.id)
    const fechaCorte = searchParams.get('fecha_corte')

    if (!empresaId || !fechaCorte) {
      return NextResponse.json({ error: 'Parámetros requeridos: empresa_id, fecha_corte' }, { status: 400 })
    }

    // La RLS de empresas_juridicas/empresas_persona_natural (fn_puede_ver_empresa)
    // ya solo devuelve la fila si el usuario pertenece a esa empresa vía
    // empresa_usuarios -- esto cubre tanto al dueño original como a usuarios
    // invitados (contador, auxiliar, etc.), y ambos tipos de empresa.
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

    const corte = new Date(fechaCorte)
    const resultado = await calcularBalanceGeneral(supabase, empresaId, corte)
    const cuadrado = Math.abs(resultado.totales.diferencia_cuadre) < 0.01

    return NextResponse.json({
      empresa: { nombre: empresa.nombre_empresa, ruc: empresa.numero_ruc },
      fecha_corte: fechaCorte,
      ...resultado,
      cuadrado,
      alerta_cuadre: !cuadrado
        ? `Diferencia de C$ ${resultado.totales.diferencia_cuadre.toFixed(2)} - Revisar asientos contables`
        : null,
      metadatos: {
        norma: 'NIIF PYMES Sección 4',
        referencia_fiscal: 'LCT Art. 103-110, Ley 562 Art. 69',
        moneda: 'Córdobas (C$)',
        generado_en: new Date().toISOString(),
      }
    })
  } catch (error) {
    console.error('Error balance general:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await req.json()
    const { fecha_corte, notas } = body
    const empresa_id = body.empresa_id
      || await getEmpresaIdActual(supabase, user.id)
    if (!empresa_id) return NextResponse.json({ error: 'Sin empresa activa' }, { status: 400 })

    const resultado = await calcularBalanceGeneral(supabase, empresa_id, new Date(fecha_corte))

    const { data, error } = await supabase
      .from('estados_financieros_guardados')
      .insert({
        empresa_id,
        tipo_estado: 'balance_general',
        fecha_inicio: fecha_corte,
        fecha_fin: fecha_corte,
        datos_json: resultado,
        total_activos: resultado.totales.total_activos,
        total_pasivos: resultado.totales.total_pasivos,
        total_patrimonio: resultado.totales.total_patrimonio,
        generado_por: user.id,
        notas,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ id: data.id, ...resultado }, { status: 201 })
  } catch (error) {
    console.error('Error guardando balance general:', error)
    return NextResponse.json({ error: 'Error al guardar' }, { status: 500 })
  }
}
