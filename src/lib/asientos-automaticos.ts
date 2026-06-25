// src/lib/asientos-automaticos.ts
// ============================================================
// SARA — Asientos Contables Automáticos
// Genera asientos de partida doble desde ventas y compras
// Basado en Ley 822 LCT y NIIF PYMES
// ============================================================

// Códigos de cuentas estándar del plan predeterminado SARA
// Si el usuario modifica su plan de cuentas, estos códigos deben coincidir
const COD = {
  // Activo
  CAJA:             '1.1.01',
  BANCO_MN:         '1.1.03',
  CXC_CLIENTES:     '1.1.05',
  INVENTARIO:       '1.1.08',
  IVA_CREDITO:      '1.1.09',
  IR_PAGADO:        '1.1.10',
  // Pasivo
  CXP_PROVEEDORES:  '2.1.01',
  IVA_DEBITO:       '2.1.03',
  RETENCION_IR:     '2.1.06',
  // Ingreso
  VENTAS:           '4.1.01',
  DEV_VENTAS:       '4.1.04',
  // Costo
  CMV:              '5.1.01',  // Costo de mercancías vendidas
  COMPRAS:          '5.1.02',
}

interface CuentaRef {
  id: string
  nombre: string
}

type CuentasMap = Record<string, CuentaRef>

/**
 * Obtiene las cuentas del plan por sus códigos
 */
export async function getCuentasPorCodigos(
  supabase: any,
  empresaId: string,
  codigos: string[]
): Promise<CuentasMap> {
  const { data } = await supabase
    .from('plan_cuentas')
    .select('id, codigo, nombre')
    .eq('empresa_id', empresaId)
    .in('codigo', codigos)

  const map: CuentasMap = {}
  data?.forEach((c: any) => { map[c.codigo] = { id: c.id, nombre: c.nombre } })
  return map
}

/**
 * Genera el asiento automático para una VENTA (factura)
 *
 * Débito:  Cuentas por Cobrar / Caja (según forma de pago)
 * Crédito: Ventas de Bienes
 * Crédito: IVA Débito Fiscal 15%
 *
 * Si hay costo de mercancías (inventario):
 * Débito:  Costo de Mercancías Vendidas
 * Crédito: Inventario de Mercancías
 */
export async function crearAsientoVenta(
  supabase: any,
  empresaId: string,
  factura: {
    id: string
    numero: string
    fecha: string
    subtotal: number   // sin IVA
    iva_total: number  // IVA 15%
    total: number
    forma_pago: string // 'contado' | 'credito'
    costo_mercaderia?: number // si maneja costo
  }
) {
  const codigos = [
    COD.CAJA, COD.CXC_CLIENTES, COD.VENTAS, COD.IVA_DEBITO,
    COD.CMV, COD.INVENTARIO,
  ]
  const cuentas = await getCuentasPorCodigos(supabase, empresaId, codigos)

  const cuentaDeudora = factura.forma_pago === 'credito'
    ? cuentas[COD.CXC_CLIENTES]
    : cuentas[COD.CAJA]

  if (!cuentaDeudora || !cuentas[COD.VENTAS]) {
    console.warn('Plan de cuentas incompleto para asiento de venta')
    return null
  }

  const lineas: any[] = [
    // Débito: Caja o CxC (total con IVA)
    {
      cuenta_id: cuentaDeudora.id,
      codigo_cuenta: factura.forma_pago === 'credito' ? COD.CXC_CLIENTES : COD.CAJA,
      nombre_cuenta: cuentaDeudora.nombre,
      debe: factura.total,
      haber: 0,
      descripcion: `Factura ${factura.numero}`,
    },
    // Crédito: Ventas (sin IVA)
    {
      cuenta_id: cuentas[COD.VENTAS].id,
      codigo_cuenta: COD.VENTAS,
      nombre_cuenta: cuentas[COD.VENTAS].nombre,
      debe: 0,
      haber: factura.subtotal,
      descripcion: `Ventas netas — ${factura.numero}`,
    },
  ]

  // Crédito: IVA Débito Fiscal (si hay IVA)
  if (factura.iva_total > 0 && cuentas[COD.IVA_DEBITO]) {
    lineas.push({
      cuenta_id: cuentas[COD.IVA_DEBITO].id,
      codigo_cuenta: COD.IVA_DEBITO,
      nombre_cuenta: cuentas[COD.IVA_DEBITO].nombre,
      debe: 0,
      haber: factura.iva_total,
      descripcion: 'IVA 15% débito fiscal',
    })
  }

  // Si maneja costo de mercadería (inventario perpetuo)
  if (factura.costo_mercaderia && factura.costo_mercaderia > 0 &&
      cuentas[COD.CMV] && cuentas[COD.INVENTARIO]) {
    lineas.push(
      {
        cuenta_id: cuentas[COD.CMV].id,
        codigo_cuenta: COD.CMV,
        nombre_cuenta: cuentas[COD.CMV].nombre,
        debe: factura.costo_mercaderia,
        haber: 0,
        descripcion: 'Costo de mercancías vendidas',
      },
      {
        cuenta_id: cuentas[COD.INVENTARIO].id,
        codigo_cuenta: COD.INVENTARIO,
        nombre_cuenta: cuentas[COD.INVENTARIO].nombre,
        debe: 0,
        haber: factura.costo_mercaderia,
        descripcion: 'Salida de inventario',
      }
    )
  }

  return crearAsiento(supabase, empresaId, {
    fecha: factura.fecha,
    concepto: `Registro venta — Factura ${factura.numero}`,
    tipo: 'automatico_venta',
    referencia_tipo: 'factura',
    referencia_id: factura.id,
    referencia_num: factura.numero,
    lineas,
  })
}

/**
 * Genera el asiento automático para una COMPRA
 *
 * Débito:  Inventario / Gasto de Compras
 * Débito:  IVA Crédito Fiscal 15%
 * Crédito: Cuentas por Pagar Proveedores / Caja
 * Crédito: Retención IR 2% (si proveedor es persona natural)
 */
export async function crearAsientoCompra(
  supabase: any,
  empresaId: string,
  compra: {
    id: string
    numero: string
    fecha: string
    subtotal: number
    iva_total: number
    total: number
    retencion_ir: number   // IR 2% si aplica
    forma_pago: string
    tipo_gasto: 'inventario' | 'gasto' // inventario → activo, gasto → directo
  }
) {
  const codigos = [
    COD.INVENTARIO, COD.IVA_CREDITO, COD.CAJA,
    COD.CXP_PROVEEDORES, COD.RETENCION_IR, COD.COMPRAS,
  ]
  const cuentas = await getCuentasPorCodigos(supabase, empresaId, codigos)

  const cuentaActivo = compra.tipo_gasto === 'inventario'
    ? cuentas[COD.INVENTARIO]
    : cuentas[COD.COMPRAS]

  if (!cuentaActivo) {
    console.warn('Plan de cuentas incompleto para asiento de compra')
    return null
  }

  const montoAPagar = compra.total - compra.retencion_ir
  const cuentaCredito = compra.forma_pago === 'credito'
    ? cuentas[COD.CXP_PROVEEDORES]
    : cuentas[COD.CAJA]

  const lineas: any[] = [
    // Débito: Inventario o Compras (sin IVA)
    {
      cuenta_id: cuentaActivo.id,
      codigo_cuenta: compra.tipo_gasto === 'inventario' ? COD.INVENTARIO : COD.COMPRAS,
      nombre_cuenta: cuentaActivo.nombre,
      debe: compra.subtotal,
      haber: 0,
      descripcion: `Compra — ${compra.numero}`,
    },
  ]

  // Débito: IVA Crédito Fiscal
  if (compra.iva_total > 0 && cuentas[COD.IVA_CREDITO]) {
    lineas.push({
      cuenta_id: cuentas[COD.IVA_CREDITO].id,
      codigo_cuenta: COD.IVA_CREDITO,
      nombre_cuenta: cuentas[COD.IVA_CREDITO].nombre,
      debe: compra.iva_total,
      haber: 0,
      descripcion: 'IVA 15% crédito fiscal',
    })
  }

  // Crédito: CxP o Caja (monto a pagar descontando retención)
  if (cuentaCredito) {
    lineas.push({
      cuenta_id: cuentaCredito.id,
      codigo_cuenta: compra.forma_pago === 'credito' ? COD.CXP_PROVEEDORES : COD.CAJA,
      nombre_cuenta: cuentaCredito.nombre,
      debe: 0,
      haber: montoAPagar,
      descripcion: `Pago/deuda proveedor — ${compra.numero}`,
    })
  }

  // Crédito: Retención IR 2% (si aplica)
  if (compra.retencion_ir > 0 && cuentas[COD.RETENCION_IR]) {
    lineas.push({
      cuenta_id: cuentas[COD.RETENCION_IR].id,
      codigo_cuenta: COD.RETENCION_IR,
      nombre_cuenta: cuentas[COD.RETENCION_IR].nombre,
      debe: 0,
      haber: compra.retencion_ir,
      descripcion: 'Retención IR 2% — Persona Natural (LCT art. 44)',
    })
  }

  return crearAsiento(supabase, empresaId, {
    fecha: compra.fecha,
    concepto: `Registro compra — ${compra.numero}`,
    tipo: 'automatico_compra',
    referencia_tipo: 'compra',
    referencia_id: compra.id,
    referencia_num: compra.numero,
    lineas,
  })
}

/**
 * Función base para crear cualquier asiento
 */
async function crearAsiento(
  supabase: any,
  empresaId: string,
  datos: {
    fecha: string
    concepto: string
    tipo: string
    referencia_tipo?: string
    referencia_id?: string
    referencia_num?: string
    lineas: any[]
  }
) {
  try {
    const totalDebe = datos.lineas.reduce((s, l) => s + (l.debe || 0), 0)
    const totalHaber = datos.lineas.reduce((s, l) => s + (l.haber || 0), 0)

    if (Math.abs(totalDebe - totalHaber) > 0.01) {
      console.error('Asiento automático no cuadra:', { totalDebe, totalHaber })
      return null
    }

    const fechaDate = new Date(datos.fecha)
    const periodo_anio = fechaDate.getFullYear()
    const periodo_mes = fechaDate.getMonth() + 1

    // Generar número
    const { data: numero } = await supabase
      .rpc('next_numero_asiento', { p_empresa_id: empresaId })

    // Insertar asiento
    const { data: asiento, error: errA } = await supabase
      .from('asientos_contables')
      .insert({
        empresa_id: empresaId,
        numero,
        fecha: datos.fecha,
        periodo_anio,
        periodo_mes,
        tipo: datos.tipo,
        concepto: datos.concepto,
        referencia_tipo: datos.referencia_tipo || null,
        referencia_id: datos.referencia_id || null,
        referencia_num: datos.referencia_num || null,
        total_debe: totalDebe,
        total_haber: totalHaber,
        estado: 'contabilizado', // automáticos se contabilizan directo
      })
      .select()
      .single()

    if (errA || !asiento) { console.error(errA); return null }

    // Insertar líneas
    const lineasConIds = datos.lineas.map((l, idx) => ({
      ...l,
      asiento_id: asiento.id,
      empresa_id: empresaId,
      orden: idx,
    }))

    await supabase.from('asientos_detalle').insert(lineasConIds)

    return asiento
  } catch (e) {
    console.error('Error al crear asiento automático:', e)
    return null
  }
}

export { crearAsiento }
