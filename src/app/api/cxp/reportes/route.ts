// src/app/api/cxp/reportes/route.ts
// Datos para: Estado de Cuenta por Proveedor y Aging Report CxP
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const empresaId   = searchParams.get('empresa_id')
  const tipo        = searchParams.get('tipo')        // 'estado_cuenta' | 'aging'
  const proveedorId = searchParams.get('proveedor_id')

  if (!empresaId || !tipo) {
    return NextResponse.json({ error: 'empresa_id y tipo requeridos' }, { status: 400 })
  }

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
    if (!proveedorId) return NextResponse.json({ error: 'proveedor_id requerido' }, { status: 400 })

    const { data: proveedor } = await supabase
      .from('proveedores')
      .select('nombre, ruc, telefono, correo, direccion, contacto')
      .eq('id', proveedorId)
      .single()

    const { data: saldos, error } = await supabase
      .from('vista_saldos_cxp')
      .select('*')
      .eq('empresa_id', empresaId)
      .eq('proveedor_id', proveedorId)
      .order('fecha_compra', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const { data: abonos } = await supabase
      .from('abonos_cxp')
      .select('compra_id, fecha, monto, forma_pago, referencia, estado')
      .eq('empresa_id', empresaId)
      .eq('proveedor_id', proveedorId)
      .eq('estado', 'aplicado')
      .order('fecha', { ascending: true })

    return NextResponse.json({
      tipo: 'estado_cuenta',
      empresa,
      proveedor,
      saldos: saldos ?? [],
      abonos: abonos ?? [],
      fecha_reporte: new Date().toISOString().split('T')[0],
    })
  }

  if (tipo === 'aging') {
    const { data: saldos, error } = await supabase
      .from('vista_saldos_cxp')
      .select('*, proveedor:proveedores(nombre, ruc, telefono)')
      .eq('empresa_id', empresaId)
      .neq('estado_pago', 'pagada')
      .order('dias_vencido', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const porProveedor: Record<string, {
      proveedor_id: string
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
      const pid = s.proveedor_id ?? 'sin_proveedor'
      if (!porProveedor[pid]) {
        porProveedor[pid] = {
          proveedor_id: pid,
          nombre:    s.proveedor?.nombre   ?? 'Sin proveedor',
          ruc:       s.proveedor?.ruc      ?? '—',
          telefono:  s.proveedor?.telefono ?? '—',
          rango_0_30: 0, rango_31_60: 0, rango_61_90: 0, rango_mas_90: 0, total: 0,
        }
      }
      const d = s.dias_vencido ?? 0
      const m = s.saldo_pendiente ?? 0
      if (d <= 30)       porProveedor[pid].rango_0_30   += m
      else if (d <= 60)  porProveedor[pid].rango_31_60  += m
      else if (d <= 90)  porProveedor[pid].rango_61_90  += m
      else               porProveedor[pid].rango_mas_90 += m
      porProveedor[pid].total += m
    }

    return NextResponse.json({
      tipo: 'aging',
      empresa,
      filas: Object.values(porProveedor),
      detalle: saldos ?? [],
      fecha_reporte: new Date().toISOString().split('T')[0],
    })
  }

  return NextResponse.json({ error: 'tipo inválido' }, { status: 400 })
}
