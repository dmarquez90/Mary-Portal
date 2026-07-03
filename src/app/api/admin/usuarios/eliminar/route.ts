import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/admin/usuarios/eliminar
// Borra la cuenta de auth.users por completo (Admin API, service role) --
// no solo la fila de empresa_usuarios. ON DELETE CASCADE en
// empresa_usuarios.usuario_id se encarga de eliminar esa fila; no quedan
// registros huérfanos. Mismo control de acceso que crear/suspender: solo
// admin (usuarios_gestionar) o super_admin, y un admin normal nunca puede
// tocar a otro admin.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const empresaUsuarioId = body?.empresa_usuario_id as string | undefined;
  const razon = body?.razon as string | undefined;

  if (!empresaUsuarioId || !razon || razon.trim() === "") {
    return NextResponse.json({ error: "empresa_usuario_id y razón son requeridos" }, { status: 400 });
  }

  const { data: target } = await supabase
    .from("empresa_usuarios")
    .select("id, usuario_id, empresa_id, rol")
    .eq("id", empresaUsuarioId)
    .maybeSingle();
  if (!target) return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });

  if (target.usuario_id === user.id) {
    return NextResponse.json({ error: "No puedes eliminar tu propia cuenta" }, { status: 400 });
  }

  const { data: superAdminRow } = await supabase
    .from("super_admins").select("usuario_id").eq("usuario_id", user.id).maybeSingle();
  const isSuperAdmin = !!superAdminRow;

  if (!isSuperAdmin) {
    if (target.rol === "admin") {
      return NextResponse.json({ error: "Solo super_admin puede eliminar a un admin" }, { status: 403 });
    }
    const { data: tienePermiso } = await supabase.rpc("fn_tiene_permiso", {
      p_usuario_id: user.id,
      p_empresa_id: target.empresa_id,
      p_permiso: "usuarios_gestionar",
    });
    if (!tienePermiso) {
      return NextResponse.json({ error: "No tienes permiso para gestionar usuarios" }, { status: 403 });
    }
  }

  const admin = createAdminClient();

  // empresas_juridicas.user_id y empresas_persona_natural.user_id tienen
  // ON DELETE CASCADE hacia auth.users (constraint preexistente del modelo
  // de dueño único). Si el objetivo es el dueño registral de una empresa,
  // borrar su cuenta borraría la fila de la empresa completa y dejaría
  // huérfanos todos los demás empleados y datos de negocio. Se bloquea
  // explícitamente antes de llamar a la Admin API.
  const [{ count: esDuenoJuridica }, { count: esDuenoNatural }] = await Promise.all([
    admin.from("empresas_juridicas").select("id", { count: "exact", head: true }).eq("user_id", target.usuario_id),
    admin.from("empresas_persona_natural").select("id", { count: "exact", head: true }).eq("user_id", target.usuario_id),
  ]);
  if ((esDuenoJuridica ?? 0) > 0 || (esDuenoNatural ?? 0) > 0) {
    return NextResponse.json({
      error: "No se puede eliminar: esta cuenta es la propietaria registral de una empresa. Transfiere la propiedad antes de eliminarla.",
    }, { status: 400 });
  }

  const { error: errorDelete } = await admin.auth.admin.deleteUser(target.usuario_id);
  if (errorDelete) {
    return NextResponse.json({ error: errorDelete.message }, { status: 400 });
  }

  await admin.from("audit_log_accesos").insert({
    actor_id: user.id,
    accion: "eliminar_usuario",
    target_usuario_id: target.usuario_id,
    target_empresa_id: target.empresa_id,
    razon,
  });

  return NextResponse.json({ success: true });
}
