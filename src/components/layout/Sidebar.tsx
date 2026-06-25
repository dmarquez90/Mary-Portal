"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  ShoppingCart,
  Package,
  BarChart3,
  Building2,
  Users,
  Truck,
  Settings,
  LogOut,
  Menu,
  X,
  BookOpen,
  BookText,
  TrendingUp,
  ClipboardList,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const NAV_PRINCIPAL = [
  { href: "/dashboard",             icon: LayoutDashboard, label: "Inicio"       },
  { href: "/dashboard/ventas",      icon: FileText,        label: "Ventas"       },
  { href: "/dashboard/compras",     icon: ShoppingCart,    label: "Compras"      },
  { href: "/dashboard/clientes",    icon: Users,           label: "Clientes"     },
  { href: "/dashboard/proveedores", icon: Truck,           label: "Proveedores"  },
  { href: "/dashboard/inventario",  icon: Package,         label: "Inventario"   },
  { href: "/dashboard/reportes",    icon: BarChart3,       label: "Reportes"     },
];

const NAV_CONTABILIDAD = [
  { href: "/dashboard/contabilidad",              icon: ClipboardList, label: "Asientos (Diario)" },
  { href: "/dashboard/contabilidad/plan-cuentas", icon: BookText,      label: "Plan de Cuentas"   },
  { href: "/dashboard/contabilidad/mayor",        icon: BookOpen,      label: "Libro Mayor"       },
  { href: "/dashboard/contabilidad/balance",      icon: TrendingUp,    label: "Balance"           },
];

const NAV_BOTTOM = [
  { href: "/dashboard/empresa",       icon: Building2, label: "Mi Empresa"    },
  { href: "/dashboard/configuracion", icon: Settings,  label: "Configuración" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [contabOpen, setContabOpen] = useState(
    pathname.startsWith("/dashboard/contabilidad")
  );

  async function handleLogout() {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    await supabase.auth.signOut();
    toast.success("Sesión cerrada");
    router.push("/auth/login");
    router.refresh();
  }

  const NavLink = ({ href, icon: Icon, label }: {
    href: string; icon: React.ElementType; label: string
  }) => {
    const active = href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname === href || pathname.startsWith(href + "/");
    return (
      <Link
        href={href}
        onClick={() => setOpen(false)}
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
          active
            ? "bg-white/15 text-white"
            : "text-blue-200 hover:bg-white/10 hover:text-white"
        )}
      >
        <Icon className="w-5 h-5 flex-shrink-0" />
        {label}
      </Link>
    );
  };

  return (
    <>
      {/* Mobile toggle */}
      <button
        className="lg:hidden fixed top-4 left-4 z-50 bg-brand-800 text-white p-2 rounded-lg shadow-lg"
        onClick={() => setOpen(!open)}
      >
        {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Overlay mobile */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/40"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 z-40 h-screen w-64 bg-brand-900 text-white flex flex-col transition-transform duration-300",
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {/* Logo */}
        <div className="px-6 py-6 border-b border-white/10">
          <span className="font-display text-xl font-bold">SARA</span>
          <p className="text-blue-300 text-xs mt-1">Sistema Administrativo</p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 space-y-1 px-3 overflow-y-auto">

          {/* Módulos principales */}
          {NAV_PRINCIPAL.map(({ href, icon, label }) => (
            <NavLink key={href} href={href} icon={icon} label={label} />
          ))}

          {/* Sección Contabilidad */}
          <div className="pt-3">
            <p className="text-xs font-semibold text-blue-400/60 uppercase tracking-wider px-3 mb-2">
              Contabilidad
            </p>
            <button
              onClick={() => setContabOpen(!contabOpen)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors w-full",
                pathname.startsWith("/dashboard/contabilidad")
                  ? "bg-white/15 text-white"
                  : "text-blue-200 hover:bg-white/10 hover:text-white"
              )}
            >
              <BookOpen className="w-5 h-5 flex-shrink-0" />
              <span className="flex-1 text-left">Contabilidad</span>
              {contabOpen
                ? <ChevronDown className="w-4 h-4" />
                : <ChevronRight className="w-4 h-4" />
              }
            </button>

            {contabOpen && (
              <div className="ml-4 mt-1 space-y-1 border-l border-white/10 pl-3">
                {NAV_CONTABILIDAD.map(({ href, icon, label }) => (
                  <NavLink key={href} href={href} icon={icon} label={label} />
                ))}
              </div>
            )}
          </div>

          {/* Mi Empresa y Configuración */}
          <div className="pt-3">
            <div className="border-t border-white/10 mb-3" />
            {NAV_BOTTOM.map(({ href, icon, label }) => (
              <NavLink key={href} href={href} icon={icon} label={label} />
            ))}
          </div>

        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-white/10">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-blue-200 hover:bg-white/10 hover:text-white transition-colors"
          >
            <LogOut className="w-5 h-5" />
            Cerrar sesión
          </button>
        </div>
      </aside>
    </>
  );
}
