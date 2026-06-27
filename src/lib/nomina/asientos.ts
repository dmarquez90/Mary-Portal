// ============================================================
// SARA ERP — Asientos Automáticos de Nómina
// Genera partida doble completa al aprobar planilla
// Ley 539 · LCT · NIIF PYMES
// ============================================================

// Códigos de cuentas del plan SARA para nómina
const COD_NOMINA = {
  // Gastos (Débito al registrar planilla)
  SUELDOS:           '6.1.01',
  INSS_PATRONAL_GTO: '6.1.02',
  INATEC_GTO:        '6.1.03',
  VACACIONES_GTO:    '6.1.04',
  AGUINALDO_GTO:     '6.1.05',
  INDEMNIZACION_GTO: '6.1.06',

  // Pasivos (Crédito al registrar planilla)
  SUELDOS_POR_PAGAR: '2.1.10',
  INSS_LABORAL_PP:   '2.1.08',
  INSS_PATRONAL_PP:  '2.1.07',
  INATEC_PP:         '2.1.09',
  IR_LABORAL_PP:     '2.1.11',
  VACACIONES_PP:     '2.1.12',
  AGUINALDO_PP:      '2.1.13',
  INDEMNIZACION_PP:  '2.1.14',

  // Activo (Débito al pagar nómina)
  BANCO_MN: '1.1.03',
  CAJA:     '1.1.01',
} as const

interface CuentaRef { id: string; nombre: string }
type CuentasMap = Record<string, CuentaRef>

async function getCuentas(
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

// Genera número correlativo de asiento
async function getNextNumeroAsiento(
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
  const numero_asiento = `AST-${String(anio).padStart(4,'0')}-${String(mes).padStart(2,'0')}-${String(numero).padStart(4,'0')}`
  return { numero, numero_asiento }
}

async function crearAsiento(
  supabase: any,
  empresaId: string,
  datos: {
    fecha:           string
    descripcion:     string
    tipo:            string
    referencia_tipo: string
    referencia_id:   string
    referencia_num:  string
    anio:            number
    mes:             number
    lineas: Array<{
      cuenta_id:   string
      descripcion: string
      debe:        number
      haber:       number
    }>
  }
) {
  // Verificar balance
  const totalDebe  = datos.lineas.reduce((s, l) => s + (l.debe  || 0), 0)
  const totalHaber = datos.lineas.reduce((s, l) => s + (l.haber || 0), 0)

  if (Math.abs(totalDebe - totalHaber) > 0.01) {
    console.error('Asiento nómina no cuadra:', { totalDebe, totalHaber })
    return null
  }

  const { numero, numero_asiento } = await getNextNumeroAsiento(
    supabase, empresaId, datos.anio, datos.mes
  )

  // FIX 1: estado = 'aprobado' (no 'activo')
  // FIX 2: descripcion es required, concepto es opcional
  const { data: asiento, error } = await supabase
    .from('asientos_contables')
    .insert({
      empresa_id:      empresaId,
      fecha:           datos.fecha,
      descripcion:     datos.descripcion,          // NOT NULL — requerido
      concepto:        datos.descripcion,          // opcional, mismo valor
      tipo:            datos.tipo,
      referencia_tipo: datos.referencia_tipo,
      referencia_id:   datos.referencia_id,
      referencia_num:  datos.referencia_num,
      numero_asiento,
      numero,
      periodo_anio:    datos.anio,
      periodo_mes:     datos.mes,
      estado:          'aprobado',                 // FIX 1: valor válido
      total_debe:      round2(totalDebe),
      total_haber:     round2(totalHaber),
    })
    .select('id')
    .single()

  if (error || !asiento) {
    console.error('Error creando asiento nómina:', error)
    return null
  }

  // FIX 2: solo columnas que existen en asientos_detalle
  // (sin codigo_cuenta ni nombre_cuenta)
  const detalles = datos.lineas.map((l, i) => ({
    asiento_id:  asiento.id,
    empresa_id:  empresaId,
    cuenta_id:   l.cuenta_id,
    debe:        round2(l.debe  || 0),
    haber:       round2(l.haber || 0),
    descripcion: l.descripcion,
    orden:       i + 1,
  }))

  const { error: errDet } = await supabase
    .from('asientos_detalle')
    .insert(detalles)

  if (errDet) {
    console.error('Error insertando detalle asiento nómina:', errDet)
    // Revertir cabecera
    await supabase.from('asientos_contables').delete().eq('id', asiento.id)
    return null
  }

  return asiento.id
}

// ─── ASIENTO 1: Registro de Planilla (Devengado) ─────────────
/**
 * DÉBITO:
 *   6.1.01 Sueldos y Salarios             = total_salarios_brutos
 *   6.1.02 INSS Patronal (gasto)          = total_inss_patronal
 *   6.1.03 INATEC (gasto)                 = total_inatec
 *   6.1.04 Vacaciones (provisión)         = total_prov_vacaciones
 *   6.1.05 Aguinaldo (provisión)          = total_prov_aguinaldo
 *   6.1.06 Indemnización (provisión)      = total_prov_indemnizacion
 *
 * CRÉDITO:
 *   2.1.10 Sueldos y Salarios por Pagar   = total_neto_pagar
 *   2.1.08 INSS Laboral por Pagar         = total_inss_laboral
 *   2.1.07 INSS Patronal por Pagar        = total_inss_patronal
 *   2.1.09 INATEC por Pagar               = total_inatec
 *   2.1.11 IR Laboral por Enterar         = total_ir_laboral
 *   2.1.12 Vacaciones por Pagar           = total_prov_vacaciones
 *   2.1.13 Aguinaldo por Pagar            = total_prov_aguinaldo
 *   2.1.14 Indemnización por Pagar        = total_prov_indemnizacion
 */
export async function crearAsientoPlanilla(
  supabase: any,
  empresaId: string,
  planilla: {
    id:                       string
    periodo_mes:              number
    periodo_anio:             number
    fecha_pago:               string
    total_salarios_brutos:    number
    total_inss_laboral:       number
    total_inss_patronal:      number
    total_inatec:             number
    total_ir_laboral:         number
    total_neto_pagar:         number
    total_prov_vacaciones:    number
    total_prov_aguinaldo:     number
    total_prov_indemnizacion: number
  }
) {
  const codigos = Object.values(COD_NOMINA)
  const cuentas = await getCuentas(supabase, empresaId, codigos)

  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
  const p    = planilla
  const per  = `${meses[p.periodo_mes - 1]} ${p.periodo_anio}`
  const lineas: Array<{ cuenta_id: string; descripcion: string; debe: number; haber: number }> = []

  function add(codigo: string, debe: number, haber: number, desc: string) {
    const cuenta = cuentas[codigo]
    if (!cuenta) { console.warn(`Cuenta ${codigo} no encontrada en plan`); return }
    if (debe === 0 && haber === 0) return
    lineas.push({ cuenta_id: cuenta.id, descripcion: desc, debe: round2(debe), haber: round2(haber) })
  }

  // ── DÉBITOS ────────────────────────────────────────────────
  add(COD_NOMINA.SUELDOS,           p.total_salarios_brutos,    0, `Planilla sueldos ${per}`)
  add(COD_NOMINA.INSS_PATRONAL_GTO, p.total_inss_patronal,      0, `INSS Patronal 22.5% — ${per}`)
  add(COD_NOMINA.INATEC_GTO,        p.total_inatec,             0, `INATEC 2% — ${per}`)

  if (p.total_prov_vacaciones    > 0) add(COD_NOMINA.VACACIONES_GTO,    p.total_prov_vacaciones,    0, `Prov. vacaciones ${per}`)
  if (p.total_prov_aguinaldo     > 0) add(COD_NOMINA.AGUINALDO_GTO,     p.total_prov_aguinaldo,     0, `Prov. aguinaldo ${per}`)
  if (p.total_prov_indemnizacion > 0) add(COD_NOMINA.INDEMNIZACION_GTO, p.total_prov_indemnizacion, 0, `Prov. indemnización ${per}`)

  // ── CRÉDITOS ───────────────────────────────────────────────
  add(COD_NOMINA.SUELDOS_POR_PAGAR, 0, p.total_neto_pagar,         `Neto a pagar empleados ${per}`)
  add(COD_NOMINA.INSS_LABORAL_PP,   0, p.total_inss_laboral,       `INSS Laboral 7% retenido ${per}`)
  add(COD_NOMINA.INSS_PATRONAL_PP,  0, p.total_inss_patronal,      `INSS Patronal 22.5% por enterar ${per}`)
  add(COD_NOMINA.INATEC_PP,         0, p.total_inatec,             `INATEC 2% por enterar ${per}`)

  if (p.total_ir_laboral         > 0) add(COD_NOMINA.IR_LABORAL_PP,     0, p.total_ir_laboral,         `IR Laboral retenido ${per}`)
  if (p.total_prov_vacaciones    > 0) add(COD_NOMINA.VACACIONES_PP,     0, p.total_prov_vacaciones,    `Prov. vacaciones por pagar ${per}`)
  if (p.total_prov_aguinaldo     > 0) add(COD_NOMINA.AGUINALDO_PP,      0, p.total_prov_aguinaldo,     `Prov. aguinaldo por pagar ${per}`)
  if (p.total_prov_indemnizacion > 0) add(COD_NOMINA.INDEMNIZACION_PP,  0, p.total_prov_indemnizacion, `Prov. indemnización por pagar ${per}`)

  return crearAsiento(supabase, empresaId, {
    fecha:           p.fecha_pago,
    descripcion:     `Planilla de sueldos — ${per}`,
    tipo:            'automatico_nomina',
    referencia_tipo: 'planilla',
    referencia_id:   p.id,
    referencia_num:  `PLAN-${p.periodo_anio}-${String(p.periodo_mes).padStart(2,'0')}`,
    anio:            p.periodo_anio,
    mes:             p.periodo_mes,
    lineas,
  })
}

// ─── ASIENTO 2: Pago de Nómina ───────────────────────────────
/**
 * Cancela Sueldos por Pagar contra Banco o Caja.
 *
 * DÉBITO:  2.1.10 Sueldos y Salarios por Pagar = total_neto_pagar
 * CRÉDITO: 1.1.03 Banco Moneda Nacional         = total_neto_pagar
 *        ó 1.1.01 Caja General
 */
export async function crearAsientoPagoNomina(
  supabase: any,
  empresaId: string,
  planilla: {
    id:               string
    periodo_mes:      number
    periodo_anio:     number
    fecha_pago:       string
    total_neto_pagar: number
    forma_pago:       'banco' | 'caja'
  }
) {
  const ctaCreditoCod = planilla.forma_pago === 'banco' ? COD_NOMINA.BANCO_MN : COD_NOMINA.CAJA
  const codigos = [COD_NOMINA.SUELDOS_POR_PAGAR, ctaCreditoCod]
  const cuentas = await getCuentas(supabase, empresaId, codigos)

  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
  const per = `${meses[planilla.periodo_mes - 1]} ${planilla.periodo_anio}`

  const ctaSueldos = cuentas[COD_NOMINA.SUELDOS_POR_PAGAR]
  const ctaPago    = cuentas[ctaCreditoCod]

  if (!ctaSueldos || !ctaPago) {
    console.error('Cuentas de pago de nómina no encontradas')
    return null
  }

  const lineas = [
    {
      cuenta_id:   ctaSueldos.id,
      descripcion: `Cancelación sueldos por pagar ${per}`,
      debe:        round2(planilla.total_neto_pagar),
      haber:       0,
    },
    {
      cuenta_id:   ctaPago.id,
      descripcion: `Pago nómina ${per} — ${planilla.forma_pago}`,
      debe:        0,
      haber:       round2(planilla.total_neto_pagar),
    },
  ]

  return crearAsiento(supabase, empresaId, {
    fecha:           planilla.fecha_pago,
    descripcion:     `Pago nómina — ${per}`,
    tipo:            'automatico_nomina_pago',
    referencia_tipo: 'planilla',
    referencia_id:   planilla.id,
    referencia_num:  `PAGO-${planilla.periodo_anio}-${String(planilla.periodo_mes).padStart(2,'0')}`,
    anio:            planilla.periodo_anio,
    mes:             planilla.periodo_mes,
    lineas,
  })
}

// ─── Helper ──────────────────────────────────────────────────
function round2(n: number): number {
  return Math.round(n * 100) / 100
}
