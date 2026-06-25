"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import {
  FileText, ShoppingCart, Package, TrendingUp, AlertTriangle, ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { formatCurrency } from "@/lib/utils";

interface Stats {
  totalVentasMes: number;
  totalComprasMes: number;
  totalFacturas: number;
  productosStockBajo: number;
  nombreEmpresa: string;
  tieneEmpresa: boolean;
  mes: string;
}

export default function DashboardPage() {
  const [stats, setStats]       = useState<Stats | null>(null);
  const [debugInfo, setDebugInfo] = useState<string>("");

  useEffect(() => {
    async function load() {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (!user) {
        setDebugInfo(`Sin sesión activa. Error: ${userError?.message}`);
        return;
      }

      // Buscar empresa - capturar errores explícitamente
      const [resNatural, resJuridica] = await Promise.all([
        supabase.from("empresas_persona_natural").select("id, nombre_completo").eq("user_id", user.id).maybeSingle(),
        supabase.from("empresas_juridicas").select("id, nombre_empresa").eq("user_id", user.id).maybeSingle(),
      ]);

      const en = resNatural.data;
      const ej = resJuridica.data;
      const errNat = resNatural.error;
      const errJur = resJuridica.error;

      // Debug info visible solo si no encuentra empresa
      if (!en && !ej) {
        setDebugInfo(
          `user_id buscado: ${user.id} | ` +
          `Error natural: ${errNat?.code} - ${errNat?.message} | ` +
          `Error jurídica: ${errJur?.code} - ${errJur?.message}`
        );
      }

      const empresa = en ?? ej;
      const nombreEmpresa = en?.nombre_completo ?? ej?.nombre_empresa ?? "Tu empresa";
      const ids = [en?.id, ej?.id].filter(Boolean) as string[];

      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
      const mes = now.toLocaleDateString("es-NI", { month: "long", year: "numeric" });

      let totalVentasMes = 0, totalComprasMes = 0, totalFacturas = 0, productosStockBajo = 0;

      if (ids.length) {
        const [{ data: fac }, { data: com }, { data: prod }] = await Promise.all([
          supabase.from("facturas").select("total").in("empresa_id", ids).gte("fecha_emision", firstDay).neq("estado", "anulada"),
          supabase.from("compras").select("total").in("empresa_id", ids).gte("fecha_compra", firstDay).neq("estado", "anulada"),
          supabase.from("productos").select("stock_actual, stock_minimo").in("empresa_id", ids).eq("activo", true),
        ]);
        totalVentasMes     = fac?.reduce((s, f) => s + Number(f.total), 0) ?? 0;
        totalFacturas      = fac?.length ?? 0;
        totalComprasMes    = com?.reduce((s, c) => s + Number(c.total), 0) ?? 0;
        productosStockBajo = prod?.filter(p => Number(p.stock_actual) <= Number(p.stock_minimo)).length ?? 0;
      }

      setStats({ totalVentasMes, totalComprasMes, totalFacturas, productosStockBajo, nombreEmpresa, tieneEmpresa: !!empresa, mes });
    }
    load();
  }, []);

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-700 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold text-slate-900">
          Bienvenido, {stats.nombreEmpresa}
        </h1>
        <p className="text-slate-500 mt-1 text-sm capitalize">Resumen de {stats.mes}</p>
      </div>

      {!stats.tieneEmpresa && (
        <>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-4 flex items-start gap-4">
            <AlertTriangle className="w-6 h-6 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-amber-900">No se encontraron datos de tu empresa</p>
              <p className="text-amber-700 text-sm mt-1">
                Puede que el registro no se completó correctamente. Ve a <strong>Mi Empresa</strong> para verificar o
                cierra sesión y regístrate de nuevo.
              </p>
              <Link href="/dashboard/empresa" className="text-amber-800 underline text-sm font-medium mt-2 inline-block">
                Ir a Mi Empresa →
              </Link>
            </div>
          </div>
          {/* Panel de diagnóstico - solo visible cuando no hay empresa */}
          {debugInfo && (
            <div className="bg-slate-800 text-green-400 rounded-xl p-4 mb-6 font-mono text-xs break-all">
              <p className="text-slate-400 mb-1 font-sans text-xs font-semibold">🔍 Diagnóstico (comparte esto si necesitas soporte):</p>
              {debugInfo}
            </div>
          )}
        </>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 mb-8">
        <StatCard icon={FileText}     label="Ventas del mes"  value={formatCurrency(stats.totalVentasMes)}  sub={`${stats.totalFacturas} facturas`} color="blue" />
        <StatCard icon={ShoppingCart} label="Compras del mes" value={formatCurrency(stats.totalComprasMes)} color="purple" />
        <StatCard icon={TrendingUp}   label="Utilidad bruta"  value={formatCurrency(stats.totalVentasMes - stats.totalComprasMes)} color="green" />
        <StatCard icon={Package}      label="Stock bajo"      value={String(stats.productosStockBajo)} sub="productos" color={stats.productosStockBajo > 0 ? "red" : "gray"} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <QuickAction href="/dashboard/ventas"   icon={FileText}     title="Nueva Factura"    desc="Emite una factura de venta a tus clientes" color="bg-brand-700"  />
        <QuickAction href="/dashboard/compras"  icon={ShoppingCart} title="Registrar Compra" desc="Registra una compra a tus proveedores"      color="bg-purple-700" />
        <QuickAction href="/dashboard/reportes" icon={TrendingUp}   title="Ver Reportes DGI" desc="Libros de ventas y compras para la DGI"    color="bg-green-700"  />
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: string; sub?: string;
  color: "blue"|"purple"|"green"|"red"|"gray";
}) {
  const cls = {
    blue:   "bg-blue-100 text-blue-700",
    purple: "bg-purple-100 text-purple-700",
    green:  "bg-green-100 text-green-700",
    red:    "bg-red-100 text-red-700",
    gray:   "bg-slate-100 text-slate-600",
  }[color];
  return (
    <div className="card flex items-start gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${cls}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xs font-medium text-slate-500 mb-1">{label}</p>
        <p className="font-display text-2xl font-bold text-slate-900">{value}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function QuickAction({ href, icon: Icon, title, desc, color }: {
  href: string; icon: React.ElementType; title: string; desc: string; color: string;
}) {
  return (
    <Link href={href} className="card hover:shadow-md transition-all group flex items-start gap-4">
      <div className={`w-11 h-11 rounded-xl ${color} flex items-center justify-center flex-shrink-0`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1">
        <p className="font-semibold text-slate-900 group-hover:text-brand-700 transition-colors">{title}</p>
        <p className="text-sm text-slate-500 mt-0.5">{desc}</p>
      </div>
      <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-brand-500 mt-0.5 transition-colors" />
    </Link>
  );
}
