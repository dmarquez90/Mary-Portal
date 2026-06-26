import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const facturaId = searchParams.get('factura_id')
  const empresaId = searchParams.get('empresa_id')
  if (!empresaId) return NextResponse.json({ error: 'empresa_id requerido' }, { status: 400 })

  let query = supabase
    .from('abonos_cxc')
    .select('*, factura:facturas(numero_factura, total), cliente:clientes(nombre)')
    .eq('empresa_id', empresaId)
    .eq('estado', 'aplicado')
    .order('fecha', { ascending: false })

  if (facturaId) query = query.eq('factura_id', facturaId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { empresa_id, factura_id, monto } = body

  // Verificar saldo disponible
  const { data: saldo } = await supabase
    .from('vista_saldos_cxc')
    .select('saldo_pendiente, monto_original')
    .eq('factura_id', factura_id)
    .single()

  if (!saldo) return NextResponse.json({ error: 'Factura no encontrada en CxC' }, { status: 404 })
  if (monto > saldo.saldo_pendiente) {
    return NextResponse.json({
      error: `El abono (${monto}) supera el saldo pendiente (${saldo.saldo_pendiente})`
    }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('abonos_cxc')
    .insert({ ...body, estado: 'aplicado', created_by: user.id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
