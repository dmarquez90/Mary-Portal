// ============================================================
// Catálogo de códigos de retención IR en la fuente — DGI Nicaragua
// (Rentas de actividades económicas, art. 44 LCT y Reglamento)
// Mismo catálogo que usa la planilla de retenciones de la DMI.
// ============================================================

export interface CodigoRetencion {
  codigo: string
  descripcion: string
  alicuota: number   // fracción: 0.02 = 2%
  /** Monto mínimo de la operación (sin IVA) para que aplique la retención.
   *  Art. 44 num. 2.2 Reglamento LCT: la retención del 2% sobre compra de
   *  bienes y servicios en general aplica a operaciones MAYORES a C$1,000.
   *  Los servicios profesionales/técnicos se retienen desde C$0.01. */
  umbral: number
}

export const CODIGOS_RETENCION: CodigoRetencion[] = [
  { codigo: '21', descripcion: 'Pagos con tarjeta de crédito o débito (1.5%)',              alicuota: 0.015, umbral: 0 },
  { codigo: '22', descripcion: 'Compra de bienes y servicios en general (2%)',              alicuota: 0.02, umbral: 1000 },
  { codigo: '23', descripcion: 'Trabajos de construcción (2%)',                             alicuota: 0.02, umbral: 1000 },
  { codigo: '24', descripcion: 'Alquiler y arrendamiento (2%)',                             alicuota: 0.02, umbral: 0 },
  { codigo: '25', descripcion: 'Compraventa de bienes agropecuarios (3%)',                  alicuota: 0.03, umbral: 0 },
  { codigo: '26', descripcion: 'Madera en rollo (5%)',                                      alicuota: 0.05, umbral: 0 },
  { codigo: '27', descripcion: 'Servicios profesionales o técnicos — persona natural (10%)', alicuota: 0.10, umbral: 0 },
  { codigo: '211', descripcion: 'Otras actividades (10%)',                                  alicuota: 0.10, umbral: 0 },
]

export function getCodigoRetencion(codigo: string | null | undefined): CodigoRetencion | undefined {
  return CODIGOS_RETENCION.find(c => c.codigo === codigo)
}

/**
 * Calcula la retención IR aplicando el umbral legal.
 * Devuelve 0 si el subtotal no alcanza el mínimo del código.
 */
export function calcularRetencion(codigo: string | null | undefined, subtotal: number): number {
  const c = getCodigoRetencion(codigo)
  if (!c) return 0
  if (subtotal <= c.umbral) return 0
  return Math.round(subtotal * c.alicuota * 100) / 100
}

// Alícuota como texto para la planilla DMI ("2%", "10%")
export function alicuotaLabel(codigo: string | null | undefined): string {
  const c = getCodigoRetencion(codigo)
  return c ? `${Math.round(c.alicuota * 1000) / 10}%` : ''
}
