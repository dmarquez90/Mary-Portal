export type TipoValidacionVET = 'error' | 'warning'

export interface ValidacionVET {
  campo: string
  regla: string
  tipo: TipoValidacionVET
  mensaje: string
  referenciaLey: string
}

export interface ResumenValidacionVET {
  total: number
  errores: number
  advertencias: number
  es_valido: boolean
}

export interface DatosValidacionVET {
  planillaIngresos?: {
    ventasGravadas: number
    ventasExentas: number
    servicios: number
    libroVentas: { subtotal: number }[]
  }
  creditoFiscalIVA?: { ivaAcreditable: number; comprasTotal: number }
  retencionesIR?: { retencionesIR2: number; comprasPN: number }
  diferencialCambiario?: { montoExtranjero: number; tasaTransaccion: number; tasaCierre: number }
  gastosF106?: { gastosDeductibles: number; donacionesAportadas: number; ingresoNeto: number }
  nominaINSS?: { totalSalarios: number; totalINSSObrero: number; totalINSSPatronal: number }
  balanceGeneral?: {
    activosCorriente: number
    activosNoC: number
    pasivosCorriente: number
    pasivosNoC: number
    patrimonio: number
  }
  declaracionIVA?: { debitoFiscal: number; creditoFiscal: number; pagoTraslado: number }
}

const TOLERANCIA_CUADRE = 0.01

export class ValidadorVETCompliance {
  static validarPlanillaIngresos(
    ventasGravadas: number,
    ventasExentas: number,
    servicios: number,
    libroVentas: { subtotal: number }[]
  ): ValidacionVET[] {
    const resultados: ValidacionVET[] = []
    const totalPlanilla = ventasGravadas + ventasExentas + servicios
    const totalLibro = libroVentas.reduce((acc, f) => acc + Number(f.subtotal), 0)
    const diferencia = Math.abs(totalPlanilla - totalLibro)

    if (diferencia > TOLERANCIA_CUADRE) {
      resultados.push({
        campo: 'planilla_ingresos',
        regla: 'planilla_vs_libro_ventas',
        tipo: 'error',
        mensaje: `La suma de la Planilla de Ingresos (C$${totalPlanilla.toFixed(2)}) no coincide con el Libro de Ventas (C$${totalLibro.toFixed(2)}). Diferencia: C$${diferencia.toFixed(2)}`,
        referenciaLey: 'Ley 822, Art. 38',
      })
    }
    return resultados
  }

  static validarCreditoFiscalIVA(ivaAcreditable: number, comprasTotal: number): ValidacionVET[] {
    const resultados: ValidacionVET[] = []
    const limite = comprasTotal * 0.15

    if (ivaAcreditable > limite) {
      resultados.push({
        campo: 'credito_fiscal_iva',
        regla: 'iva_acreditable_max_15_compras',
        tipo: 'error',
        mensaje: `El IVA acreditable (C$${ivaAcreditable.toFixed(2)}) supera el 15% de las compras totales (límite: C$${limite.toFixed(2)})`,
        referenciaLey: 'Ley 822, Art. 85',
      })
    }
    return resultados
  }

  static validarRetencionesIR(retencionesIR2: number, comprasPN: number): ValidacionVET[] {
    const resultados: ValidacionVET[] = []
    const limite = comprasPN * 0.02

    if (retencionesIR2 > limite) {
      resultados.push({
        campo: 'retenciones_ir',
        regla: 'retenciones_max_2_compras_pn',
        tipo: 'error',
        mensaje: `Las retenciones de IR (C$${retencionesIR2.toFixed(2)}) superan el 2% de las compras a personas naturales (límite: C$${limite.toFixed(2)})`,
        referenciaLey: 'Ley 822, Art. 89',
      })
    }
    return resultados
  }

  static validarDiferencialCambiario(
    montoExtranjero: number,
    tasaTransaccion: number,
    tasaCierre: number
  ): ValidacionVET[] {
    const diferencial = montoExtranjero * (tasaCierre - tasaTransaccion)

    return [{
      campo: 'diferencial_cambiario',
      regla: 'diferencial_cambiario_informativo',
      tipo: 'warning',
      mensaje: `Diferencial cambiario calculado: C$${diferencial.toFixed(2)} (tasa transacción: ${tasaTransaccion}, tasa cierre: ${tasaCierre})`,
      referenciaLey: 'NIIF PYMES Sección 30',
    }]
  }

  static validarGastosF106(
    gastosDeductibles: number,
    donacionesAportadas: number,
    ingresoNeto: number
  ): ValidacionVET[] {
    const resultados: ValidacionVET[] = []
    const limite = ingresoNeto * 0.03

    if (donacionesAportadas > limite) {
      resultados.push({
        campo: 'donaciones',
        regla: 'donaciones_max_3_renta_neta',
        tipo: 'warning',
        mensaje: `Las donaciones aportadas (C$${donacionesAportadas.toFixed(2)}) superan el 3% de la renta neta (límite: C$${limite.toFixed(2)})`,
        referenciaLey: 'Ley 822, Art. 15 inciso e)',
      })
    }
    return resultados
  }

  static validarNominaINSS(
    totalSalarios: number,
    totalINSSObrero: number,
    totalINSSPatronal: number
  ): ValidacionVET[] {
    const resultados: ValidacionVET[] = []
    const tolerancia = 100
    const esperadoObrero = totalSalarios * 0.0625
    const esperadoPatronal = totalSalarios * 0.1475

    if (Math.abs(totalINSSObrero - esperadoObrero) > tolerancia) {
      resultados.push({
        campo: 'inss_obrero',
        regla: 'inss_obrero_6_25',
        tipo: 'warning',
        mensaje: `El INSS obrero reportado (C$${totalINSSObrero.toFixed(2)}) se desvía del esperado (C$${esperadoObrero.toFixed(2)}, 6.25% del salario) en más de C$${tolerancia}`,
        referenciaLey: 'Reglamento General de la Ley de Seguridad Social',
      })
    }
    if (Math.abs(totalINSSPatronal - esperadoPatronal) > tolerancia) {
      resultados.push({
        campo: 'inss_patronal',
        regla: 'inss_patronal_14_75',
        tipo: 'warning',
        mensaje: `El INSS patronal reportado (C$${totalINSSPatronal.toFixed(2)}) se desvía del esperado (C$${esperadoPatronal.toFixed(2)}, 14.75% del salario) en más de C$${tolerancia}`,
        referenciaLey: 'Reglamento General de la Ley de Seguridad Social',
      })
    }
    return resultados
  }

  static validarBalanceGeneral(
    activosCorriente: number,
    activosNoC: number,
    pasivosCorriente: number,
    pasivosNoC: number,
    patrimonio: number
  ): ValidacionVET[] {
    const resultados: ValidacionVET[] = []
    const totalActivos = activosCorriente + activosNoC
    const totalPasivosPatrimonio = pasivosCorriente + pasivosNoC + patrimonio
    const diferencia = Math.abs(totalActivos - totalPasivosPatrimonio)

    if (diferencia > TOLERANCIA_CUADRE) {
      resultados.push({
        campo: 'balance_general',
        regla: 'activos_igual_pasivos_mas_patrimonio',
        tipo: 'error',
        mensaje: `El Balance General no cuadra: Activos (C$${totalActivos.toFixed(2)}) ≠ Pasivos + Patrimonio (C$${totalPasivosPatrimonio.toFixed(2)}). Diferencia: C$${diferencia.toFixed(2)}`,
        referenciaLey: 'Principio de partida doble',
      })
    }
    return resultados
  }

  static validarDeclaracionIVA(
    debitoFiscal: number,
    creditoFiscal: number,
    pagoTraslado: number
  ): ValidacionVET[] {
    const resultados: ValidacionVET[] = []
    const calculado = debitoFiscal - creditoFiscal
    const diferencia = Math.abs(calculado - pagoTraslado)

    if (diferencia > TOLERANCIA_CUADRE) {
      resultados.push({
        campo: 'declaracion_iva',
        regla: 'debito_menos_credito_igual_pago',
        tipo: 'error',
        mensaje: `Débito Fiscal menos Crédito Fiscal (C$${calculado.toFixed(2)}) no coincide con el Pago/Traslado declarado (C$${pagoTraslado.toFixed(2)})`,
        referenciaLey: 'Ley 822, Capítulo V',
      })
    }
    return resultados
  }

  static ejecutarValidacionesCompletas(datos: DatosValidacionVET): ValidacionVET[] {
    const resultados: ValidacionVET[] = []

    if (datos.planillaIngresos) {
      const { ventasGravadas, ventasExentas, servicios, libroVentas } = datos.planillaIngresos
      resultados.push(...this.validarPlanillaIngresos(ventasGravadas, ventasExentas, servicios, libroVentas))
    }
    if (datos.creditoFiscalIVA) {
      const { ivaAcreditable, comprasTotal } = datos.creditoFiscalIVA
      resultados.push(...this.validarCreditoFiscalIVA(ivaAcreditable, comprasTotal))
    }
    if (datos.retencionesIR) {
      const { retencionesIR2, comprasPN } = datos.retencionesIR
      resultados.push(...this.validarRetencionesIR(retencionesIR2, comprasPN))
    }
    if (datos.diferencialCambiario) {
      const { montoExtranjero, tasaTransaccion, tasaCierre } = datos.diferencialCambiario
      resultados.push(...this.validarDiferencialCambiario(montoExtranjero, tasaTransaccion, tasaCierre))
    }
    if (datos.gastosF106) {
      const { gastosDeductibles, donacionesAportadas, ingresoNeto } = datos.gastosF106
      resultados.push(...this.validarGastosF106(gastosDeductibles, donacionesAportadas, ingresoNeto))
    }
    if (datos.nominaINSS) {
      const { totalSalarios, totalINSSObrero, totalINSSPatronal } = datos.nominaINSS
      resultados.push(...this.validarNominaINSS(totalSalarios, totalINSSObrero, totalINSSPatronal))
    }
    if (datos.balanceGeneral) {
      const { activosCorriente, activosNoC, pasivosCorriente, pasivosNoC, patrimonio } = datos.balanceGeneral
      resultados.push(...this.validarBalanceGeneral(activosCorriente, activosNoC, pasivosCorriente, pasivosNoC, patrimonio))
    }
    if (datos.declaracionIVA) {
      const { debitoFiscal, creditoFiscal, pagoTraslado } = datos.declaracionIVA
      resultados.push(...this.validarDeclaracionIVA(debitoFiscal, creditoFiscal, pagoTraslado))
    }

    return resultados
  }

  static generarResumen(validaciones: ValidacionVET[]): ResumenValidacionVET {
    const errores = validaciones.filter((v) => v.tipo === 'error').length
    const advertencias = validaciones.filter((v) => v.tipo === 'warning').length

    return {
      total: validaciones.length,
      errores,
      advertencias,
      es_valido: errores === 0,
    }
  }
}
