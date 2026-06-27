// ============================================================
// SARA ERP — Asientos Automáticos de Tributación
// Genera partida doble al pagar cada obligación fiscal
// LCT Art. 52, 63-64, 87 · Plan Arbitrios Municipal
// ============================================================

// Mapa de cuentas contables tributarias
const COD = {
  CAJA:              '1.1.01',
  BANCO:             '1.1.03',
  IR_ANTICIPADO:     '1.1.10',  // Activo diferido — anticipos IR pagados
  RETENCIONES_FAVOR: '1.1.11',  // Activo — retenciones recibidas de clientes
  IVA_DEBITO:        '2.1.03',  // Pasivo — IVA débito fiscal
  IR_POR_PAGAR:      '2.1.04',  // Pasivo — IR anual a pagar
  ANTICIPOS_PP:      '2.1.05',  // Pasivo — anticipos IR por enterar al fisco
  RETENCIONES_PP:    '2.1.06',  // Pasivo — retenciones IR por enterar
  IMI_POR_PAGAR:     '2.1.15',  // Pasivo — IMI por pagar a alcaldía
  ISC_POR_PAGAR:     '2.1.18',  // Pasivo — ISC por pagar
  GASTO_IMI:         '6.1.18',  // Gasto — IMI impuesto municipal
  GASTO_ISC:         '6.1.21',  // Gasto — ISC
} as const

// ─── Helper: obtener número correlativo de asiento ───────────
async function getNumeroAsiento(
  supabase: any,
  empresaId: string,
  anio: number,
  mes: number
): Promise<{ numero: number; numero_asiento: string }> {
  const { data } = await supabase
    .from('asientos_contables')
    .select('numero')
    .eq('empresa_id', empresaId)
    .eq('periodo_anio', anio)
    .eq('periodo_mes', mes)
    .order('numero', { ascending: false })
    .limit(1)
    .maybeSingle()

  const numero = (data?.numero ?? 0) + 1
  const numero_asiento =
    `AST-${String(anio).padStart(4,'0')}-${String(mes).padStart(2,'0')}-${String(numero).padStart(4,'0')}`
  return { numero, numero_asiento }
}

// ─── Helper: obtener UUID de una cuenta del plan ─────────────
async function getCuentaId(
  supabase: any,
  empresaId: string,
  codigo: string
): Promise<string | null> {
  const { data } = await supabase
    .from('plan_cuentas')
    .select('id')
    .eq('empresa_id', empresaId)
    .eq('codigo', codigo)
    .eq('activa', true)
    .maybeSingle()
  return data?.id ?? null
}

// ─── Helper: insertar asiento + detalle ──────────────────────
async function insertarAsiento(
  supabase: any,
  empresaId: string,
  fecha: string,
  descripcion: string,
  tipo: string,
  refTipo: string,
  refId: string,
  refNum: string,
  lineas: Array<{ codigo: string; debe: number; haber: number; desc: string }>
): Promise<string | null> {
  const fechaDate = new Date(fecha + 'T12:00:00')
  const anio = fechaDate.getFullYear()
  const mes  = fechaDate.getMonth() + 1

  // Resolver UUIDs
  const lineasResueltas = await Promise.all(
    lineas.map(async l => ({
      ...l,
      cuenta_id: await getCuentaId(supabase, empresaId, l.codigo)
    }))
  )

  const lineasValidas = lineasResueltas.filter(l => l.cuenta_id && (l.debe > 0 || l.haber > 0))
  if (lineasValidas.length === 0) return null

  const totalDebe  = round2(lineasValidas.reduce((s, l) => s + l.debe,  0))
  const totalHaber = round2(lineasValidas.reduce((s, l) => s + l.haber, 0))
  if (Math.abs(totalDebe - totalHaber) > 0.01) return null

  const { numero, numero_asiento } = await getNumeroAsiento(supabase, empresaId, anio, mes)

  const { data: asiento, error } = await supabase
    .from('asientos_contables')
    .insert({
      empresa_id:      empresaId,
      fecha,
      descripcion,
      concepto:        descripcion,
      tipo,
      referencia_tipo: refTipo,
      referencia_id:   refId,
      referencia_num:  refNum,
      numero_asiento,
      numero,
      periodo_anio:    anio,
      periodo_mes:     mes,
      estado:          'aprobado',
      total_debe:      totalDebe,
      total_haber:     totalHaber,
    })
    .select('id')
    .single()

  if (error || !asiento) {
    console.error('Error asiento tributario:', error)
    return null
  }

  await supabase.from('asientos_detalle').insert(
    lineasValidas.map((l, i) => ({
      asiento_id:  asiento.id,
      empresa_id:  empresaId,
      cuenta_id:   l.cuenta_id,
      descripcion: l.desc,
      debe:        round2(l.debe),
      haber:       round2(l.haber),
      orden:       i + 1,
    }))
  )

  return asiento.id
}

// ============================================================
// ASIENTO 1: Pago de Anticipo IR mensual
//
//   DB  1.1.10  IR Pagado por Anticipado   = monto
//   CR  1.1.01  Caja / 1.1.03 Banco        = monto
//
// Nota: el anticipo es un activo diferido (prepago de IR),
// no un gasto. Se acredita al IR anual al final del año.
// ============================================================
export async function asientoAnticipoPagado(
  supabase: any,
  empresaId: string,
  anticipo: {
    id: string;
    anio: number;
    mes: number;
    monto_a_pagar: number;
    fecha_pago: string;
    forma_pago?: 'caja' | 'banco';
  }
): Promise<string | null> {
  const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  const per   = `${MESES[anticipo.mes - 1]} ${anticipo.anio}`
  const ctaPago = anticipo.forma_pago === 'caja' ? COD.CAJA : COD.BANCO

  return insertarAsiento(
    supabase, empresaId,
    anticipo.fecha_pago,
    `Anticipo IR ${per} — pago al fisco`,
    'automatico_tributo',
    'anticipo_ir', anticipo.id,
    `ANT-IR-${anticipo.anio}-${String(anticipo.mes).padStart(2,'0')}`,
    [
      { codigo: COD.IR_ANTICIPADO, debe: anticipo.monto_a_pagar, haber: 0, desc: `Anticipo IR ${per}` },
      { codigo: ctaPago,           debe: 0, haber: anticipo.monto_a_pagar,  desc: `Pago anticipo IR ${per}` },
    ]
  )
}

// ============================================================
// ASIENTO 2: IMI — registro del gasto y pasivo, luego pago
//
// Paso A — al calcular el IMI del mes (reconocer obligación):
//   DB  6.1.18  IMI – Impuesto Municipal   = monto
//   CR  2.1.15  IMI por Pagar (Alcaldía)   = monto
//
// Paso B — al marcar pagado (cancelar la deuda):
//   DB  2.1.15  IMI por Pagar              = monto
//   CR  1.1.01  Caja / 1.1.03 Banco        = monto
// ============================================================
export async function asientoImiCalculado(
  supabase: any,
  empresaId: string,
  imi: {
    id: string;
    anio: number;
    mes: number;
    monto_imi: number;
    fecha_vencimiento: string;
  }
): Promise<string | null> {
  const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  const per   = `${MESES[imi.mes - 1]} ${imi.anio}`

  return insertarAsiento(
    supabase, empresaId,
    imi.fecha_vencimiento,
    `IMI Municipal ${per} — reconocimiento`,
    'automatico_tributo',
    'imi', imi.id,
    `IMI-${imi.anio}-${String(imi.mes).padStart(2,'0')}`,
    [
      { codigo: COD.GASTO_IMI,     debe: imi.monto_imi, haber: 0,          desc: `Gasto IMI ${per}` },
      { codigo: COD.IMI_POR_PAGAR, debe: 0,             haber: imi.monto_imi, desc: `IMI por pagar ${per}` },
    ]
  )
}

export async function asientoImiPagado(
  supabase: any,
  empresaId: string,
  imi: {
    id: string;
    anio: number;
    mes: number;
    monto_imi: number;
    fecha_pago: string;
    forma_pago?: 'caja' | 'banco';
  }
): Promise<string | null> {
  const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  const per   = `${MESES[imi.mes - 1]} ${imi.anio}`
  const ctaPago = imi.forma_pago === 'caja' ? COD.CAJA : COD.BANCO

  return insertarAsiento(
    supabase, empresaId,
    imi.fecha_pago,
    `Pago IMI Municipal ${per}`,
    'automatico_tributo',
    'imi', imi.id,
    `PAGO-IMI-${imi.anio}-${String(imi.mes).padStart(2,'0')}`,
    [
      { codigo: COD.IMI_POR_PAGAR, debe: imi.monto_imi, haber: 0,          desc: `Cancelar IMI ${per}` },
      { codigo: ctaPago,           debe: 0,             haber: imi.monto_imi, desc: `Pago IMI alcaldía ${per}` },
    ]
  )
}

// ============================================================
// ASIENTO 3: IR Anual — liquidación final
//
// Al presentar la declaración:
//   DB  2.1.04  IR por Pagar (Renta Anual)  = ir_a_pagar
//   CR  1.1.10  IR Pagado por Anticipado     = anticipos_pagados
//   CR  1.1.11  Retenciones IR a Favor       = retenciones_recibidas
//   CR  2.1.04  IR por Pagar (saldo neto)    = ir_neto_pagar  (si queda saldo)
//
// Al pagar el saldo del IR anual:
//   DB  2.1.04  IR por Pagar                 = ir_neto_pagar
//   CR  1.1.01  Caja / 1.1.03 Banco          = ir_neto_pagar
// ============================================================
export async function asientoIRAnualLiquidacion(
  supabase: any,
  empresaId: string,
  ir: {
    id: string;
    anio_fiscal: number;
    ir_a_pagar: number;
    anticipos_pagados: number;
    retenciones_recibidas: number;
    ir_neto_pagar: number;
    fecha_presentacion: string;
  }
): Promise<string | null> {
  const lineas: Array<{ codigo: string; debe: number; haber: number; desc: string }> = []

  // DÉBITO: reconocer la obligación total de IR
  lineas.push({
    codigo: COD.IR_POR_PAGAR,
    debe: ir.ir_a_pagar, haber: 0,
    desc: `IR anual ${ir.anio_fiscal} — obligación total`
  })

  // CRÉDITO: aplicar anticipos pagados durante el año
  if (ir.anticipos_pagados > 0) {
    lineas.push({
      codigo: COD.IR_ANTICIPADO,
      debe: 0, haber: ir.anticipos_pagados,
      desc: `Anticipos IR ${ir.anio_fiscal} acreditados`
    })
  }

  // CRÉDITO: aplicar retenciones recibidas de clientes
  if (ir.retenciones_recibidas > 0) {
    lineas.push({
      codigo: COD.RETENCIONES_FAVOR,
      debe: 0, haber: ir.retenciones_recibidas,
      desc: `Retenciones IR a favor ${ir.anio_fiscal}`
    })
  }

  // Si hay saldo neto a pagar, queda en 2.1.04 como pasivo pendiente
  // El asiento cuadra: debe = anticipos + retenciones + saldo neto
  if (ir.ir_neto_pagar > 0) {
    lineas.push({
      codigo: COD.IR_POR_PAGAR,
      debe: 0, haber: ir.ir_neto_pagar,
      desc: `Saldo IR anual ${ir.anio_fiscal} pendiente de pago`
    })
  }

  return insertarAsiento(
    supabase, empresaId,
    ir.fecha_presentacion,
    `IR Anual ${ir.anio_fiscal} — liquidación F-106`,
    'automatico_tributo',
    'ir_anual', ir.id,
    `IR-${ir.anio_fiscal}`,
    lineas
  )
}

export async function asientoIRAnualPago(
  supabase: any,
  empresaId: string,
  ir: {
    id: string;
    anio_fiscal: number;
    ir_neto_pagar: number;
    fecha_pago: string;
    forma_pago?: 'caja' | 'banco';
  }
): Promise<string | null> {
  if (ir.ir_neto_pagar <= 0) return null
  const ctaPago = ir.forma_pago === 'caja' ? COD.CAJA : COD.BANCO

  return insertarAsiento(
    supabase, empresaId,
    ir.fecha_pago,
    `Pago IR Anual ${ir.anio_fiscal}`,
    'automatico_tributo',
    'ir_anual', ir.id,
    `PAGO-IR-${ir.anio_fiscal}`,
    [
      { codigo: COD.IR_POR_PAGAR, debe: ir.ir_neto_pagar, haber: 0,               desc: `Cancelar IR anual ${ir.anio_fiscal}` },
      { codigo: ctaPago,          debe: 0,                haber: ir.ir_neto_pagar, desc: `Pago IR anual ${ir.anio_fiscal}` },
    ]
  )
}

// ============================================================
// ASIENTO 4: ISC — igual que IMI pero para ISC
// ============================================================
export async function asientoIscCalculado(
  supabase: any,
  empresaId: string,
  isc: {
    id: string;
    anio: number;
    mes: number;
    monto_isc: number;
    fecha_vencimiento: string;
  }
): Promise<string | null> {
  const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  const per   = `${MESES[isc.mes - 1]} ${isc.anio}`

  return insertarAsiento(
    supabase, empresaId,
    isc.fecha_vencimiento,
    `ISC ${per} — reconocimiento`,
    'automatico_tributo',
    'isc', isc.id,
    `ISC-${isc.anio}-${String(isc.mes).padStart(2,'0')}`,
    [
      { codigo: COD.GASTO_ISC,     debe: isc.monto_isc, haber: 0,           desc: `Gasto ISC ${per}` },
      { codigo: COD.ISC_POR_PAGAR, debe: 0,             haber: isc.monto_isc, desc: `ISC por pagar ${per}` },
    ]
  )
}

export async function asientoIscPagado(
  supabase: any,
  empresaId: string,
  isc: {
    id: string;
    anio: number;
    mes: number;
    monto_isc: number;
    fecha_pago: string;
    forma_pago?: 'caja' | 'banco';
  }
): Promise<string | null> {
  const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  const per   = `${MESES[isc.mes - 1]} ${isc.anio}`
  const ctaPago = isc.forma_pago === 'caja' ? COD.CAJA : COD.BANCO

  return insertarAsiento(
    supabase, empresaId,
    isc.fecha_pago,
    `Pago ISC ${per}`,
    'automatico_tributo',
    'isc', isc.id,
    `PAGO-ISC-${isc.anio}-${String(isc.mes).padStart(2,'0')}`,
    [
      { codigo: COD.ISC_POR_PAGAR, debe: isc.monto_isc, haber: 0,           desc: `Cancelar ISC ${per}` },
      { codigo: ctaPago,           debe: 0,             haber: isc.monto_isc, desc: `Pago ISC ${per}` },
    ]
  )
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
