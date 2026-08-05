"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, LogOut } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function TopBar() {
  const pathname = usePathname();
  const router = useRouter();
  const enInicio = pathname === "/dashboard";

  async function handleLogout() {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    await supabase.auth.signOut();
    toast.success("Sesión cerrada");
    router.push("/auth/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-40 bg-brand-900 text-white shadow-md">
      <div className="grid grid-cols-[auto_1fr_auto] items-center h-16 pl-3 pr-4 sm:pl-4 sm:pr-6">
        <span className="font-display text-lg font-bold whitespace-nowrap">Factura Nica</span>

        <span className="hidden sm:block text-center text-[1.75rem] font-medium text-blue-200 tracking-wide">
          Sistema Contable de Nicaragua
        </span>

        <div className="flex items-center gap-2 justify-self-end">
          {!enInicio && (
            <Link
              href="/dashboard"
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-white/10 hover:bg-white/20 transition-colors"
            >
              <Home className="w-4 h-4" />
              Inicio
            </Link>
          )}
          <button
            onClick={handleLogout}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-blue-200 hover:bg-white/10 hover:text-white transition-colors"
            )}
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Cerrar sesión</span>
          </button>
        </div>
      </div>
    </header>
  );
}
