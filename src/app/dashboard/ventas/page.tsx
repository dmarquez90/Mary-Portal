"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback } from "react";
import { formatCurrency, formatDate } from "@/lib/utils";
import Link from "next/link";
import { Plus, FileText, Eye, Printer } from "lucide-react";

const BADGE: Record<string, string> = {
  emitida: "badge-info", pagada: "badge-success", borrador: "badge-gray", anulada: "badge-danger",
};

interface Factura {
  id: string; numero_factura: string; fecha_emision: string;
  total: number; estado: string;
  cliente_nombre?: string;
  cliente: { nombre: string } | null;
}

export default function VentasPage() {
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [loading,  setLoading]  = useState(true);

  const loadData = useCallback(async () => {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: en }, { data: ej }] = await Promise.all([
      supabase.from("empresas_persona_natural").select("id").eq("user_id", user.id).maybeSingle(),
      supabase.from("empresas_juridicas").select("id").eq("user_id", user.id).maybeSingle(),
    ]);
    const ids = [en?.id, ej?.id].filter(Boolean) as string[];

    const { data } = await supabase
      .from("facturas")
      .select("id, numero_factura, fecha_emision, total, estado, cliente_nombre, cliente:clientes(nombre)")
      .in("empresa_id", ids.length ? ids : ["none"])
      .order("created_at", { ascending: false })
      .limit(100);

    setFacturas((data as unknown as Factura[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Ventas</h1>
          <p className="text-slate-500 text-sm mt-1">Gestiona tus facturas de venta</p>
        </div>
        <Link href="/dashboard/ventas/nueva" className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Nueva factura
        </Link>
      </div>

      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-7 h-7 border-4 border-brand-200 border-t-brand-700 rounded-full animate-spin" />
          </div>
        ) : !facturas.length ? (
          <div className="text-center py-16 text-slate-400">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No hay facturas aún</p>
            <Link href="/dashboard/ventas/nueva" className="btn-primary inline-flex items-center gap-2 mt-4">
              <Plus className="w-4 h-4" /> Nueva factura
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="table-header">N° Factura</th>
                  <th className="table-header">Cliente</th>
                  <th className="table-header">Fecha</th>
                  <th className="table-header">Total</th>
                  <th className="table-header">Estado</th>
                  <th className="table-header">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {facturas.map(f => {
                  const nombreCliente = f.cliente?.nombre ?? f.cliente_nombre ?? "Consumidor final";
                  return (
                    <tr key={f.id} className={`hover:bg-slate-50 transition-colors ${f.estado === "anulada" ? "opacity-50" : ""}`}>
                      <td className="table-cell font-mono font-medium text-brand-700">{f.numero_factura}</td>
                      <td className="table-cell">{nombreCliente}</td>
                      <td className="table-cell">{formatDate(f.fecha_emision)}</td>
                      <td className="table-cell font-semibold">{formatCurrency(f.total)}</td>
                      <td className="table-cell">
                        <span className={BADGE[f.estado] ?? "badge-gray"}>
                          {f.estado.charAt(0).toUpperCase() + f.estado.slice(1)}
                        </span>
                      </td>
                      <td className="table-cell">
                        <div className="flex items-center gap-3">
                          <Link href={`/dashboard/ventas/${f.id}`}
                            className="text-brand-700 hover:text-brand-900 flex items-center gap-1 text-sm font-medium">
                            <Eye className="w-4 h-4" /> Ver
                          </Link>
                          <Link href={`/dashboard/ventas/${f.id}`}
                            className="text-slate-400 hover:text-slate-700 flex items-center gap-1 text-sm">
                            <Printer className="w-4 h-4" /> Imprimir
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
