// ============================================================
// SARA ERP — Cálculos de Nómina Nicaragua
// Ley 539 INSS · LCT Art. 23 · Código del Trabajo
// ============================================================

// ─── Tasas vigentes ──────────────────────────────────────────
export const TASAS_NOMINA = {
  INSS_LABORAL:       0.07,    // 7%  — Ley 539, Art. 11
  INSS_PATRONAL:      0.225,   // 22.5% — Ley 539, Art. 11 (régimen integral)
  INATEC:             0.02,    // 2%  — Ley 114 / Decreto 40-94
  PROV_VACACIONES:    1 / 12,  // 8.333% — CT Art. 76 (1 mes por año)
  PROV_AGUINALDO:     1 / 12,  // 8.333% — CT Art. 93 (1 mes en diciembre)
  PROV_INDEMNIZACION: 1 / 12,  // 8.333% — CT Art. 45 (1 mes por año)
} as const

// ─── Tabla progresiva IR Laboral ─────────────────────────────
// LCT Art. 23 — Rentas del trabajo (base anual en C$)
// DGI actualiza umbrales anualmente; usar tabla vigente del período
export interface TramoIR {
  desde:         number
  hasta:         number  // Infinity para el último tramo
  impuesto_base: number
  tasa:          number  // porcentaje sobre exceso
  exceso_desde:  number
}

export const TABLA_IR_LABORAL_2024: TramoIR[] = [
  { desde: 0,           hasta: 100_000,    impuesto_base: 0,      tasa: 0,    exceso_desde: 0 },
  { desde: 100_000.01,  hasta: 200_000,    impuesto_base: 0,      tasa: 0.15, exceso_desde: 100_000 },
  { desde: 200_000.01,  hasta: 350_000,    impuesto_base: 15_000, tasa: 0.20, exceso_desde: 200_000 },
  { desde: 350_000.01,  hasta: 500_000,    impuesto_base: 45_000, tasa: 0.25, exceso_desde: 350_000 },
  { desde: 500_000.01,  hasta: Infinity,   impuesto_base: 82_500, tasa: 0.30, exceso_desde: 500_000 },
]

/**
 * Calcula el IR anual sobre renta neta del trabajo (base anual).
 * renta_gravable_anual = salario_bruto_anual - INSS_laboral_anual
 */
export function calcularIRAnual(rentaGravableAnual: number): number {
  const tabla = TABLA_IR_LABORAL_2024
  for (const tramo of tabla) {
    if (rentaGravableAnual <= tramo.hasta) {
      return tramo.impuesto_base + (rentaGravableAnual - tramo.exceso_desde) * tramo.tasa
    }
  }
  // Último tramo
  const ultimo = tabla[tabla.length - 1]
  return ultimo.impuesto_base + (rentaGravableAnual - ultimo.exceso_desde) * ultimo.tasa
}

/**
 * Calcula el IR mensual a retener usando el método de proyección anual.
 * Evita retenciones incorrectas por meses variables.
 *
 * Algoritmo oficial DGI:
 * 1. Calcular renta gravable del mes = salario_bruto - INSS_laboral
 * 2. Proyectar al año: renta_anual_proyectada = renta_gravable_mes × 12
 * 3. Calcular IR anual proyectado con tabla
 * 4. IR mensual = IR_anual_proyectado / 12
 *
 * Método alternativo (acumulado): usa acum_anual para mayor precisión
 * en diciembre o cuando hay variaciones salariales.
 */
export function calcularIRMensual(params: {
  salarioBruto:       number
  inssLaboral:        number
  mesActual:          number  // 1–12
  acumBrutoAnteriores?: number  // suma salarios brutos meses 1..mes-1
  acumINSSAnteriores?:  number  // suma INSS laboral meses 1..mes-1
  acumIRAnteriores?:    number  // suma IR retenido meses 1..mes-1
}): number {
  const {
    salarioBruto,
    inssLaboral,
    mesActual,
    acumBrutoAnteriores = 0,
    acumINSSAnteriores  = 0,
    acumIRAnteriores    = 0,
  } = params

  // Renta gravable del mes
  const rentaGravableMes = Math.max(0, salarioBruto - inssLaboral)

  // Renta gravable acumulada al cierre de este mes
  const rentaGravableAcum =
    (acumBrutoAnteriores - acumINSSAnteriores) + rentaGravableMes

  // IR total acumulado hasta este mes (proyectado a cierre de año)
  // Método: aplicar tabla sobre acumulado × (12 / mes) para proyectar
  const rentaAnualProyectada = rentaGravableAcum * (12 / mesActual)
  const irAnualProyectado    = calcularIRAnual(rentaAnualProyectada)

  // IR acumulado a retener hasta este mes
  const irAcumARetener = (irAnualProyectado * mesActual) / 12

  // IR del mes = diferencia entre lo que debe acumular y lo ya retenido
  const irMes = Math.max(0, irAcumARetener - acumIRAnteriores)
  return round2(irMes)
}

// ─── Cálculo completo de un empleado en la planilla ──────────
export interface InputEmpleadoPlanilla {
  empleadoId:          string
  salarioBase:         number
  diasTrabajados:      number   // default 30
  horasExtra:          number
  comisiones:          number
  bonificaciones:      number
  otrosIngresos:       number
  adelantos:           number
  prestamosInss:       number
  otrosDescuentos:     number
  regimenInss:         'integral' | 'ivm_rp' | 'facultativo'
  // Tasa patronal del régimen integral configurada por empresa
  // (0.215 si <50 empleados, 0.225 si >=50 — Decreto 06-2019).
  // Si se omite, se usa TASAS_NOMINA.INSS_PATRONAL (22.5%).
  tasaInssPatronal?:   number
  // Para IR acumulado:
  mesActual:           number
  acumBrutoAnteriores: number
  acumINSSAnteriores:  number
  acumIRAnteriores:    number
}

export interface ResultadoEmpleadoPlanilla {
  salarioBase:         number
  diasTrabajados:      number
  valorHorasExtra:     number
  comisiones:          number
  bonificaciones:      number
  otrosIngresos:       number
  salarioBruto:        number   // total devengado

  inssLaboral:         number   // 7%
  inssPatronal:        number   // 22.5% (gasto empresa)
  inatec:              number   // 2% (gasto empresa)
  irLaboral:           number   // tabla progresiva

  adelantos:           number
  prestamosInss:       number
  otrosDescuentos:     number
  totalDeducciones:    number   // solo deducciones al empleado (no INSS pat)
  netoPagar:           number

  provVacaciones:      number   // 8.333% sobre salario bruto
  provAguinaldo:       number
  provIndemnizacion:   number
}

/**
 * Calcula todos los valores de nómina para un empleado.
 * Las horas extra en Nicaragua se pagan al 100% sobre valor hora ordinaria.
 * Hora ordinaria = salario_mensual / 240 (art. 51 CT: 8 h × 30 días)
 */
export function calcularEmpleadoPlanilla(
  input: InputEmpleadoPlanilla
): ResultadoEmpleadoPlanilla {
  // 1. Devengado
  const horaOrdinaria  = input.salarioBase / 240
  const valorHorasExtra = round2(input.horasExtra * horaOrdinaria * 2) // 100% recargo
  const salarioBruto   = round2(
    input.salarioBase
    + valorHorasExtra
    + input.comisiones
    + input.bonificaciones
    + input.otrosIngresos
  )

  // 2. Ajuste proporcional si días trabajados < 30
  const salarioProporcional = round2(salarioBruto * (input.diasTrabajados / 30))

  // Para INSS y IR se usa salario proporcional si parcial
  const baseCalculo = salarioProporcional

  // 3. INSS Laboral (7%) — deducción al empleado
  let inssLaboral = 0
  if (input.regimenInss === 'integral') {
    inssLaboral = round2(baseCalculo * TASAS_NOMINA.INSS_LABORAL)
  } else if (input.regimenInss === 'ivm_rp') {
    inssLaboral = round2(baseCalculo * 0.04) // IVM-RP solo: 4%
  }
  // Facultativo: no aplica descuento al empleado en planilla

  // 4. INSS Patronal (21.5% o 22.5% según tamaño de la empresa) — gasto de la empresa
  let inssPatronal = 0
  if (input.regimenInss === 'integral') {
    const tasaPatronal = input.tasaInssPatronal ?? TASAS_NOMINA.INSS_PATRONAL
    inssPatronal = round2(baseCalculo * tasaPatronal)
  } else if (input.regimenInss === 'ivm_rp') {
    inssPatronal = round2(baseCalculo * 0.165) // IVM-RP patronal
  }

  // 5. INATEC (2%) — gasto de la empresa
  const inatec = round2(baseCalculo * TASAS_NOMINA.INATEC)

  // 6. IR Laboral — retención al empleado
  const irLaboral = calcularIRMensual({
    salarioBruto:        baseCalculo,
    inssLaboral,
    mesActual:           input.mesActual,
    acumBrutoAnteriores: input.acumBrutoAnteriores,
    acumINSSAnteriores:  input.acumINSSAnteriores,
    acumIRAnteriores:    input.acumIRAnteriores,
  })

  // 7. Deducciones totales al empleado (INSS lab + IR + adelantos + otros)
  const totalDeducciones = round2(
    inssLaboral
    + irLaboral
    + input.adelantos
    + input.prestamosInss
    + input.otrosDescuentos
  )
  const netoPagar = round2(baseCalculo - totalDeducciones)

  // 8. Provisiones prestaciones (sobre salario base proporcional)
  const provVacaciones    = round2(baseCalculo * TASAS_NOMINA.PROV_VACACIONES)
  const provAguinaldo     = round2(baseCalculo * TASAS_NOMINA.PROV_AGUINALDO)
  const provIndemnizacion = round2(baseCalculo * TASAS_NOMINA.PROV_INDEMNIZACION)

  return {
    salarioBase:      input.salarioBase,
    diasTrabajados:   input.diasTrabajados,
    valorHorasExtra,
    comisiones:       input.comisiones,
    bonificaciones:   input.bonificaciones,
    otrosIngresos:    input.otrosIngresos,
    salarioBruto:     baseCalculo,
    inssLaboral,
    inssPatronal,
    inatec,
    irLaboral,
    adelantos:        input.adelantos,
    prestamosInss:    input.prestamosInss,
    otrosDescuentos:  input.otrosDescuentos,
    totalDeducciones,
    netoPagar,
    provVacaciones,
    provAguinaldo,
    provIndemnizacion,
  }
}

/**
 * Calcula la liquidación al momento del retiro.
 * Según Código del Trabajo Nicaragua:
 * - Vacaciones proporcionales: (días trabajados en el año) / 365 × 30 días
 * - Aguinaldo proporcional: (meses trabajados en el año) / 12 × salario_base
 * - Indemnización: solo si despido injustificado o negativa de reintegro
 */
export function calcularLiquidacion(params: {
  salarioBase:          number
  fechaIngreso:         Date
  fechaRetiro:          Date
  motivoRetiro:         string
  diasVacacionesPendientes: number
  acumAguinaldoProvisión:   number
  acumIndemnizaciónProvisión: number
  salarioPendienteDias: number  // días sin pagar del último mes
}) {
  const {
    salarioBase,
    fechaIngreso,
    fechaRetiro,
    motivoRetiro,
    diasVacacionesPendientes,
    acumAguinaldoProvisión,
    acumIndemnizaciónProvisión,
    salarioPendienteDias,
  } = params

  const valorDiario = round2(salarioBase / 30)

  // Salario pendiente del período incompleto
  const salarioPendiente = round2(valorDiario * salarioPendienteDias)

  // Vacaciones: valor diario × días pendientes
  const vacacionesPendientes = round2(valorDiario * diasVacacionesPendientes)

  // Aguinaldo proporcional (lo acumulado en provisión)
  const aguinaldoProporcional = round2(acumAguinaldoProvisión)

  // Indemnización: aplica en despido injustificado, mutuo acuerdo, fin contrato, fallecimiento
  const motivosConIndem = [
    'despido_injustificado',
    'mutuo_acuerdo',
    'fin_contrato',
    'fallecimiento',
  ]
  const indemnizacion = motivosConIndem.includes(motivoRetiro)
    ? round2(acumIndemnizaciónProvisión)
    : 0

  const total = round2(
    salarioPendiente
    + vacacionesPendientes
    + aguinaldoProporcional
    + indemnizacion
  )

  return {
    salarioPendiente,
    vacacionesPendientes,
    aguinaldoProporcional,
    indemnizacion,
    total,
  }
}

// ─── Helpers ─────────────────────────────────────────────────
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function formatearMes(mes: number, anio: number): string {
  const meses = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ]
  return `${meses[mes - 1]} ${anio}`
}
