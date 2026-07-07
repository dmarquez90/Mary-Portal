import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { asientoIscCalculado, asientoIscPagado } from '@/lib/tributacion/asientos'

// ISC — Impuesto Selectivo al Consumo (LCT arts. 149-186).
// Declaración mensual sobre la base imponible con la tasa del producto
// (bebidas alcohólicas 10%, cigarrillos 60%, gaseosas 7%, etc.).
// Opera sobre declaraciones_isc; el reconocimiento y pago generan
// asientos con las cuentas 6.1.21 (gasto) y 2.1.18 (por pagar).

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const empresaId = searchParams.get('empresa_id')
  const anio = searchParams.get('anio')
  if (!empresaId) return NextResponse.json({ error: 'empresa_id requerido' }, { status: 400 })

  let query = supabase
    .from('declaraciones_isc')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('anio', { ascending: false })
    .order('mes',  { ascending: false })

  if (anio) query = query.eq('anio', parseInt(anio))

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST: registrar la obligación ISC del mes + asiento de reconocimiento
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { empresa_id, anio, mes, descripcion } = body
  if (!empresa_id || !anio || !mes) {
    return NextResponse.json({ error: 'empresa_id, anio y mes son requeridos' }, { status: 400 })
  }

  const base_imponible = Number(body.base_imponible) || 0
  const tasa           = Number(body.tasa) || 0
  const monto_isc      = Math.round(base_imponible * tasa * 100) / 100

  // Vencimiento: día 15 del mes siguiente (declaración mensual DMI)
  const mesSig  = mes === 12 ? 1 : mes + 1
  const anioSig = mes === 12 ? anio + 1 : anio
  const fecha_vencimiento = `${anioSig}-${String(mesSig).padStart(2, '0')}-15`

  const { data, error } = await supabase
    .from('declaraciones_isc')
    .upsert({
      empresa_id, anio, mes,
      fecha_vencimiento,
      base_imponible,
      tasa,
      monto_isc,
      descripcion: descripcion || null,
      estado: 'pendiente',
    }, { onConflict: 'empresa_id,anio,mes' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Asiento de reconocimiento (DB Gasto ISC / CR ISC por Pagar)
  if (monto_isc > 0) {
    const asientoId = await asientoIscCalculado(supabase, empresa_id, {
      id: data.id,
      anio,
      mes,
      monto_isc,
      fecha_vencimiento,
    })
    if (asientoId) {
      await supabase.from('declaraciones_isc').update({ asiento_id: asientoId }).eq('id', data.id)
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
  const { id, empresa_id, estado, numero_boleta, fecha_pago, forma_pago } = body
  if (!id || !empresa_id) {
    return NextResponse.json({ error: 'id y empresa_id requeridos' }, { status: 400 })
  }

  const { data: isc } = await supabase
    .from('declaraciones_isc').select('*').eq('id', id).single()
  if (!isc) return NextResponse.json({ error: 'Declaración no encontrada' }, { status: 404 })

  const fechaPago = fecha_pago || new Date().toISOString().split('T')[0]
  let asientoId: string | null = null

  const nuevoEstado = estado ?? 'pagado'
  if (nuevoEstado === 'pagado' && isc.estado !== 'pagado' && Number(isc.monto_isc) > 0) {
    asientoId = await asientoIscPagado(supabase, empresa_id, {
      id:         isc.id,
      anio:       isc.anio,
      mes:        isc.mes,
      monto_isc:  Number(isc.monto_isc),
      fecha_pago: fechaPago,
      forma_pago: forma_pago ?? 'banco',
    })
  }

  const { data, error } = await supabase
    .from('declaraciones_isc')
    .update({
      estado:        nuevoEstado,
      fecha_pago:    fechaPago,
      numero_boleta: numero_boleta || null,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ...data, asiento_id: asientoId })
}
