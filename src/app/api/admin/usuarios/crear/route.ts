import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const ROLES_VALIDOS = ["admin", "contador", "auxiliar", "ventas", "cajero"] as const;

function validarPassword(password: string): string | null {
  if (password.length < 8) return "La contraseña debe tener al menos 8 caracteres";
  if (!/[A-Z]/.test(password)) return "La contraseña debe tener al menos una letra mayúscula";
  if (!/[0-9]/.test(password)) return "La contraseña debe tener al menos un número";
  return null;
}

// POST /api/admin/usuarios/crear
// Crea un usuario nuevo (Supabase Admin API, service role) y su fila en
// empresa_usuarios. El empresa_id NUNCA se toma del body para un admin normal
// -- se resuelve del lado servidor a partir de su propia sesión, para que un
// admin no pueda crear usuarios en una empresa ajena. Solo super_admin puede
// especificar empresa_id explícitamente (gestión cross-empresa).
//
// La contraseña la escribe el admin al crear el usuario (no se autogenera).
// El usuario puede cambiarla después desde Configuración > Contraseña.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const email = body?.email as string | undefined;
  const rol = body?.rol as string | undefined;
  const password = body?.password as string | undefined;
  const empresaIdBody = body?.empresa_id as string | undefined;

  if (!email || !rol || !password) {
    return NextResponse.json({ error: "email, rol y contraseña son requeridos" }, { status: 400 });
  }
  if (!ROLES_VALIDOS.includes(rol as typeof ROLES_VALIDOS[number])) {
    return NextResponse.json({ error: "rol inválido" }, { status: 400 });
  }

  // Validación server-side de la contraseña: nunca confiar solo en el
  // formulario del cliente, alguien podría pegarle directo al endpoint.
  const errorPassword = validarPassword(password);
  if (errorPassword) {
    return NextResponse.json({ error: errorPassword }, { status: 400 });
  }

  const { data: superAdminRow } = await supabase
    .from("super_admins").select("usuario_id").eq("usuario_id", user.id).maybeSingle();
  const isSuperAdmin = !!superAdminRow;

  let empresaId: string | null = null;

  if (isSuperAdmin) {
    if (!empresaIdBody) {
      return NextResponse.json({ error: "empresa_id es requerido para super_admin" }, { status: 400 });
    }
    empresaId = empresaIdBody;
  } else {
    if (rol === "admin") {
      return NextResponse.json({ error: "Solo super_admin puede asignar el rol admin" }, { status: 403 });
    }
    const { data: filaCaller } = await supabase
      .from("empresa_usuarios")
      .select("empresa_id")
      .eq("usuario_id", user.id)
      .maybeSingle();
    if (!filaCaller) {
      return NextResponse.json({ error: "No perteneces a ninguna empresa" }, { status: 403 });
    }
    empresaId = filaCaller.empresa_id;

    const { data: tienePermiso } = await supabase.rpc("fn_tiene_permiso", {
      p_usuario_id: user.id,
      p_empresa_id: empresaId,
      p_permiso: "usuarios_gestionar",
    });
    if (!tienePermiso) {
      return NextResponse.json({ error: "No tienes permiso para gestionar usuarios" }, { status: 403 });
    }
  }

  const admin = createAdminClient();
  const { data: nuevoUsuario, error: errorCreate } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (errorCreate || !nuevoUsuario.user) {
    return NextResponse.json({ error: errorCreate?.message ?? "No se pudo crear el usuario" }, { status: 400 });
  }

  const { data: empresaUsuarioId, error: errorRpc } = await supabase.rpc("fn_crear_empresa_usuario", {
    p_usuario_id: nuevoUsuario.user.id,
    p_empresa_id: empresaId,
    p_rol: rol,
  });
  if (errorRpc) {
    // Revertir creación del usuario para no dejar cuentas huérfanas sin acceso
    await admin.auth.admin.deleteUser(nuevoUsuario.user.id);
    return NextResponse.json({ error: errorRpc.message }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    usuario_id: nuevoUsuario.user.id,
    empresa_usuario_id: empresaUsuarioId,
  });
}
