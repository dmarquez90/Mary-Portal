import type { SupabaseClient } from '@supabase/supabase-js'
import { TASAS_NOMINA } from './calculos'

// Tasa INSS patronal del régimen integral configurada por empresa.
// Decreto 06-2019 (reforma al reglamento de la Ley 539):
//   * 21.5% para empleadores con menos de 50 trabajadores
//   * 22.5% para empleadores con 50 o más
// Si la empresa no tiene el valor configurado, se usa 22.5% (el más
// conservador y el default histórico del sistema).
export async function getTasaInssPatronal(
  supabase: SupabaseClient,
  empresaId: string
): Promise<number> {
  const [{ data: ej }, { data: en }] = await Promise.all([
    supabase.from('empresas_juridicas').select('inss_patronal_tasa').eq('id', empresaId).maybeSingle(),
    supabase.from('empresas_persona_natural').select('inss_patronal_tasa').eq('id', empresaId).maybeSingle(),
  ])
  const tasa = Number(ej?.inss_patronal_tasa ?? en?.inss_patronal_tasa)
  return tasa > 0 && tasa < 1 ? tasa : TASAS_NOMINA.INSS_PATRONAL
}
