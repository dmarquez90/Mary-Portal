// src/app/api/cxp/abonos/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET: historial de pagos de una compra
export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const compraId  = searchParams.get('compra_id')
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
  return NextResponse.json(data ?? [])
}

// POST: registrar un pago a una compra de crédito
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const {
    empresa_id,
    compra_id,
    proveedor_id,
    monto,
    fecha,
    forma_pago,
    referencia,
    notas,
    cuenta_caja_id,
    cuenta_banco_id,
  } = body

  if (!empresa_id || !compra_id || !monto || !fecha || !forma_pago) {
    return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 })
  }
  const montoNum = Number(monto)
  if (isNaN(montoNum) || montoNum <= 0) {
    return NextResponse.json({ error: 'Monto inválido' }, { status: 400 })
  }

  // ── Verificar saldo disponible ────────────────────────────
  const { data: saldo, error: saldoErr } = await supabase
    .from('vista_saldos_cxp')
    .select('saldo_pendiente, numero_compra')
    .eq('compra_id', compra_id)
    .eq('empresa_id', empresa_id)
    .single()

  if (saldoErr || !saldo) {
    return NextResponse.json({ error: 'Compra no encontrada en CxP' }, { status: 404 })
  }
  if (montoNum > saldo.saldo_pendiente + 0.01) {
    return NextResponse.json({
      error: `El pago (${montoNum.toFixed(2)}) supera el saldo pendiente (${saldo.saldo_pendiente.toFixed(2)})`
    }, { status: 400 })
  }

  // ── Determinar cuenta origen si no vino en el body ───────
  let cuentaCajaId   = cuenta_caja_id   || null
  let cuentaBancoId  = cuenta_banco_id  || null

  if (!cuentaCajaId && !cuentaBancoId) {
    if (forma_pago === 'efectivo') {
      const { data: caja } = await supabase
        .from('cuentas_caja')
        .select('id')
        .eq('empresa_id', empresa_id)
        .eq('tipo', 'caja_general')
        .eq('activa', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      cuentaCajaId = caja?.id ?? null
    } else {
      const { data: banco } = await supabase
        .from('cuentas_banco')
        .select('id')
        .eq('empresa_id', empresa_id)
        .eq('activa', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      cuentaBancoId = banco?.id ?? null
    }
  }

  // ── Insertar abono (el trigger hace lo demás) ─────────────
  const { data, error } = await supabase
    .from('abonos_cxp')
    .insert({
      empresa_id,
      compra_id,
      proveedor_id: proveedor_id || null,
      monto: Math.round(montoNum * 100) / 100,
      fecha,
      forma_pago,
      referencia: referencia || null,
      notas: notas || null,
      estado: 'aplicado',
      cuenta_caja_id:  cuentaCajaId,
      cuenta_banco_id: cuentaBancoId,
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
