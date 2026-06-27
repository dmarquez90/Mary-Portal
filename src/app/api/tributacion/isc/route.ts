import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { asientoImiCalculado, asientoImiPagado } from '@/lib/tributacion/asientos'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const empresaId = searchParams.get('empresa_id')
  const anio = searchParams.get('anio')
  if (!empresaId) return NextResponse.json({ error: 'empresa_id requerido' }, { status: 400 })

  let query = supabase
    .from('declaraciones_imi')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('anio', { ascending: false })
    .order('mes',  { ascending: false })

  if (anio) query = query.eq('anio', parseInt(anio))

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST: calcular IMI del mes y registrar obligación + asiento de reconocimiento
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { empresa_id, anio, mes } = body

  let ingresos = body.ingresos_brutos_mes
  if (!ingresos || ingresos === 0) {
    const fechaInicio = `${anio}-${String(mes).padStart(2, '0')}-01`
    const diasMes = new Date(anio, mes, 0).getDate()
    const fechaFin = `${anio}-${String(mes).padStart(2, '0')}-${diasMes}`

    const { data: facturas } = await supabase
      .from('facturas')
      .select('subtotal')
      .eq('empresa_id', empresa_id)
      .in('estado', ['emitida', 'pagada'])
      .gte('fecha_emision', fechaInicio)
      .lte('fecha_emision', fechaFin)

    ingresos = facturas?.reduce((s: number, f: { subtotal: number }) => s + Number(f.subtotal ?? 0), 0) ?? 0
  }

  const tasa      = 0.01
  const monto_imi = Math.round(ingresos * tasa * 100) / 100

  // Vencimiento: día 15 del mes siguiente (Plan Arbitrios Municipal)
  const mesSig  = mes === 12 ? 1 : mes + 1
  const anioSig = mes === 12 ? anio + 1 : anio
  const fecha_vencimiento = `${anioSig}-${String(mesSig).padStart(2, '0')}-15`

  // Upsert declaración IMI
  const { data, error } = await supabase
    .from('declaraciones_imi')
    .upsert({
      empresa_id, anio, mes,
      fecha_vencimiento,
      ingresos_brutos_mes: ingresos,
      tasa,
      monto_imi,
      es_matricula:   body.es_matricula   ?? false,
      monto_matricula: body.monto_matricula ?? 0,
      estado:          'pendiente',
    }, { onConflict: 'empresa_id,anio,mes' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Generar asiento de reconocimiento del gasto IMI (DB Gasto / CR Pasivo)
  if (monto_imi > 0) {
    const asientoId = await asientoImiCalculado(supabase, empresa_id, {
      id: data.id,
      anio,
      mes,
      monto_imi,
      fecha_vencimiento,
    })
    if (asientoId) {
      await supabase.from('declaraciones_imi').update({ notas: `Asiento: ${asientoId}` }).eq('id', data.id)
    }
  }

  return NextResponse.json(data, { status: 201 })
}

// PATCH: marcar pagado → asiento de cancelación del pasivo contra caja/banco
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { id, empresa_id, estado, numero_recibo, numero_boleta, fecha_pago, forma_pago } = body
  if (!id || !empresa_id) {
    // soporte para querystring legacy: /api/tributacion/imi?id=...
    const url = new URL(req.url)
    const qId = url.searchParams.get('id')
    if (!qId) return NextResponse.json({ error: 'id y empresa_id requeridos' }, { status: 400 })
  }

  const { data: imi } = await supabase
    .from('declaraciones_imi').select('*').eq('id', id).single()
  if (!imi) return NextResponse.json({ error: 'Declaración no encontrada' }, { status: 404 })

  const fechaPago = fecha_pago || new Date().toISOString().split('T')[0]
  let asientoId: string | null = null

  // Si se está marcando como pagado, generar asiento de pago
  if (estado === 'pagado' && imi.estado !== 'pagado' && imi.monto_imi > 0) {
    asientoId = await asientoImiPagado(supabase, empresa_id, {
      id:        imi.id,
      anio:      imi.anio,
      mes:       imi.mes,
      monto_imi: imi.monto_imi,
      fecha_pago: fechaPago,
      forma_pago: forma_pago ?? 'banco',
    })
  }

  const { data, error } = await supabase
    .from('declaraciones_imi')
    .update({
      estado:         estado ?? 'pagado',
      fecha_pago:     fechaPago,
      numero_recibo:  numero_recibo || numero_boleta || null,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ...data, asiento_id: asientoId })
}
