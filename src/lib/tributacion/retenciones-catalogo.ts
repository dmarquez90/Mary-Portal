// ============================================================
// Catálogo de códigos de retención IR en la fuente — DGI Nicaragua
// (Rentas de actividades económicas, art. 44 LCT y Reglamento)
// Mismo catálogo que usa la planilla de retenciones de la DMI.
// ============================================================

export interface CodigoRetencion {
  codigo: string
  descripcion: string
  alicuota: number   // fracción: 0.02 = 2%
}

export const CODIGOS_RETENCION: CodigoRetencion[] = [
  { codigo: '22', descripcion: 'Compra de bienes y servicios en general (2%)',              alicuota: 0.02 },
  { codigo: '23', descripcion: 'Trabajos de construcción (2%)',                             alicuota: 0.02 },
  { codigo: '24', descripcion: 'Alquiler y arrendamiento (2%)',                             alicuota: 0.02 },
  { codigo: '25', descripcion: 'Compraventa de bienes agropecuarios (3%)',                  alicuota: 0.03 },
  { codigo: '26', descripcion: 'Madera en rollo (5%)',                                      alicuota: 0.05 },
  { codigo: '27', descripcion: 'Servicios profesionales o técnicos — persona natural (10%)', alicuota: 0.10 },
  { codigo: '211', descripcion: 'Otras actividades (10%)',                                  alicuota: 0.10 },
]

export function getCodigoRetencion(codigo: string | null | undefined): CodigoRetencion | undefined {
  return CODIGOS_RETENCION.find(c => c.codigo === codigo)
}

// Alícuota como texto para la planilla DMI ("2%", "10%")
export function alicuotaLabel(codigo: string | null | undefined): string {
  const c = getCodigoRetencion(codigo)
  return c ? `${Math.round(c.alicuota * 1000) / 10}%` : ''
}
