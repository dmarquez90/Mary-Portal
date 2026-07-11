import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { asientoAnticipoPagado } from '@/lib/tributacion/asientos'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const empresaId = searchParams.get('empresa_id')
  const anio = searchParams.get('anio')
  if (!empresaId) return NextResponse.json({ error: 'empresa_id requerido' }, { status: 400 })

  let query = supabase
    .from('anticipos_ir')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('anio', { ascending: false })
    .order('mes', { ascending: false })

  if (anio) query = query.eq('anio', parseInt(anio))

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// POST: calcular anticipo del mes (crea o actualiza si ya existe)
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { empresa_id, anio, mes } = body

  // Calcular ingresos brutos del mes desde facturas
  let ingresos = body.ingresos_brutos_mes
  if (!ingresos || ingresos === 0) {
    const fechaInicio = `${anio}-${String(mes).padStart(2, '0')}-01`
    const diasMes = new Date(anio, mes, 0).getDate()
    const fechaFin = `${anio}-${String(mes).padStart(2, '0')}-${diasMes}`

    const { data: facturas } = await supabase
      .from('facturas')
      .select('subtotal')  // base sin IVA para el anticipo
      .eq('empresa_id', empresa_id)
      .in('estado', ['emitida', 'pagada'])
      .gte('fecha_emision', fechaInicio)
      .lte('fecha_emision', fechaFin)

    ingresos = facturas?.reduce((s: number, f: { subtotal: number }) => s + Number(f.subtotal ?? 0), 0) ?? 0
  }

  // FIX auditoría: alícuota PMD configurable por empresa (Ley 987):
  // 1% resto de contribuyentes, 2% principales, 3% grandes.
  let tasa = 0.01
  {
    const [{ data: ej }, { data: en }] = await Promise.all([
      supabase.from('empresas_juridicas').select('pmd_alicuota').eq('id', empresa_id).maybeSingle(),
      supabase.from('empresas_persona_natural').select('pmd_alicuota').eq('id', empresa_id).maybeSingle(),
    ])
    const cfg = Number(ej?.pmd_alicuota ?? en?.pmd_alicuota)
    if (cfg > 0 && cfg <= 0.03) tasa = cfg
  }

  const monto_anticipo  = Math.round(ingresos * tasa * 100) / 100
  const retenciones     = Number(body.retenciones_recibidas ?? 0)
  const monto_a_pagar   = Math.max(0, Math.round((monto_anticipo - retenciones) * 100) / 100)

  // FIX auditoría: el anticipo IR se declara en la DMI dentro de los
  // primeros 15 días del mes siguiente (el plazo de 5 días aplica a las
  // retenciones en la fuente, no al anticipo).
  const mesSig  = mes === 12 ? 1 : mes + 1
  const anioSig = mes === 12 ? anio + 1 : anio
  const fecha_vencimiento = `${anioSig}-${String(mesSig).padStart(2, '0')}-15`

  const { data, error } = await supabase
    .from('anticipos_ir')
    .upsert({
      empresa_id, anio, mes,
      fecha_vencimiento,
      ingresos_brutos_mes:  ingresos,
      tasa,
      monto_anticipo,
      retenciones_recibidas: retenciones,
      monto_a_pagar,
      estado: 'pendiente',
    }, { onConflict: 'empresa_id,anio,mes' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

// PATCH: marcar pagado → actualiza estado Y genera asiento contable
export async function PATCH(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { id, empresa_id, numero_boleta, fecha_pago, forma_pago } = body
  if (!id || !empresa_id) return NextResponse.json({ error: 'id y empresa_id requeridos' }, { status: 400 })

  // Cargar anticipo actual
  const { data: anticipo } = await supabase
    .from('anticipos_ir').select('*').eq('id', id).single()
  if (!anticipo) return NextResponse.json({ error: 'Anticipo no encontrado' }, { status: 404 })
  if (anticipo.estado === 'pagado') return NextResponse.json({ error: 'Anticipo ya marcado como pagado' }, { status: 409 })

  const fechaPago = fecha_pago || new Date().toISOString().split('T')[0]

  // Generar asiento contable del pago
  const asientoId = await asientoAnticipoPagado(supabase, empresa_id, {
    id:            anticipo.id,
    anio:          anticipo.anio,
    mes:           anticipo.mes,
    monto_a_pagar: anticipo.monto_a_pagar,
    fecha_pago:    fechaPago,
    forma_pago:    forma_pago ?? 'banco',
  })

  // Actualizar estado del anticipo
  const { data, error } = await supabase
    .from('anticipos_ir')
    .update({
      estado:            'pagado',
      fecha_pago:        fechaPago,
      fecha_declaracion: fechaPago,
      numero_boleta:     numero_boleta || null,
      asiento_id:        asientoId,
      updated_at:        new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ...data, asiento_id: asientoId })
}
