"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import {
  FileText, Package, Users, Truck, DollarSign, BarChart3,
  Store, Landmark, Calculator, ClipboardList, BookText, BookOpen, TrendingUp,
  FileBarChart2, UserCheck, CalendarDays, Gift, Building2, CreditCard,
  ShoppingBag, GitMerge, Lock, FileX, Banknote, UserCog, Settings, Home,
} from "lucide-react";
import { usePermissionsSiconic } from "@/hooks/usePermissionsSiconic";

interface ModuloBoton {
  href: string;
  icon: React.ElementType;
  label: string;
}

interface Grupo {
  titulo: string;
  color: "blue" | "purple" | "green" | "amber" | "indigo" | "slate";
  modulos: ModuloBoton[];
}

const CARD_CLASSES: Record<Grupo["color"], string> = {
  blue:   "from-blue-600 to-blue-900 shadow-blue-900/30 hover:shadow-blue-500/40",
  purple: "from-purple-600 to-purple-900 shadow-purple-900/30 hover:shadow-purple-500/40",
  green:  "from-emerald-600 to-emerald-900 shadow-emerald-900/30 hover:shadow-emerald-500/40",
  amber:  "from-amber-500 to-amber-800 shadow-amber-900/30 hover:shadow-amber-500/40",
  indigo: "from-indigo-600 to-indigo-900 shadow-indigo-900/30 hover:shadow-indigo-500/40",
  slate:  "from-slate-600 to-slate-900 shadow-slate-900/30 hover:shadow-slate-500/40",
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, delay: i * 0.04, ease: [0.16, 1, 0.3, 1] },
  }),
};

export default function DashboardPage() {
  const [nombreEmpresa, setNombreEmpresa] = useState<string>("");
  const { loading, can } = usePermissionsSiconic();

  useEffect(() => {
    async function load() {
      const { createClient } = await import("@/lib/supabase/client");
      const { getEmpresaIdActual } = await import("@/lib/supabase/empresa-actual");
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const empresaId = await getEmpresaIdActual(supabase, user.id);
      if (!empresaId) return;

      const [{ data: en }, { data: ej }] = await Promise.all([
        supabase.from("empresas_persona_natural").select("nombre_completo").eq("id", empresaId).maybeSingle(),
        supabase.from("empresas_juridicas").select("nombre_empresa").eq("id", empresaId).maybeSingle(),
      ]);
      setNombreEmpresa(en?.nombre_completo ?? ej?.nombre_empresa ?? "Tu empresa");
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-700 rounded-full animate-spin" />
      </div>
    );
  }

  const grupos: Grupo[] = [
    {
      titulo: "Operaciones",
      color: "blue",
      modulos: [
        { href: "/dashboard/ingreso-datos", icon: FileText,   label: "Ingreso de Datos" },
        { href: "/dashboard/clientes",    icon: Users,        label: "Clientes" },
        { href: "/dashboard/proveedores", icon: Truck,        label: "Proveedores" },
        { href: "/dashboard/inventario",  icon: Package,      label: "Inventario" },
        { href: "/dashboard/tasa-cambio", icon: DollarSign,   label: "Tasa de Cambio" },
        ...(can("vet_ver") ? [{ href: "/dashboard/reportes", icon: BarChart3, label: "Reportes DGI" }] : []),
        ...(can("pos_ver") ? [{ href: "/dashboard/pos", icon: Store, label: "Punto de Venta" }] : []),
        ...(can("caja_bancos_ver") ? [
          { href: "/dashboard/caja-bancos", icon: Landmark, label: "Caja y Bancos" },
          { href: "/dashboard/caja-bancos/arqueos", icon: Calculator, label: "Arqueos de Caja" },
        ] : []),
      ],
    },
    {
      titulo: "Contabilidad",
      color: "indigo",
      modulos: [
        { href: "/dashboard/contabilidad",              icon: ClipboardList, label: "Asientos (Diario)" },
        { href: "/dashboard/contabilidad/plan-cuentas",  icon: BookText,      label: "Plan de Cuentas" },
        { href: "/dashboard/contabilidad/mayor",         icon: BookOpen,      label: "Libro Mayor" },
        { href: "/dashboard/contabilidad/balance",       icon: TrendingUp,    label: "Balance" },
        { href: "/dashboard/estados-financieros",        icon: FileBarChart2, label: "Estados Financieros" },
      ],
    },
    ...(can("nomina_ver") ? [{
      titulo: "Nómina",
      color: "purple" as const,
      modulos: [
        { href: "/dashboard/nomina/empleados",     icon: UserCheck,     label: "Empleados y Cargos" },
        { href: "/dashboard/nomina/planilla",      icon: CalendarDays,  label: "Planilla Salarial" },
        { href: "/dashboard/nomina/prestaciones",  icon: Gift,          label: "Prestaciones Sociales" },
        { href: "/dashboard/nomina/reportes",      icon: FileBarChart2, label: "Reportes INSS/INATEC" },
      ],
    }] : []),
    {
      titulo: "Tributación DGI",
      color: "green",
      modulos: [
        { href: "/dashboard/activos-fijos",            icon: Building2,     label: "Activos Fijos" },
        { href: "/dashboard/tributacion",               icon: Calculator,    label: "Calendario Tributario" },
        { href: "/dashboard/tributacion/ir-anual",      icon: FileText,      label: "IR Anual — F106" },
        { href: "/dashboard/tributacion/anticipos-ir",  icon: DollarSign,    label: "Anticipos IR" },
        { href: "/dashboard/tributacion/imi",           icon: Building2,     label: "IMI Municipal" },
        { href: "/dashboard/tributacion/ibi",           icon: Home,          label: "IBI Municipal" },
        { href: "/dashboard/tributacion/isc",           icon: Banknote,      label: "ISC" },
        { href: "/dashboard/tributacion/retenciones",   icon: FileBarChart2, label: "Retenciones Definitivas" },
      ],
    },
    {
      titulo: "Contabilidad Avanzada",
      color: "amber",
      modulos: [
        { href: "/dashboard/cxc",                   icon: CreditCard,  label: "Cuentas por Cobrar" },
        { href: "/dashboard/cxp",                   icon: ShoppingBag, label: "Cuentas por Pagar" },
        { href: "/dashboard/conciliacion-bancaria", icon: GitMerge,    label: "Conciliación Bancaria" },
        { href: "/dashboard/cierre-contable",       icon: Lock,        label: "Cierre Contable" },
        { href: "/dashboard/notas-credito-debito",  icon: FileX,       label: "Notas Crédito/Débito" },
      ],
    },
    ...((can("usuarios_ver") || can("configuracion")) ? [{
      titulo: "Administración",
      color: "slate" as const,
      modulos: [
        ...(can("usuarios_ver") ? [{ href: "/dashboard/empresa/usuarios", icon: UserCog, label: "Usuarios y Roles" }] : []),
        ...(can("configuracion") ? [
          { href: "/dashboard/empresa", icon: Building2, label: "Mi Empresa" },
          { href: "/dashboard/configuracion", icon: Settings, label: "Configuración" },
        ] : []),
      ],
    }] : []),
  ];

  let cardIndex = 0;
  const COLS = 4;

  return (
    <div className="relative max-w-6xl mx-auto">
      {/* Decoración de fondo sutil */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden -z-10">
        <div className="absolute top-10 -left-10 w-72 h-72 bg-blue-200/30 rounded-full blur-3xl" />
        <div className="absolute top-40 -right-10 w-80 h-80 bg-indigo-200/30 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center mb-10"
      >
        <h1 className="font-display text-3xl md:text-4xl font-bold">
          Bienvenido
          {nombreEmpresa && (
            <>
              ,{" "}
              <span className="bg-gradient-to-r from-amber-500 to-amber-600 bg-clip-text text-transparent">
                {nombreEmpresa}
              </span>
            </>
          )}
        </h1>
        <p className="text-slate-500 mt-2 text-sm">¿Qué quieres hacer hoy?</p>
      </motion.div>

      <div className="space-y-10">
        {grupos.map((grupo) => {
          const relleno = (COLS - (grupo.modulos.length % COLS)) % COLS;
          return (
            <div key={grupo.titulo}>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-4 px-1">
                {grupo.titulo}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {grupo.modulos.map((m) => {
                  const i = cardIndex++;
                  return (
                    <motion.div
                      key={m.href}
                      initial="hidden"
                      animate="show"
                      custom={i}
                      variants={fadeUp}
                    >
                      <Link
                        href={m.href}
                        className={`group relative overflow-hidden flex flex-col items-center justify-center gap-3 text-center rounded-2xl p-5 h-full bg-gradient-to-br shadow-lg transition-all duration-300 hover:-translate-y-1.5 hover:shadow-2xl ${CARD_CLASSES[grupo.color]}`}
                      >
                        {/* Ripple / glow al hover */}
                        <span className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_50%_50%,rgba(255,255,255,0.35),transparent_70%)] opacity-0 scale-50 group-hover:opacity-100 group-hover:scale-100 transition-all duration-500" />

                        <div className="relative w-12 h-12 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center transition-all duration-300 group-hover:scale-110 group-hover:bg-white/25">
                          <m.icon className="w-6 h-6 text-white" />
                        </div>
                        <p className="relative text-sm font-semibold text-white leading-snug">
                          {m.label}
                        </p>
                      </Link>
                    </motion.div>
                  );
                })}

                {relleno > 0 && Array.from({ length: relleno }).map((_, i) => (
                  <div
                    key={`placeholder-${grupo.titulo}-${i}`}
                    className="flex flex-col items-center justify-center gap-3 text-center rounded-2xl p-5 h-full border-2 border-dashed border-slate-200 text-slate-300"
                  >
                    <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center">
                      <Package className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-medium">Módulo personalizable</p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
