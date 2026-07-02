import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/admin/usuarios/listar?empresa_id=xxx
// Lista filas de empresa_usuarios visibles para el llamante (RLS ya restringe
// a: la propia fila, admin/super_admin de esa empresa). Se enriquece con el
// email de auth.users usando el cliente admin, ya que esa tabla no es
// consultable directamente desde el cliente.
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const empresaId = searchParams.get("empresa_id");

  let query = supabase
    .from("empresa_usuarios")
    .select("id, usuario_id, empresa_id, rol, permisos_custom, suspendido, suspendido_at, suspendido_razon, created_at")
    .order("created_at");
  if (empresaId) query = query.eq("empresa_id", empresaId);

  const { data: filas, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const admin = createAdminClient();
  const emailsPorId = new Map<string, string>();
  await Promise.all(
    Array.from(new Set((filas ?? []).map(f => f.usuario_id))).map(async (uid) => {
      const { data } = await admin.auth.admin.getUserById(uid);
      if (data.user?.email) emailsPorId.set(uid, data.user.email);
    })
  );

  const resultado = (filas ?? []).map(f => ({ ...f, email: emailsPorId.get(f.usuario_id) ?? null }));
  return NextResponse.json({ usuarios: resultado });
}
