// src/app/api/cxc/reportes/route.ts
// Datos para: Estado de Cuenta por Cliente y Aging Report CxC
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const empresaId = searchParams.get('empresa_id')
  const tipo      = searchParams.get('tipo')      // 'estado_cuenta' | 'aging'
  const clienteId = searchParams.get('cliente_id') // solo para estado_cuenta

  if (!empresaId || !tipo) {
    return NextResponse.json({ error: 'empresa_id y tipo requeridos' }, { status: 400 })
  }

  // ── Datos de la empresa para el encabezado del reporte ──
  const [{ data: empN }, { data: empJ }] = await Promise.all([
    supabase.from('empresas_persona_natural')
      .select('nombre_completo, numero_ruc, direccion, telefono, correo_electronico')
      .eq('user_id', user.id).maybeSingle(),
    supabase.from('empresas_juridicas')
      .select('nombre_empresa, numero_ruc, direccion_legal, correo_electronico')
      .eq('user_id', user.id).maybeSingle(),
  ])
  const empresa = empN
    ? { nombre: empN.nombre_completo, ruc: empN.numero_ruc, direccion: empN.direccion, correo: empN.correo_electronico, telefono: empN.telefono }
    : empJ
    ? { nombre: empJ.nombre_empresa,  ruc: empJ.numero_ruc, direccion: empJ.direccion_legal, correo: empJ.correo_electronico, telefono: null }
    : null

  if (tipo === 'estado_cuenta') {
    // ── Estado de cuenta de UN cliente ──────────────────────
    if (!clienteId) return NextResponse.json({ error: 'cliente_id requerido' }, { status: 400 })

    const { data: cliente } = await supabase
      .from('clientes')
      .select('nombre, ruc, cedula, telefono, correo, direccion')
      .eq('id', clienteId)
      .single()

    // Todos los saldos del cliente (incluyendo pagadas para historial completo)
    const { data: saldos, error } = await supabase
      .from('vista_saldos_cxc')
      .select('*')
      .eq('empresa_id', empresaId)
      .eq('cliente_id', clienteId)
      .order('fecha_emision', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Historial de abonos de este cliente
    const { data: abonos } = await supabase
      .from('abonos_cxc')
      .select('factura_id, fecha, monto, forma_pago, referencia, estado')
      .eq('empresa_id', empresaId)
      .eq('cliente_id', clienteId)
      .eq('estado', 'aplicado')
      .order('fecha', { ascending: true })

    return NextResponse.json({
      tipo: 'estado_cuenta',
      empresa,
      cliente,
      saldos: saldos ?? [],
      abonos: abonos ?? [],
      fecha_reporte: new Date().toISOString().split('T')[0],
    })
  }

  if (tipo === 'aging') {
    // ── Aging Report: toda la cartera agrupada por antigüedad ──
    const { data: saldos, error } = await supabase
      .from('vista_saldos_cxc')
      .select('*, cliente:clientes(nombre, ruc, telefono)')
      .eq('empresa_id', empresaId)
      .neq('estado_cobro', 'pagada')
      .order('dias_vencido', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Agrupar por cliente para el resumen
    const porCliente: Record<string, {
      cliente_id: string
      nombre: string
      ruc: string
      telefono: string
      rango_0_30: number
      rango_31_60: number
      rango_61_90: number
      rango_mas_90: number
      total: number
    }> = {}

    for (const s of saldos ?? []) {
      const cid = s.cliente_id ?? 'sin_cliente'
      if (!porCliente[cid]) {
        porCliente[cid] = {
          cliente_id: cid,
          nombre:    s.cliente?.nombre   ?? 'Sin cliente',
          ruc:       s.cliente?.ruc      ?? '—',
          telefono:  s.cliente?.telefono ?? '—',
          rango_0_30: 0, rango_31_60: 0, rango_61_90: 0, rango_mas_90: 0, total: 0,
        }
      }
      const d = s.dias_vencido ?? 0
      const m = s.saldo_pendiente ?? 0
      if (d <= 30)       porCliente[cid].rango_0_30   += m
      else if (d <= 60)  porCliente[cid].rango_31_60  += m
      else if (d <= 90)  porCliente[cid].rango_61_90  += m
      else               porCliente[cid].rango_mas_90 += m
      porCliente[cid].total += m
    }

    return NextResponse.json({
      tipo: 'aging',
      empresa,
      filas: Object.values(porCliente),
      detalle: saldos ?? [],
      fecha_reporte: new Date().toISOString().split('T')[0],
    })
  }

  return NextResponse.json({ error: 'tipo inválido' }, { status: 400 })
}
