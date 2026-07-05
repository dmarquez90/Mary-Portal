import type { SupabaseClient } from "@supabase/supabase-js";

// Resuelve la empresa activa de un usuario autenticado a través de
// empresa_usuarios -- fuente única de verdad para el modelo multi-usuario.
//
// El dueño original de una empresa también tiene su fila en empresa_usuarios
// (creada por trigger al registrar la empresa), así que esta función
// reemplaza sin excepción cualquier búsqueda de "mi empresa" por
// empresas_persona_natural/juridicas.user_id = auth.uid(): ese patrón legado
// solo encontraba la empresa cuando el usuario logueado era el dueño
// original; para usuarios invitados (vendedor, contador, auxiliar, etc.)
// siempre devolvía null, aunque sí pertenecieran a la empresa.
//
// Funciona igual con el cliente de browser (@/lib/supabase/client) y con el
// de servidor (@/lib/supabase/server), ya que ambos exponen la misma forma.
export async function getEmpresaIdActual(
  supabase: SupabaseClient,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("empresa_usuarios")
    .select("empresa_id")
    .eq("usuario_id", userId)
    .maybeSingle();
  return (data as { empresa_id: string } | null)?.empresa_id ?? null;
}
