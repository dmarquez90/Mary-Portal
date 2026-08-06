import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { crearAsientoPlanilla, crearAsientoPagoNomina } from '@/lib/nomina/asientos'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: planilla, error } = await supabase
    .from('planillas')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })

  const { data: detalles } = await supabase
    .from('planilla_detalle')
    .select(`
      *,
      empleado:empleados(
        id, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido,
        numero_inss, cedula, salario_base, regimen_inss,
        cargo:cargos(nombre)
      )
    `)
    .eq('planilla_id', id)
    .order('empleado(primer_apellido)')

  return NextResponse.json({ planilla, detalles })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { accion, empresa_id, fecha_pago, forma_pago, cuenta_caja_id, cuenta_banco_id } = body

  const { data: planilla } = await supabase
    .from('planillas')
    .select('*')
    .eq('id', id)
    .single()

  if (!planilla) return NextResponse.json({ error: 'Planilla no encontrada' }, { status: 404 })

  if (accion === 'aprobar') {
    // crearAsientoPlanilla verifica duplicados internamente (FIX auditoría):
    // si el asiento de devengado ya existe, devuelve el existente.
    const asientoId = await crearAsientoPlanilla(supabase, empresa_id, {
      ...planilla,
      fecha_pago: fecha_pago || planilla.fecha_pago || new Date().toISOString().split('T')[0],
    })

    const { data, error } = await supabase
      .from('planillas')
      .update({
        estado:     'aprobada',
        asiento_id: asientoId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  // FIX auditoría: registrar el pago de la nómina (antes crearAsientoPagoNomina
  // existía pero nunca se llamaba, y el pago no tocaba caja/banco en libros).
  // Ahora también inserta en movimientos_caja/transacciones_banco (según la
  // cuenta específica elegida) para que el saldo_actual de Caja y Bancos
  // refleje el pago, igual que en Ventas/Compras.
  if (accion === 'pagar') {
    if (planilla.estado !== 'aprobada') {
      return NextResponse.json({ error: 'La planilla debe estar aprobada antes de pagarse' }, { status: 409 })
    }
    if (!cuenta_caja_id && !cuenta_banco_id) {
      return NextResponse.json({ error: 'Debe seleccionar una cuenta de caja o banco para el pago' }, { status: 400 })
    }

    const resultado = await crearAsientoPagoNomina(supabase, empresa_id, {
      id:               planilla.id,
      periodo_mes:      planilla.periodo_mes,
      periodo_anio:     planilla.periodo_anio,
      fecha_pago:       fecha_pago || planilla.fecha_pago || new Date().toISOString().split('T')[0],
      total_neto_pagar: Number(planilla.total_neto_pagar ?? 0),
      forma_pago:       forma_pago === 'caja' ? 'caja' : 'banco',
      cuenta_caja_id:   cuenta_caja_id || undefined,
      cuenta_banco_id:  cuenta_banco_id || undefined,
    })

    if (!resultado.ok) {
      return NextResponse.json({ error: resultado.error }, { status: 500 })
    }

    const { data, error } = await supabase
      .from('planillas')
      .update({ estado: 'pagada', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  if (accion === 'marcar_declarada') {
    const { data, error } = await supabase
      .from('planillas')
      .update({ estado: 'declarada', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  }

  return NextResponse.json({ error: 'Accion no valida' }, { status: 400 })
}
