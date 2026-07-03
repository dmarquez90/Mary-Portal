export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/layout/Sidebar";

// Super Admin no posee ninguna empresa (empresas_persona_natural/juridicas)
// -- es un rol de plataforma aparte. Cualquier ruta bajo /dashboard asume que
// el usuario tiene una empresa propia, así que a un super_admin se le redirige
// a su panel dedicado en vez de mostrarle el dashboard vacío/confuso.
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: superAdminRow } = await supabase
      .from("super_admins")
      .select("usuario_id")
      .eq("usuario_id", user.id)
      .maybeSingle();
    if (superAdminRow) redirect("/super-admin");
  }

  return (
    <div className="flex min-h-screen bg-surface">
      <Sidebar />
      <main className="flex-1 lg:ml-64 p-6 lg:p-8">
        {children}
      </main>
    </div>
  );
}
