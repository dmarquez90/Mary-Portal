import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { crearAsientoPlanilla } from '@/lib/nomina/asientos'

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
  const { accion, empresa_id, fecha_pago, forma_pago } = body

  const { data: planilla } = await supabase
    .from('planillas')
    .select('*')
    .eq('id', id)
    .single()

  if (!planilla) return NextResponse.json({ error: 'Planilla no encontrada' }, { status: 404 })

  if (accion === 'aprobar') {
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
