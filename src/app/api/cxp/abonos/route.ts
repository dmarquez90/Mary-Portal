import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const compraId = searchParams.get('compra_id')
  const empresaId = searchParams.get('empresa_id')
  if (!empresaId) return NextResponse.json({ error: 'empresa_id requerido' }, { status: 400 })

  let query = supabase
    .from('abonos_cxp')
    .select('*, compra:compras(numero_compra, total), proveedor:proveedores(nombre)')
    .eq('empresa_id', empresaId)
    .eq('estado', 'aplicado')
    .order('fecha', { ascending: false })

  if (compraId) query = query.eq('compra_id', compraId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { compra_id, monto } = body

  // Verificar saldo pendiente
  const { data: saldo } = await supabase
    .from('vista_saldos_cxp')
    .select('saldo_pendiente')
    .eq('compra_id', compra_id)
    .single()

  if (!saldo) return NextResponse.json({ error: 'Compra no encontrada en CxP' }, { status: 404 })
  if (monto > saldo.saldo_pendiente) {
    return NextResponse.json({
      error: `El abono (${monto}) supera el saldo pendiente (${saldo.saldo_pendiente})`
    }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('abonos_cxp')
    .insert({ ...body, estado: 'aplicado', created_by: user.id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
