// src/app/api/asientos/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Helper: obtener empresa_id del usuario autenticado
async function getEmpresaId(supabase: any, userId: string): Promise<string | null> {
  const [{ data: en }, { data: ej }] = await Promise.all([
    supabase.from('empresas_persona_natural').select('id').eq('user_id', userId).maybeSingle(),
    supabase.from('empresas_juridicas').select('id').eq('user_id', userId).maybeSingle(),
  ])
  return en?.id ?? ej?.id ?? null
}

// GET – Listar asientos (Libro Diario)
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const empresaId = await getEmpresaId(supabase, user.id)
  if (!empresaId) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

  const { searchParams } = new URL(request.url)
  const anio = searchParams.get('anio') ? parseInt(searchParams.get('anio')!) : new Date().getFullYear()
  const mes = searchParams.get('mes') ? parseInt(searchParams.get('mes')!) : null
  const estado = searchParams.get('estado')
  const id = searchParams.get('id')

  if (id) {
    const { data: asiento } = await supabase
      .from('asientos_contables')
      .select('*')
      .eq('id', id)
      .eq('empresa_id', empresaId)
      .single()

    const { data: detalle } = await supabase
      .from('asientos_detalle')
      .select('*')
      .eq('asiento_id', id)
      .order('orden')

    return NextResponse.json({ asiento, detalle })
  }

  let query = supabase
    .from('asientos_contables')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('periodo_anio', anio)
    .order('fecha', { ascending: true })
    .order('numero', { ascending: true })

  if (mes) query = query.eq('periodo_mes', mes)
  if (estado) query = query.eq('estado', estado)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ asientos: data })
}

// POST – Crear asiento (borrador o directamente contabilizado)
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const empresaId = await getEmpresaId(supabase, user.id)
  if (!empresaId) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

  const body = await request.json()
  const { fecha, concepto, tipo = 'manual', referencia_tipo, referencia_id, referencia_num, lineas, contabilizar = false } = body

  if (!fecha || !concepto || !lineas || lineas.length < 2) {
    return NextResponse.json({ error: 'Faltan campos: fecha, concepto y al menos 2 líneas' }, { status: 400 })
  }

  const totalDebe = lineas.reduce((s: number, l: any) => s + (parseFloat(l.debe) || 0), 0)
  const totalHaber = lineas.reduce((s: number, l: any) => s + (parseFloat(l.haber) || 0), 0)

  if (Math.abs(totalDebe - totalHaber) > 0.01) {
    return NextResponse.json({
      error: `El asiento no cuadra. Debe: ${totalDebe.toFixed(2)}, Haber: ${totalHaber.toFixed(2)}`
    }, { status: 400 })
  }

  // Parseamos "YYYY-MM-DD" como texto en vez de `new Date(fecha)`: ese
  // constructor interpreta la fecha en UTC y luego getFullYear()/getMonth()
  // la convierten a la zona horaria local, lo que puede correr el mes hacia
  // atrás (p.ej. "2026-03-01" pasaba a quedar en periodo_mes=2) y desincroniza
  // periodo_anio/periodo_mes de la columna `fecha` guardada.
  const [anioStr, mesStr] = String(fecha).split('-')
  const periodo_anio = parseInt(anioStr, 10)
  const periodo_mes = parseInt(mesStr, 10)

  const { data: periodo } = await supabase
    .from('periodos_contables')
    .select('estado')
    .eq('empresa_id', empresaId)
    .eq('anio', periodo_anio)
    .eq('mes', periodo_mes)
    .single()

  if (periodo?.estado === 'cerrado') {
    return NextResponse.json({ error: `El período ${periodo_mes}/${periodo_anio} está cerrado` }, { status: 400 })
  }

  const { data: seqData, error: seqError } = await supabase
    .rpc('next_numero_asiento', { p_empresa_id: empresaId })

  if (seqError) return NextResponse.json({ error: seqError.message }, { status: 500 })
  const numero = seqData

  const estado = contabilizar ? 'contabilizado' : 'borrador'

  const { data: asiento, error: asientoError } = await supabase
    .from('asientos_contables')
    .insert({
      empresa_id: empresaId,
      numero,
      fecha,
      periodo_anio,
      periodo_mes,
      tipo,
      concepto,
      referencia_tipo: referencia_tipo || null,
      referencia_id: referencia_id || null,
      referencia_num: referencia_num || null,
      total_debe: totalDebe,
      total_haber: totalHaber,
      estado,
      creado_por: user.id,
    })
    .select()
    .single()

  if (asientoError) return NextResponse.json({ error: asientoError.message }, { status: 500 })

  const lineasConIds = lineas.map((l: any, idx: number) => ({
    asiento_id: asiento.id,
    empresa_id: empresaId,
    cuenta_id: l.cuenta_id,
    codigo_cuenta: l.codigo_cuenta,
    nombre_cuenta: l.nombre_cuenta,
    debe: parseFloat(l.debe) || 0,
    haber: parseFloat(l.haber) || 0,
    descripcion: l.descripcion || null,
    orden: idx,
  }))

  const { error: detalleError } = await supabase
    .from('asientos_detalle')
    .insert(lineasConIds)

  if (detalleError) return NextResponse.json({ error: detalleError.message }, { status: 500 })

  return NextResponse.json({ asiento, ok: true })
}

// PATCH – Contabilizar borrador o anular asiento
export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await request.json()
  const { id, action } = body

  if (!id || !action) return NextResponse.json({ error: 'ID y acción requeridos' }, { status: 400 })

  if (action === 'contabilizar') {
    const { data, error } = await supabase
      .from('asientos_contables')
      .update({ estado: 'contabilizado', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ asiento: data, ok: true })
  }

  if (action === 'anular') {
    const { data, error } = await supabase
      .from('asientos_contables')
      .update({
        estado: 'anulado',
        anulado_en: new Date().toISOString(),
        anulado_por: user.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ asiento: data, ok: true })
  }

  return NextResponse.json({ error: 'Acción inválida' }, { status: 400 })
}
