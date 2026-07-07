import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/auth/verificar-descuento
// Autoriza un descuento manual (Ventas) o una nota de crédito manual
// (Notas de crédito/débito) pidiendo SOLO la contraseña de un admin de
// la misma empresa — sin cerrar la sesión de quien está vendiendo.
//
// Como Supabase Auth valida por correo+contraseña, no hay forma de
// "verificar solo la contraseña" directamente: se resuelven los admins
// de la empresa del lado servidor (nunca confiar en un empresa_id del
// body) y se prueba la contraseña recibida contra cada uno con un
// cliente temporal sin persistencia de sesión, hasta encontrar coincidencia.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const password = body?.password as string | undefined;
  if (!password) {
    return NextResponse.json({ error: "Contraseña requerida" }, { status: 400 });
  }

  const { data: filaCaller } = await supabase
    .from("empresa_usuarios")
    .select("empresa_id")
    .eq("usuario_id", user.id)
    .maybeSingle();
  if (!filaCaller) {
    return NextResponse.json({ error: "No perteneces a ninguna empresa" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: admins, error: errAdmins } = await admin
    .from("empresa_usuarios")
    .select("usuario_id")
    .eq("empresa_id", filaCaller.empresa_id)
    .eq("rol", "admin");

  if (errAdmins || !admins?.length) {
    return NextResponse.json({ error: "No hay administradores para autorizar" }, { status: 403 });
  }

  for (const { usuario_id } of admins) {
    const { data: adminUser } = await admin.auth.admin.getUserById(usuario_id);
    const email = adminUser?.user?.email;
    if (!email) continue;

    // Cliente anónimo desechable: verifica la contraseña sin tocar
    // cookies ni la sesión del vendedor que hizo la petición.
    const clienteVerificacion = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { data: signIn, error: signInError } = await clienteVerificacion.auth.signInWithPassword({ email, password });
    if (!signInError && signIn.user) {
      return NextResponse.json({ authorized: true, admin_id: usuario_id });
    }
  }

  return NextResponse.json({ authorized: false, error: "Contraseña incorrecta" }, { status: 401 });
}
