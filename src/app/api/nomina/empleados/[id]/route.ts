import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data, error } = await supabase
    .from('empleados')
    .select(`*, cargo:cargos(id, nombre, departamento)`)
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { salario_base: nuevoSalario, empresa_id } = body

  const { data: actual } = await supabase
    .from('empleados')
    .select('salario_base')
    .eq('id', id)
    .single()

  if (actual && nuevoSalario && actual.salario_base !== nuevoSalario) {
    await supabase.from('historial_salarial').insert({
      empresa_id,
      empleado_id:      id,
      fecha_cambio:     new Date().toISOString().split('T')[0],
      salario_anterior: actual.salario_base,
      salario_nuevo:    nuevoSalario,
      motivo:           body.motivo_cambio_salario || 'Actualizacion',
    })
  }

  const { data, error } = await supabase
    .from('empleados')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data, error } = await supabase
    .from('empleados')
    .update({ estado: 'inactivo', updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
