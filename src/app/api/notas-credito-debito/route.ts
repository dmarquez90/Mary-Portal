import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const empresaId = searchParams.get('empresa_id')
  const tipo = searchParams.get('tipo')  // credito | debito
  if (!empresaId) return NextResponse.json({ error: 'empresa_id requerido' }, { status: 400 })

  let query = supabase
    .from('notas_credito_debito')
    .select(`
      *,
      factura:facturas(numero_factura, fecha_emision),
      compra:compras(numero_compra, fecha_compra),
      cliente:clientes(nombre),
      proveedor:proveedores(nombre),
      detalle:detalle_notas(*)
    `)
    .eq('empresa_id', empresaId)
    .order('fecha', { ascending: false })

  if (tipo) query = query.eq('tipo', tipo)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const { empresa_id, tipo, detalles, ...resto } = body

  // Generar número correlativo de nota (usando tabla consecutivos)
  const prefijo = tipo === 'credito' ? 'NC' : 'ND'
  const { data: consec } = await supabase
    .from('consecutivos')
    .select('ultimo, digitos')
    .eq('empresa_id', empresa_id)
    .eq('tipo', `nota_${tipo}`)
    .single()

  let numero = 1
  if (consec) {
    numero = consec.ultimo + 1
    await supabase
      .from('consecutivos')
      .update({ ultimo: numero, updated_at: new Date().toISOString() })
      .eq('empresa_id', empresa_id)
      .eq('tipo', `nota_${tipo}`)
  } else {
    await supabase.from('consecutivos').insert({
      empresa_id, tipo: `nota_${tipo}`, prefijo, digitos: 6, ultimo: 1
    })
  }

  const digitos = consec?.digitos ?? 6
  const numero_nota = `${prefijo}-${String(numero).padStart(digitos, '0')}`

  // Calcular totales desde detalles
  const subtotal = detalles?.reduce((s: number, d: { subtotal?: number }) => s + (d.subtotal ?? 0), 0) ?? resto.subtotal ?? 0
  const iva = detalles?.reduce((s: number, d: { iva?: number }) => s + (d.iva ?? 0), 0) ?? resto.iva ?? 0
  const total = subtotal + iva

  const { data: nota, error: errNota } = await supabase
    .from('notas_credito_debito')
    .insert({ ...resto, empresa_id, tipo, numero_nota, subtotal, iva, total, created_by: user.id })
    .select()
    .single()

  if (errNota) return NextResponse.json({ error: errNota.message }, { status: 500 })

  // Insertar detalles
  if (detalles?.length) {
    const { error: errDet } = await supabase
      .from('detalle_notas')
      .insert(detalles.map((d: Record<string, unknown>) => ({ ...d, nota_id: nota.id })))

    if (errDet) return NextResponse.json({ error: errDet.message }, { status: 500 })
  }

  return NextResponse.json(nota, { status: 201 })
}
