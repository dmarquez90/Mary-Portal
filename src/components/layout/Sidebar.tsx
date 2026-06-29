"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  ShoppingCart,
  Package,
  BarChart3,
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
  Landmark,
  UserCheck,
  CalendarDays,
  Gift,
  FileBarChart2,
  Building2,
  DollarSign,
  CreditCard,
  ShoppingBag,
  GitMerge,
  Lock,
  FileX,
  Calculator,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const NAV_PRINCIPAL = [
  { href: "/dashboard",              icon: LayoutDashboard, label: "Inicio"        },
  { href: "/dashboard/ventas",       icon: FileText,        label: "Ventas"        },
  { href: "/dashboard/ventas/cobro", icon: Banknote, label: "Cobro en Caja" },
{ href: "/dashboard/caja-bancos/arqueo", icon: Calculator, label: "Arqueo de Caja" },
  { href: "/dashboard/compras",      icon: ShoppingCart,    label: "Compras"       },
  { href: "/dashboard/caja-bancos",  icon: Landmark,        label: "Caja y Bancos" },
  { href: "/dashboard/tasa-cambio", icon: DollarSign, label: "Tasa de Cambio" },
  { href: "/dashboard/clientes",     icon: Users,           label: "Clientes"      },
  { href: "/dashboard/proveedores",  icon: Truck,           label: "Proveedores"   },
  { href: "/dashboard/inventario",   icon: Package,         label: "Inventario"    },
  { href: "/dashboard/reportes",     icon: BarChart3,       label: "Reportes"      },
];

const NAV_CONTABILIDAD = [
  { href: "/dashboard/contabilidad",              icon: ClipboardList,  label: "Asientos (Diario)" },
  { href: "/dashboard/contabilidad/plan-cuentas", icon: BookText,       label: "Plan de Cuentas"   },
  { href: "/dashboard/contabilidad/mayor",        icon: BookOpen,       label: "Libro Mayor"       },
  { href: "/dashboard/contabilidad/balance",      icon: TrendingUp,     label: "Balance"           },
];

const NAV_NOMINA = [
  { href: "/dashboard/nomina/empleados",   icon: UserCheck,      label: "Empleados y Cargos"  },
  { href: "/dashboard/nomina/planilla",    icon: CalendarDays,   label: "Planilla Salarial"   },
  { href: "/dashboard/nomina/prestaciones",icon: Gift,           label: "Prestaciones Sociales"},
  { href: "/dashboard/nomina/reportes",    icon: FileBarChart2,  label: "Reportes INSS/INATEC"},
];

const NAV_ACTIVOS = [
  { href: "/dashboard/activos-fijos",  icon: Building2,  label: "Activos Fijos" },
];

const NAV_TRIBUTACION = [
  { href: "/dashboard/tributacion",                  icon: Calculator,   label: "Calendario Tributario" },
  { href: "/dashboard/tributacion/ir-anual",         icon: FileText,     label: "IR Anual — F106"       },
  { href: "/dashboard/tributacion/anticipos-ir",     icon: DollarSign,   label: "Anticipos IR"          },
  { href: "/dashboard/tributacion/imi",              icon: Building2,    label: "IMI Municipal"         },
  { href: "/dashboard/tributacion/retenciones",      icon: FileBarChart2,label: "Retenciones Definitivas"},
];

const NAV_AVANZADO = [
  { href: "/dashboard/cxc",                    icon: CreditCard,  label: "Cuentas por Cobrar (CxC)" },
  { href: "/dashboard/cxp",                    icon: ShoppingBag, label: "Cuentas por Pagar (CxP)"  },
  { href: "/dashboard/conciliacion-bancaria",  icon: GitMerge,    label: "Conciliación Bancaria"     },
  { href: "/dashboard/cierre-contable",        icon: Lock,        label: "Cierre Contable"           },
  { href: "/dashboard/notas-credito-debito",   icon: FileX,       label: "Notas Crédito/Débito"      },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [contabOpen, setContabOpen] = useState(
    pathname.startsWith("/dashboard/contabilidad")
  );
  const [nominaOpen, setNominaOpen] = useState(
    pathname.startsWith("/dashboard/nomina")
  );
  const [tributacionOpen, setTributacionOpen] = useState(
    pathname.startsWith("/dashboard/tributacion")
  );
  const [avanzadoOpen, setAvanzadoOpen] = useState(
    ["/dashboard/cxc","/dashboard/cxp","/dashboard/conciliacion","/dashboard/cierre","/dashboard/notas"].some(p => pathname.startsWith(p))
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

  const SectionToggle = ({
    label, icon: Icon, isOpen, onToggle, basePath,
  }: {
    label: string; icon: React.ElementType; isOpen: boolean;
    onToggle: () => void; basePath: string;
  }) => (
    <button
      onClick={onToggle}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors w-full",
        pathname.startsWith(basePath)
          ? "bg-white/15 text-white"
          : "text-blue-200 hover:bg-white/10 hover:text-white"
      )}
    >
      <Icon className="w-5 h-5 flex-shrink-0" />
      <span className="flex-1 text-left">{label}</span>
      {isOpen
        ? <ChevronDown className="w-4 h-4" />
        : <ChevronRight className="w-4 h-4" />
      }
    </button>
  );

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
            <SectionToggle
              label="Contabilidad"
              icon={BookOpen}
              isOpen={contabOpen}
              onToggle={() => setContabOpen(!contabOpen)}
              basePath="/dashboard/contabilidad"
            />
            {contabOpen && (
              <div className="ml-4 mt-1 space-y-1 border-l border-white/10 pl-3">
                {NAV_CONTABILIDAD.map(({ href, icon, label }) => (
                  <NavLink key={href} href={href} icon={icon} label={label} />
                ))}
              </div>
            )}
          </div>

          {/* Sección Nómina */}
          <div className="pt-2">
            <p className="text-xs font-semibold text-blue-400/60 uppercase tracking-wider px-3 mb-2">
              Nómina
            </p>
            <SectionToggle
              label="Nómina y Planilla"
              icon={CalendarDays}
              isOpen={nominaOpen}
              onToggle={() => setNominaOpen(!nominaOpen)}
              basePath="/dashboard/nomina"
            />
            {nominaOpen && (
              <div className="ml-4 mt-1 space-y-1 border-l border-white/10 pl-3">
                {NAV_NOMINA.map(({ href, icon, label }) => (
                  <NavLink key={href} href={href} icon={icon} label={label} />
                ))}
              </div>
            )}
          </div>

          {/* Activos Fijos */}
          <div className="pt-2">
            <p className="text-xs font-semibold text-blue-400/60 uppercase tracking-wider px-3 mb-2">
              Activos Fijos
            </p>
            {NAV_ACTIVOS.map(({ href, icon, label }) => (
              <NavLink key={href} href={href} icon={icon} label={label} />
            ))}
          </div>

          {/* Tributación */}
          <div className="pt-2">
            <p className="text-xs font-semibold text-blue-400/60 uppercase tracking-wider px-3 mb-2">
              Tributación DGI
            </p>
            <SectionToggle
              label="Tributación"
              icon={Calculator}
              isOpen={tributacionOpen}
              onToggle={() => setTributacionOpen(!tributacionOpen)}
              basePath="/dashboard/tributacion"
            />
            {tributacionOpen && (
              <div className="ml-4 mt-1 space-y-1 border-l border-white/10 pl-3">
                {NAV_TRIBUTACION.map(({ href, icon, label }) => (
                  <NavLink key={href} href={href} icon={icon} label={label} />
                ))}
              </div>
            )}
          </div>

          {/* Funciones Avanzadas */}
          <div className="pt-2">
            <p className="text-xs font-semibold text-blue-400/60 uppercase tracking-wider px-3 mb-2">
              Contabilidad Avanzada
            </p>
            <SectionToggle
              label="Módulos Avanzados"
              icon={TrendingUp}
              isOpen={avanzadoOpen}
              onToggle={() => setAvanzadoOpen(!avanzadoOpen)}
              basePath="/dashboard/cxc"
            />
            {avanzadoOpen && (
              <div className="ml-4 mt-1 space-y-1 border-l border-white/10 pl-3">
                {NAV_AVANZADO.map(({ href, icon, label }) => (
                  <NavLink key={href} href={href} icon={icon} label={label} />
                ))}
              </div>
            )}
          </div>

          {/* Configuración */}
          <div className="pt-3">
            <div className="border-t border-white/10 mb-3" />
            <NavLink href="/dashboard/configuracion" icon={Settings} label="Configuración" />
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
