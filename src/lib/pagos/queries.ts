// ============================================================
// SARA App – Queries: Pagos, Caja y Bancos
// src/lib/pagos/queries.ts
// ============================================================
import type {
  CuentaCaja, NuevaCuentaCaja,
  CuentaBanco, NuevaCuentaBanco,
  MovimientoCaja, TransaccionBanco,
  Cheque, Pago, NuevoPago,
  ResumenCaja, ResumenBancos,
  round2,
} from '@/types/pagos'
import { round2 as r2 } from '@/types/pagos'

async function getSupabase() {
  const { createClient } = await import('@/lib/supabase/client')
  return createClient()
}

// ════════════════════════════════════════════════════════════
// CUENTAS CAJA
// ════════════════════════════════════════════════════════════

export async function getCuentasCaja(empresaId: string): Promise<CuentaCaja[]> {
  const supabase = await getSupabase()
  const { data, error } = await supabase
    .from('cuentas_caja')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('activa', true)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map(c => ({ ...c, saldo_actual: r2(c.saldo_actual), saldo_inicial: r2(c.saldo_inicial) }))
}

export async function crearCuentaCaja(data: NuevaCuentaCaja): Promise<CuentaCaja> {
  const supabase = await getSupabase()
  const { data: result, error } = await supabase
    .from('cuentas_caja')
    .insert({
      ...data,
      saldo_inicial: r2(data.saldo_inicial),
      saldo_actual:  r2(data.saldo_inicial),
    })
    .select()
    .single()
  if (error) throw error
  return result
}

// ════════════════════════════════════════════════════════════
// CUENTAS BANCO
// ════════════════════════════════════════════════════════════

export async function getCuentasBanco(empresaId: string): Promise<CuentaBanco[]> {
  const supabase = await getSupabase()
  const { data, error } = await supabase
    .from('cuentas_banco')
    .select('*')
    .eq('empresa_id', empresaId)
    .eq('activa', true)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map(c => ({ ...c, saldo_actual: r2(c.saldo_actual), saldo_inicial: r2(c.saldo_inicial) }))
}

export async function crearCuentaBanco(data: NuevaCuentaBanco): Promise<CuentaBanco> {
  const supabase = await getSupabase()
  const { data: result, error } = await supabase
    .from('cuentas_banco')
    .insert({
      ...data,
      saldo_inicial: r2(data.saldo_inicial),
      saldo_actual:  r2(data.saldo_inicial),
    })
    .select()
    .single()
  if (error) throw error
  return result
}

// ════════════════════════════════════════════════════════════
// MOVIMIENTOS CAJA
// ════════════════════════════════════════════════════════════

export async function getMovimientosCaja(
  empresaId: string,
  opciones?: { desde?: string; hasta?: string; limit?: number }
): Promise<MovimientoCaja[]> {
  const supabase = await getSupabase()
  let query = supabase
    .from('movimientos_caja')
    .select('*, cuenta_caja:cuentas_caja(id, nombre)')
    .eq('empresa_id', empresaId)
    .eq('estado', 'registrado')
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })

  if (opciones?.desde) query = query.gte('fecha', opciones.desde)
  if (opciones?.hasta) query = query.lte('fecha', opciones.hasta)
  if (opciones?.limit) query = query.limit(opciones.limit)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map(m => ({ ...m, monto: r2(m.monto) }))
}

// ════════════════════════════════════════════════════════════
// TRANSACCIONES BANCO
// ════════════════════════════════════════════════════════════

export async function getTransaccionesBanco(
  empresaId: string,
  opciones?: { desde?: string; hasta?: string; limit?: number }
): Promise<TransaccionBanco[]> {
  const supabase = await getSupabase()
  let query = supabase
    .from('transacciones_banco')
    .select('*, cuenta_banco:cuentas_banco(id, nombre, banco)')
    .eq('empresa_id', empresaId)
    .eq('estado', 'registrado')
    .order('fecha', { ascending: false })
    .order('created_at', { ascending: false })

  if (opciones?.desde) query = query.gte('fecha', opciones.desde)
  if (opciones?.hasta) query = query.lte('fecha', opciones.hasta)
  if (opciones?.limit) query = query.limit(opciones.limit)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map(t => ({ ...t, monto: r2(t.monto) }))
}

// ════════════════════════════════════════════════════════════
// CHEQUES
// ════════════════════════════════════════════════════════════

export async function getCheques(
  empresaId: string,
  estado?: string
): Promise<Cheque[]> {
  const supabase = await getSupabase()
  let query = supabase
    .from('cheques')
    .select('*, cuenta_banco:cuentas_banco(id, nombre, banco)')
    .eq('empresa_id', empresaId)
    .order('fecha_emision', { ascending: false })

  if (estado) query = query.eq('estado', estado)

  const { data, error } = await query
  if (error) throw error

  const hoy = new Date()
  return (data ?? []).map(c => ({
    ...c,
    monto: r2(c.monto),
    dias_para_vencer: c.fecha_vencimiento
      ? Math.ceil((new Date(c.fecha_vencimiento).getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24))
      : undefined,
  }))
}

// ════════════════════════════════════════════════════════════
// PAGOS
// ════════════════════════════════════════════════════════════

export async function getPagosPorFactura(facturaId: string): Promise<Pago[]> {
  const supabase = await getSupabase()
  const { data, error } = await supabase
    .from('pagos')
    .select('*')
    .eq('ref_factura_id', facturaId)
    .eq('estado', 'registrado')
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map(p => ({ ...p, monto: r2(p.monto), monto_comision: r2(p.monto_comision) }))
}

export async function getPagosPorCompra(compraId: string): Promise<Pago[]> {
  const supabase = await getSupabase()
  const { data, error } = await supabase
    .from('pagos')
    .select('*')
    .eq('ref_compra_id', compraId)
    .eq('estado', 'registrado')
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map(p => ({ ...p, monto: r2(p.monto), monto_comision: r2(p.monto_comision) }))
}

export async function registrarPago(pago: NuevoPago): Promise<Pago> {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()

  const payload = {
    ...pago,
    monto:          r2(pago.monto),
    comision_pct:   r2(pago.comision_pct ?? 0),
    monto_comision: r2(pago.monto_comision ?? 0),
    created_by:     user?.id,
  }

  const { data, error } = await supabase
    .from('pagos')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function registrarPagosMixtos(
  empresaId: string,
  origen: { ref_factura_id?: string; ref_compra_id?: string },
  pagos: Array<{
    tipo_pago: string
    monto: number
    referencia?: string
    numero_cheque?: string
    comision_pct?: number
  }>
): Promise<Pago[]> {
  const resultados: Pago[] = []
  for (const p of pagos) {
    const monto = r2(p.monto)
    const comision_pct = r2(p.comision_pct ?? 0)
    const monto_comision = r2(monto * comision_pct / 100)

    const pago = await registrarPago({
      empresa_id:     empresaId,
      ...origen,
      tipo_pago:      p.tipo_pago as any,
      monto,
      fecha:          new Date().toISOString().split('T')[0],
      referencia:     p.referencia,
      numero_cheque:  p.numero_cheque,
      comision_pct,
      monto_comision,
    })
    resultados.push(pago)
  }
  return resultados
}

export async function anularPago(pagoId: string): Promise<void> {
  const supabase = await getSupabase()
  const { error } = await supabase
    .from('pagos')
    .update({ estado: 'anulado' })
    .eq('id', pagoId)
  if (error) throw error
}

// ════════════════════════════════════════════════════════════
// RESÚMENES
// ════════════════════════════════════════════════════════════

export async function getResumenCaja(empresaId: string): Promise<ResumenCaja> {
  const supabase = await getSupabase()

  const [cuentas, movHoy] = await Promise.all([
    supabase
      .from('cuentas_caja')
      .select('saldo_actual')
      .eq('empresa_id', empresaId)
      .eq('activa', true),
    supabase
      .from('movimientos_caja')
      .select('tipo, monto')
      .eq('empresa_id', empresaId)
      .eq('estado', 'registrado')
      .eq('fecha', new Date().toISOString().split('T')[0]),
  ])

  const saldo_total   = r2((cuentas.data ?? []).reduce((s, c) => s + Number(c.saldo_actual), 0))
  const ingresos_hoy  = r2((movHoy.data ?? []).filter(m => m.tipo === 'ingreso').reduce((s, m) => s + Number(m.monto), 0))
  const egresos_hoy   = r2((movHoy.data ?? []).filter(m => m.tipo === 'egreso').reduce((s, m) => s + Number(m.monto), 0))

  return {
    total_cuentas:    cuentas.data?.length ?? 0,
    saldo_total,
    ingresos_hoy,
    egresos_hoy,
    movimientos_hoy:  movHoy.data?.length ?? 0,
  }
}

export async function getResumenBancos(empresaId: string): Promise<ResumenBancos> {
  const supabase = await getSupabase()
  const hoy7 = new Date()
  hoy7.setDate(hoy7.getDate() + 7)

  const [cuentas, chequesActivos, chequesPorVencer] = await Promise.all([
    supabase.from('cuentas_banco').select('saldo_actual').eq('empresa_id', empresaId).eq('activa', true),
    supabase.from('cheques').select('id', { count: 'exact' }).eq('empresa_id', empresaId).eq('estado', 'activo'),
    supabase.from('cheques').select('id', { count: 'exact' }).eq('empresa_id', empresaId).eq('estado', 'activo').lte('fecha_vencimiento', hoy7.toISOString().split('T')[0]),
  ])

  return {
    total_cuentas:       cuentas.data?.length ?? 0,
    saldo_total_nio:     r2((cuentas.data ?? []).reduce((s, c) => s + Number(c.saldo_actual), 0)),
    cheques_activos:     chequesActivos.count ?? 0,
    cheques_por_vencer:  chequesPorVencer.count ?? 0,
  }
}
