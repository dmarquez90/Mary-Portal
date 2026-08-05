// ============================================================
// Siconic ERP — Cálculos de Nómina Nicaragua
// Ley 539 INSS · LCT Art. 23 · Código del Trabajo
// ============================================================

// ─── Tasas vigentes ──────────────────────────────────────────
export const TASAS_NOMINA = {
  INSS_LABORAL:       0.07,    // 7%  — Ley 539, Art. 11
  INSS_PATRONAL:      0.225,   // 22.5% — Ley 539, Art. 11 (régimen integral)
  INATEC:             0.02,    // 2%  — Ley 114 / Decreto 40-94
  PROV_VACACIONES:    1 / 12,  // 8.333% — CT Art. 76 (1 mes por año)
  PROV_AGUINALDO:     1 / 12,  // 8.333% — CT Art. 93 (1 mes en diciembre)
  // PROV_INDEMNIZACION queda como referencia del primer tramo (ver
  // tasaProvisionIndemnizacion abajo) — Art. 45 CT NO es un 8.333% plano:
  // es progresivo por antigüedad y tiene tope de 5 meses de salario.
  PROV_INDEMNIZACION: 1 / 12,
  // Subsidio INSS por enfermedad común — Reglamento General Ley 539:
  // el INSS cubre el 60% del salario promedio desde el 4to día de
  // incapacidad. Los primeros 3 días ("días de espera") no tienen una
  // obligación legal única de pago por parte del empleador; queda a
  // política interna (por defecto 0% en este sistema — configurable
  // por incapacidad vía dias_cubiertos_empresa/tasa_pago_dias_espera).
  SUBSIDIO_INSS_ENFERMEDAD:      0.60,
  DIAS_ESPERA_SUBSIDIO_INSS:     3,
} as const

/**
 * Tasa mensual de provisión de indemnización por antigüedad (Art. 45 CT).
 * - Primeros 3 años de servicio continuo: 1 mes de salario por año → 8.333%/mes
 * - Del 4to año en adelante: 20 días de salario por año → (20/30)/12 = 5.556%/mes
 * (La ley nunca fija menos de 1 mes ni más de 5 meses en total — ese tope
 * se aplica aparte, sobre el acumulado, en calcularEmpleadoPlanilla.)
 */
export function tasaProvisionIndemnizacion(añosServicioCompletos: number): number {
  return añosServicioCompletos < 3 ? 1 / 12 : (20 / 30) / 12
}

/**
 * Años completos de servicio continuo entre fechaIngreso y fechaCorte
 * (cuenta aniversarios cumplidos, no fracciones).
 */
export function calcularAñosServicioCompletos(fechaIngreso: Date, fechaCorte: Date): number {
  let años = fechaCorte.getFullYear() - fechaIngreso.getFullYear()
  const aniversarioEsteAnio = new Date(fechaCorte.getFullYear(), fechaIngreso.getMonth(), fechaIngreso.getDate())
  if (fechaCorte < aniversarioEsteAnio) años--
  return Math.max(0, años)
}

/**
 * Calcula el subsidio INSS y el pago de empresa de una incapacidad por
 * enfermedad común.
 *
 * Simplificación: usa el salario diario actual del empleado como base;
 * la norma técnica exige el promedio de las últimas 8 semanas cotizadas,
 * que este sistema todavía no reconstruye histórico por semana. Revisar
 * con el INSS/contador si el empleado tuvo cambios de salario recientes.
 */
export function calcularSubsidioIncapacidad(params: {
  salarioDiario:               number
  diasIncapacidad:             number
  diasEsperaCubiertosPorEmpresa?: number // cuántos de los primeros 3 días paga la empresa (0-3)
  tasaPagoDiasEspera?:         number    // % del salario que paga la empresa esos días (0 = no paga)
}): { diasEspera: number; diasSubsidiadosInss: number; subsidioInss: number; pagoEmpresaDiasEspera: number } {
  const {
    salarioDiario,
    diasIncapacidad,
    diasEsperaCubiertosPorEmpresa = 0,
    tasaPagoDiasEspera = 0,
  } = params

  const diasEspera = Math.min(diasIncapacidad, TASAS_NOMINA.DIAS_ESPERA_SUBSIDIO_INSS)
  const diasSubsidiadosInss = Math.max(0, diasIncapacidad - TASAS_NOMINA.DIAS_ESPERA_SUBSIDIO_INSS)
  const subsidioInss = round2(diasSubsidiadosInss * salarioDiario * TASAS_NOMINA.SUBSIDIO_INSS_ENFERMEDAD)

  const diasEsperaPagados = Math.min(diasEspera, Math.max(0, diasEsperaCubiertosPorEmpresa))
  const pagoEmpresaDiasEspera = round2(diasEsperaPagados * salarioDiario * tasaPagoDiasEspera)

  return { diasEspera, diasSubsidiadosInss, subsidioInss, pagoEmpresaDiasEspera }
}

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
  // Para la provisión de indemnización por antigüedad (Art. 45 CT):
  anioActual:                number        // año calendario del período
  fechaIngreso?:             Date | string // antigüedad del empleado; sin ella se asume tasa del primer tramo
  acumIndemnizacionAnterior?: number       // total ya provisionado antes de este mes, para aplicar el tope de 5 meses
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
  añosServicioIndemnizacion: number  // antigüedad usada para elegir la tasa (Art. 45 CT)
  topeIndemnizacionAlcanzado: boolean // true si la provisión se recortó por el tope de 5 meses
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

  // 2. Ajuste proporcional SOLO sobre el salario base (FIX auditoría:
  // antes se prorrateaban también horas extra, comisiones y bonos, que
  // son montos ya devengados y no dependen de los días laborados)
  const salarioBaseProporcional = round2(input.salarioBase * (input.diasTrabajados / 30))

  const salarioBruto = round2(
    salarioBaseProporcional
    + valorHorasExtra
    + input.comisiones
    + input.bonificaciones
    + input.otrosIngresos
  )

  // Para INSS e IR se usa el bruto devengado del mes
  const baseCalculo = salarioBruto

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
  const provVacaciones = round2(baseCalculo * TASAS_NOMINA.PROV_VACACIONES)
  const provAguinaldo  = round2(baseCalculo * TASAS_NOMINA.PROV_AGUINALDO)

  // Indemnización por antigüedad (Art. 45 CT): tasa progresiva según años
  // de servicio (1 mes/año los primeros 3, 20 días/año desde el 4to), con
  // tope de 5 meses de salario sobre el acumulado total.
  const fechaCorte = new Date(input.anioActual, input.mesActual, 0) // último día del mes del período
  const fechaIngresoDate = input.fechaIngreso
    ? (typeof input.fechaIngreso === 'string' ? new Date(input.fechaIngreso) : input.fechaIngreso)
    : fechaCorte // sin fecha de ingreso: asume 0 años de antigüedad (tasa del primer tramo)
  const añosServicioIndemnizacion = calcularAñosServicioCompletos(fechaIngresoDate, fechaCorte)
  const tasaIndemnizacion = tasaProvisionIndemnizacion(añosServicioIndemnizacion)

  let provIndemnizacion = round2(baseCalculo * tasaIndemnizacion)
  const acumIndemnizacionAnterior = input.acumIndemnizacionAnterior ?? 0
  const topeIndemnizacion = round2(input.salarioBase * 5) // nunca más de 5 meses (Art. 45 CT)
  let topeIndemnizacionAlcanzado = false
  if (acumIndemnizacionAnterior + provIndemnizacion > topeIndemnizacion) {
    provIndemnizacion = round2(Math.max(0, topeIndemnizacion - acumIndemnizacionAnterior))
    topeIndemnizacionAlcanzado = true
  }

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
    añosServicioIndemnizacion,
    topeIndemnizacionAlcanzado,
  }
}

/**
 * Calcula la liquidación al momento del retiro.
 * Según Código del Trabajo Nicaragua:
 * - Vacaciones proporcionales: (días trabajados en el año) / 365 × 30 días
 * - Aguinaldo proporcional: (meses trabajados en el año) / 12 × salario_base
 * - Indemnización: Art. 45 CT (ver nota sobre renuncia más abajo)
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

  // Indemnización por antigüedad (Art. 45 CT).
  // FIX auditoría: se incluye 'renuncia' — el trabajador que renuncia
  // cumpliendo el preaviso de 15 días (Art. 43 CT) conserva el derecho
  // a la indemnización del Art. 45. Solo se pierde por despido con
  // causa justa (Art. 48 CT) o abandono.
  const motivosSinIndem = ['despido_justificado', 'abandono']
  const indemnizacion = motivosSinIndem.includes(motivoRetiro)
    ? 0
    : round2(acumIndemnizaciónProvisión)

  // IR sobre la liquidación (LCT Art. 19 num. 3):
  // la indemnización está exenta hasta C$500,000; el exceso paga 10%
  // como retención definitiva. Vacaciones y salario pendiente son
  // rentas del trabajo gravables (se integran a la tabla progresiva;
  // aquí se reportan para que el módulo de nómina las retenga).
  const INDEM_EXENTA_TOPE = 500_000
  const indemnizacionExenta   = round2(Math.min(indemnizacion, INDEM_EXENTA_TOPE))
  const indemnizacionGravada  = round2(Math.max(0, indemnizacion - INDEM_EXENTA_TOPE))
  const irIndemnizacion       = round2(indemnizacionGravada * 0.10)

  const total = round2(
    salarioPendiente
    + vacacionesPendientes
    + aguinaldoProporcional
    + indemnizacion
  )
  const totalNeto = round2(total - irIndemnizacion)

  return {
    salarioPendiente,
    vacacionesPendientes,
    aguinaldoProporcional,
    indemnizacion,
    indemnizacionExenta,
    indemnizacionGravada,
    irIndemnizacion,
    total,
    totalNeto,
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
