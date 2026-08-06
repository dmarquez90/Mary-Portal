// ============================================================
// Catálogo de exenciones de IVA — Art. 127 Ley 822 (LCT)
// Fuente: Acuerdo Ministerial N°. 09-2016 (16 may 2016), La Gaceta
// Diario Oficial No. 107 del 9 de junio de 2016 — "Lista Taxativa de
// Bienes o Mercancías Exentas del Pago del IVA comprendidas en el
// Art. 127 de la Ley de Concertación Tributaria", Listado "A"
// (documento oficial provisto por el usuario, 2026-08-05).
//
// Este catálogo está a nivel de "numeral" (categoría), NO a nivel de
// código arancelario SAC individual. El Acuerdo 09-2016 lista miles de
// códigos SAC específicos por numeral — eso es para el trámite de
// exoneración de fabricantes/importadores ante el MIFIC (aval + CEP),
// un flujo de aduanas/importación distinto al de un negocio facturando
// localmente. Para decidir si UNA VENTA es exenta de IVA, el nivel de
// numeral es el que un negocio necesita.
//
// NOTA HONESTA: los numerales 13, 20, 21, 22 y 23 del Art. 127 LCT no
// aparecen en el documento de "Listado A" (bienes con clasificación
// arancelaria) que se usó como fuente — es probable que correspondan a
// exenciones de SERVICIOS (no bienes con código SAC: ej. transporte,
// seguros agropecuarios, servicios financieros, energía residencial),
// que no tendrían cabida en una lista taxativa de mercancías. Esto NO
// se ha verificado contra el texto íntegro del Art. 127 — si se
// necesita alguno de esos numerales, hay que confirmarlo con la ley.
// ============================================================

export interface ExencionIVA {
  numeral: number
  descripcion: string
  /** Nota aclaratoria u observación relevante para uso del sistema. */
  nota?: string
}

export const EXENCIONES_IVA: ExencionIVA[] = [
  { numeral: 1, descripcion: 'Libros, folletos, revistas, materiales escolares y científicos, diarios y otras publicaciones periódicas.' },
  { numeral: 2, descripcion: 'Medicamentos, vacunas y sueros de consumo humano, órtesis, prótesis, equipos de medición de glucosa (lancetas, aparatos, cintas), oxígeno para uso clínico u hospitalario, reactivos químicos para exámenes clínicos u hospitalarios, sillas de ruedas y otros aparatos diseñados para personas con discapacidad.' },
  { numeral: 3, descripcion: 'Equipo e instrumental médico, quirúrgico, optométrico, odontológico y de diagnóstico para medicina humana, incluidas las cintas de dispositivos electrónicos para medir glucosa en sangre.' },
  { numeral: 4, descripcion: 'Bienes agrícolas producidos en el país, no sometidos a procesos de transformación o envase, excepto flores o arreglos florales.' },
  { numeral: 5, descripcion: 'Arroz (excepto empacado ≤50 lb de calidad mayor a 80/20), azúcar de caña (excepto especiales), aceite comestible vegetal (excepto oliva/ajonjolí/girasol/maíz), café molido (excepto mezcla superior a 80/20).' },
  { numeral: 6, descripcion: 'Huevos de gallina, tortilla de maíz, sal comestible, harina de trigo/maíz/soya, pan simple y pan dulce tradicional (excepto repostería/pastelería), levaduras para pan tradicional, pinol y pinolillo.' },
  { numeral: 7, descripcion: 'Leche modificada, maternizada, íntegra y fluida; preparaciones para lactantes; bebidas no alcohólicas a base de leche con frutas o cacao natural; queso artesanal.' },
  { numeral: 8, descripcion: 'Animales vivos, excepto mascotas y caballos de raza.' },
  { numeral: 9, descripcion: 'Pescados frescos.' },
  { numeral: 10, descripcion: 'Carnes frescas de res, pollo y cerdo (incluye vísceras, menudos y despojos), refrigeradas o congeladas, cuando no sean sometidas a transformación, embutido o envase.' },
  { numeral: 11, descripcion: 'Producción nacional de papel higiénico, jabones de lavar y baño, detergente, pasta y cepillo dental, desodorante, escoba, cerillos/fósforo y toalla sanitaria.' },
  { numeral: 12, descripcion: 'Gas butano, propano o mezcla, en envase de hasta 25 libras.' },
  { numeral: 14, descripcion: 'Productos veterinarios, vitaminas y premezclas vitamínicas para uso veterinario y sanidad vegetal.' },
  { numeral: 15, descripcion: 'Insecticidas, plaguicidas, fungicidas, herbicidas, defoliantes, abonos, fertilizantes, semillas y productos de biotecnología para uso agropecuario o forestal.' },
  { numeral: 16, descripcion: 'Maquinaria, equipo y equipo de riego para producción agropecuaria, y sus partes, accesorios, repuestos y llantas.' },
  { numeral: 17, descripcion: 'Materiales, materia prima y bienes intermedios incorporados físicamente (con transformación industrial) en: arroz, azúcar, carne de pollo, leche líquida íntegra, aceite comestible, huevos, harina de trigo, jabón de lavar, papel higiénico, pan simple y pinolillo.', nota: 'Exención condicionada — requiere aval de exoneración MIFIC/DGI (CEP), no es automática por el solo tipo de insumo.' },
  { numeral: 18, descripcion: 'Melaza y alimento para ganado, aves de corral y animales de acuicultura, en cualquier presentación.' },
  { numeral: 19, descripcion: 'Petróleo crudo o parcialmente refinado, y derivados del petróleo a los que se les haya aplicado el IECC (Impuesto Específico Conglobado a los Combustibles) y el IEFOMAV (Fondo de Mantenimiento Vial).' },
  { numeral: 24, descripcion: 'Billetes y monedas de circulación nacional, juegos de la Lotería Nacional y loterías autorizadas, participaciones sociales, especies fiscales emitidas/autorizadas por el MHCP y demás títulos valores (excepto certificados de depósito que incorporen posesión de bienes cuya enajenación esté obligada a pagar IVA).' },
  { numeral: 25, descripcion: 'Paneles solares y baterías solares de ciclo profundo para generación eléctrica con fuentes renovables; lámparas y bujías ahorrativas de energía eléctrica.' },
]

export function getExencionIVA(numeral: number | null | undefined): ExencionIVA | undefined {
  return EXENCIONES_IVA.find(e => e.numeral === numeral)
}

/** Texto corto para mostrar junto a un producto marcado como exento. */
export function exencionLabel(numeral: number | null | undefined): string {
  const e = getExencionIVA(numeral)
  return e ? `Art. 127 LCT, numeral ${e.numeral}` : ''
}
