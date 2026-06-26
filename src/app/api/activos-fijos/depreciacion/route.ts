import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST /api/activos-fijos/depreciacion
// Calcula y registra la depreciación mensual de todos los activos activos
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { empresa_id, anio, mes, periodo_id } = await req.json()
  if (!empresa_id || !anio || !mes) {
    return NextResponse.json({ error: 'empresa_id, anio y mes requeridos' }, { status: 400 })
  }

  // Obtener todos los activos activos que ya iniciaron depreciación
  const fechaCorte = new Date(anio, mes - 1, 1)
  const { data: activos, error: errActivos } = await supabase
    .from('activos_fijos')
    .select('*')
    .eq('empresa_id', empresa_id)
    .eq('estado', 'activo')
    .lte('fecha_inicio_dep', fechaCorte.toISOString().split('T')[0])

  if (errActivos) return NextResponse.json({ error: errActivos.message }, { status: 500 })
  if (!activos?.length) return NextResponse.json({ procesados: 0, mensaje: 'No hay activos para depreciar' })

  const registros = []
  const errores = []

  for (const activo of activos) {
    // Verificar si ya existe depreciación para ese mes
    const { data: existe } = await supabase
      .from('depreciaciones')
      .select('id')
      .eq('activo_id', activo.id)
      .eq('anio', anio)
      .eq('mes', mes)
      .single()

    if (existe) {
      errores.push(`Activo ${activo.codigo}: depreciación ${mes}/${anio} ya existe`)
      continue
    }

    // Calcular depreciación acumulada anterior
    const { data: depAnt } = await supabase
      .from('depreciaciones')
      .select('dep_acumulada_post')
      .eq('activo_id', activo.id)
      .eq('estado', 'contabilizada')
      .order('anio', { ascending: false })
      .order('mes',  { ascending: false })
      .limit(1)
      .single()

    const dep_acumulada_ant = depAnt?.dep_acumulada_post ?? 0

    // Cuota mensual línea recta
    const cuota = Number(((activo.costo_adquisicion - activo.valor_residual) / activo.vida_util_meses).toFixed(2))

    // Verificar que no supere el valor depreciable
    const valorDepreciable = activo.costo_adquisicion - activo.valor_residual
    const cuotaReal = Math.min(cuota, Math.max(0, valorDepreciable - dep_acumulada_ant))

    if (cuotaReal <= 0) {
      // Activo totalmente depreciado
      await supabase.from('activos_fijos').update({ estado: 'depreciado' }).eq('id', activo.id)
      continue
    }

    const dep_acumulada_post = dep_acumulada_ant + cuotaReal
    const valor_en_libros = activo.costo_adquisicion - dep_acumulada_post

    const { data: dep, error: errDep } = await supabase
      .from('depreciaciones')
      .insert({
        empresa_id,
        activo_id: activo.id,
        periodo_id,
        anio,
        mes,
        fecha_dep: new Date(anio, mes - 1, 1).toISOString().split('T')[0],
        cuota_mensual: cuotaReal,
        dep_acumulada_ant,
        dep_acumulada_post,
        valor_en_libros,
        estado: 'calculada'
      })
      .select()
      .single()

    if (errDep) {
      errores.push(`Activo ${activo.codigo}: ${errDep.message}`)
    } else {
      // Actualizar valor en libros del activo
      await supabase
        .from('activos_fijos')
        .update({ valor_en_libros, updated_at: new Date().toISOString() })
        .eq('id', activo.id)

      registros.push(dep)
    }
  }

  return NextResponse.json({
    procesados: registros.length,
    errores,
    depreciaciones: registros
  }, { status: 201 })
}

// GET /api/activos-fijos/depreciacion?empresa_id=&anio=&mes=
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const empresaId = searchParams.get('empresa_id')
  const anio = searchParams.get('anio')
  const mes = searchParams.get('mes')

  if (!empresaId) return NextResponse.json({ error: 'empresa_id requerido' }, { status: 400 })

  let query = supabase
    .from('depreciaciones')
    .select('*, activo:activos_fijos(codigo, nombre, categoria, costo_adquisicion)')
    .eq('empresa_id', empresaId)
    .order('anio', { ascending: false })
    .order('mes', { ascending: false })

  if (anio) query = query.eq('anio', parseInt(anio))
  if (mes) query = query.eq('mes', parseInt(mes))

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
