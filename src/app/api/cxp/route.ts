import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const empresaId = searchParams.get('empresa_id')
  const proveedorId = searchParams.get('proveedor_id')
  const estado = searchParams.get('estado')
  if (!empresaId) return NextResponse.json({ error: 'empresa_id requerido' }, { status: 400 })

  let query = supabase
    .from('vista_saldos_cxp')
    .select('*, proveedor:proveedores(nombre, telefono, correo)')
    .eq('empresa_id', empresaId)
    .order('dias_vencido', { ascending: false })

  if (proveedorId) query = query.eq('proveedor_id', proveedorId)
  if (estado) query = query.eq('estado_pago', estado)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
