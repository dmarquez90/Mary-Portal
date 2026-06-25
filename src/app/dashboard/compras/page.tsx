"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback } from "react";
import { formatCurrency, formatDate } from "@/lib/utils";
import Link from "next/link";
import { Plus, ShoppingCart, Trash2, Eye } from "lucide-react";
import { toast } from "sonner";

const BADGE: Record<string, string> = {
  recibida: "badge-info", pagada: "badge-success", borrador: "badge-gray", anulada: "badge-danger",
};

interface Compra {
  id: string; numero_compra: string; fecha_compra: string;
  iva_total: number; total: number; estado: string; proveedor: { nombre: string } | null;
}

export default function ComprasPage() {
  const [compras,    setCompras]    = useState<Compra[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [confirmDel, setConfirmDel] = useState<Compra | null>(null);
  const [empresaId,  setEmpresaId]  = useState("");

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
    setEmpresaId(en?.id ?? ej?.id ?? "");

    const { data } = await supabase
      .from("compras")
      .select("id, numero_compra, fecha_compra, iva_total, total, estado, proveedor:proveedores(nombre)")
      .in("empresa_id", ids.length ? ids : ["none"])
      .order("created_at", { ascending: false })
      .limit(100);

    setCompras((data as unknown as Compra[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleAnular(c: Compra) {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();

    // Si estaba recibida, revertir stock
    if (c.estado === "recibida") {
      const { data: detalles } = await supabase
        .from("detalle_compras")
        .select("producto_id, cantidad")
        .eq("compra_id", c.id);

      for (const d of detalles ?? []) {
        if (!d.producto_id) continue;
        const { data: prod } = await supabase.from("productos").select("stock_actual").eq("id", d.producto_id).single();
        const stockNuevo = Math.max(0, Number(prod?.stock_actual ?? 0) - Number(d.cantidad));
        await supabase.from("productos").update({ stock_actual: stockNuevo }).eq("id", d.producto_id);

        // Eliminar lotes creados por esta compra
        await supabase.from("lotes_inventario").delete().eq("compra_id", c.id).eq("producto_id", d.producto_id);
      }
    }

    await supabase.from("compras").update({ estado: "anulada" }).eq("id", c.id);
    toast.success(`Compra ${c.numero_compra} anulada${c.estado === "recibida" ? " — stock revertido" : ""}`);
    setConfirmDel(null);
    loadData();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Compras</h1>
          <p className="text-slate-500 text-sm mt-1">Registro de compras a proveedores</p>
        </div>
        <Link href="/dashboard/compras/nueva" className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Nueva compra
        </Link>
      </div>

      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-7 h-7 border-4 border-brand-200 border-t-brand-700 rounded-full animate-spin" />
          </div>
        ) : !compras.length ? (
          <div className="text-center py-16 text-slate-400">
            <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No hay compras registradas</p>
            <Link href="/dashboard/compras/nueva" className="btn-primary inline-flex items-center gap-2 mt-4">
              <Plus className="w-4 h-4" /> Registrar compra
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="table-header">N° Compra</th>
                  <th className="table-header">Proveedor</th>
                  <th className="table-header">Fecha</th>
                  <th className="table-header">IVA</th>
                  <th className="table-header">Total</th>
                  <th className="table-header">Estado</th>
                  <th className="table-header">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {compras.map(c => (
                  <tr key={c.id} className={`hover:bg-slate-50 transition-colors ${c.estado === "anulada" ? "opacity-50" : ""}`}>
                    <td className="table-cell font-mono font-medium text-purple-700">{c.numero_compra}</td>
                    <td className="table-cell">{c.proveedor?.nombre ?? "—"}</td>
                    <td className="table-cell">{formatDate(c.fecha_compra)}</td>
                    <td className="table-cell">{formatCurrency(c.iva_total)}</td>
                    <td className="table-cell font-semibold">{formatCurrency(c.total)}</td>
                    <td className="table-cell">
                      <span className={BADGE[c.estado] ?? "badge-gray"}>
                        {c.estado.charAt(0).toUpperCase() + c.estado.slice(1)}
                      </span>
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-3">
                        <Link href={`/dashboard/compras/${c.id}`}
                          className="text-purple-700 hover:text-purple-900 flex items-center gap-1 text-sm font-medium">
                          <Eye className="w-4 h-4" /> Ver
                        </Link>
                        {c.estado !== "anulada" && (
                          <button
                            onClick={() => setConfirmDel(c)}
                            className="text-red-400 hover:text-red-600 flex items-center gap-1 text-sm"
                          >
                            <Trash2 className="w-4 h-4" />
                            Anular
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirmar anulación */}
      {confirmDel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-modal w-full max-w-sm p-6 text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="font-display font-bold text-slate-900 mb-2">¿Anular compra?</h3>
            <p className="text-slate-500 text-sm mb-2">
              Compra <strong>{confirmDel.numero_compra}</strong>
            </p>
            {confirmDel.estado === "recibida" && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800 text-xs mb-4">
                ⚠️ Esta compra ya fue recibida. Al anularla se <strong>revertirá el stock</strong> del inventario.
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => handleAnular(confirmDel)} className="btn-danger flex-1">Sí, anular</button>
              <button onClick={() => setConfirmDel(null)} className="btn-secondary flex-1">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
