"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback, useMemo } from "react";
import { formatCurrency, formatDate } from "@/lib/utils";
import Link from "next/link";
import { Plus, ShoppingCart, Trash2, Eye, Search, X, Calendar, DollarSign } from "lucide-react";
import { toast } from "sonner";

const BADGE: Record<string, string> = {
  recibida: "badge-info", pagada: "badge-success", borrador: "badge-gray", anulada: "badge-danger",
};

interface Compra {
  id: string; numero_compra: string; fecha_compra: string;
  iva_total: number; total: number; estado: string;
  proveedor: { nombre: string } | null;
}

interface TasaCambio {
  fecha: string;
  tasa: number;
}

export default function ComprasPage() {
  const [compras,    setCompras]    = useState<Compra[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [confirmDel, setConfirmDel] = useState<Compra | null>(null);
  const [empresaId,  setEmpresaId]  = useState("");
  const [tasaHoy,    setTasaHoy]    = useState<TasaCambio | null>(null);

  // ── Filtros ──────────────────────────────────────────────────
  const [filtroNumero,    setFiltroNumero]    = useState("");
  const [filtroProveedor, setFiltroProveedor] = useState("");
  const [filtroDesde,     setFiltroDesde]     = useState("");
  const [filtroHasta,     setFiltroHasta]     = useState("");
  const [filtroEstado,    setFiltroEstado]    = useState("");

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
    const eId = en?.id ?? ej?.id ?? "";
    setEmpresaId(eId);

    const [{ data: comps }, { data: tasas }] = await Promise.all([
      supabase
        .from("compras")
        .select("id, numero_compra, fecha_compra, iva_total, total, estado, proveedor:proveedores(nombre)")
        .in("empresa_id", ids.length ? ids : ["none"])
        .order("created_at", { ascending: false })
        .limit(500),
      eId
        ? supabase
            .from("tasa_cambio")
            .select("fecha, tasa")
            .eq("empresa_id", eId)
            .order("fecha", { ascending: false })
            .limit(1)
        : Promise.resolve({ data: null }),
    ]);

    setCompras((comps as unknown as Compra[]) ?? []);
    if (tasas && tasas.length > 0) setTasaHoy(tasas[0] as TasaCambio);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Filtrado en memoria ───────────────────────────────────────
  const comprasFiltradas = useMemo(() => {
    return compras.filter(c => {
      const proveedor = c.proveedor?.nombre ?? "";
      if (filtroNumero    && !c.numero_compra.toLowerCase().includes(filtroNumero.toLowerCase())) return false;
      if (filtroProveedor && !proveedor.toLowerCase().includes(filtroProveedor.toLowerCase())) return false;
      if (filtroEstado    && c.estado !== filtroEstado) return false;
      if (filtroDesde     && c.fecha_compra < filtroDesde) return false;
      if (filtroHasta     && c.fecha_compra > filtroHasta) return false;
      return true;
    });
  }, [compras, filtroNumero, filtroProveedor, filtroDesde, filtroHasta, filtroEstado]);

  const hayFiltros = filtroNumero || filtroProveedor || filtroDesde || filtroHasta || filtroEstado;

  function limpiarFiltros() {
    setFiltroNumero(""); setFiltroProveedor("");
    setFiltroDesde(""); setFiltroHasta(""); setFiltroEstado("");
  }

  async function handleAnular(c: Compra) {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();

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
      {/* ── Cabecera ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Compras</h1>
          <p className="text-slate-500 text-sm mt-1">Registro de compras a proveedores</p>
        </div>
        <div className="flex items-center gap-3">
          {tasaHoy && (
            <div className="hidden sm:flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
              <DollarSign className="w-3.5 h-3.5 text-green-600" />
              <span className="text-xs font-semibold text-green-700">
                1 USD = C${Number(tasaHoy.tasa).toFixed(4)}
              </span>
              <span className="text-xs text-green-500">· {formatDate(tasaHoy.fecha)}</span>
            </div>
          )}
          <Link href="/dashboard/compras/nueva" className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Nueva compra
          </Link>
        </div>
      </div>

      {/* ── Barra de filtros ── */}
      <div className="card mb-4 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* N° Compra */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="N° Compra"
              value={filtroNumero}
              onChange={e => setFiltroNumero(e.target.value)}
              className="input pl-8 text-sm h-9 w-full"
            />
          </div>

          {/* Proveedor */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Proveedor"
              value={filtroProveedor}
              onChange={e => setFiltroProveedor(e.target.value)}
              className="input pl-8 text-sm h-9 w-full"
            />
          </div>

          {/* Fecha desde */}
          <div className="relative">
            <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <input
              type="date"
              value={filtroDesde}
              onChange={e => setFiltroDesde(e.target.value)}
              className="input pl-8 text-sm h-9 w-full"
              title="Desde"
            />
          </div>

          {/* Fecha hasta */}
          <div className="relative">
            <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <input
              type="date"
              value={filtroHasta}
              onChange={e => setFiltroHasta(e.target.value)}
              className="input pl-8 text-sm h-9 w-full"
              title="Hasta"
            />
          </div>

          {/* Estado */}
          <div className="flex gap-2">
            <select
              value={filtroEstado}
              onChange={e => setFiltroEstado(e.target.value)}
              className="input text-sm h-9 flex-1"
            >
              <option value="">Todos los estados</option>
              <option value="borrador">Borrador</option>
              <option value="recibida">Recibida</option>
              <option value="pagada">Pagada</option>
              <option value="anulada">Anulada</option>
            </select>
            {hayFiltros && (
              <button
                onClick={limpiarFiltros}
                className="h-9 w-9 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0"
                title="Limpiar filtros"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {hayFiltros && (
          <p className="text-xs text-slate-500 mt-2">
            Mostrando <span className="font-semibold text-slate-700">{comprasFiltradas.length}</span> de{" "}
            <span className="font-semibold text-slate-700">{compras.length}</span> compras
          </p>
        )}
      </div>

      {/* ── Tabla ── */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-7 h-7 border-4 border-brand-200 border-t-brand-700 rounded-full animate-spin" />
          </div>
        ) : !comprasFiltradas.length ? (
          <div className="text-center py-16 text-slate-400">
            <ShoppingCart className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium">
              {hayFiltros ? "No hay compras con esos filtros" : "No hay compras registradas"}
            </p>
            {!hayFiltros && (
              <Link href="/dashboard/compras/nueva" className="btn-primary inline-flex items-center gap-2 mt-4">
                <Plus className="w-4 h-4" /> Registrar compra
              </Link>
            )}
            {hayFiltros && (
              <button onClick={limpiarFiltros} className="btn-secondary inline-flex items-center gap-2 mt-4">
                <X className="w-4 h-4" /> Limpiar filtros
              </button>
            )}
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
                {comprasFiltradas.map(c => (
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
                        {c.estado === "borrador" && (
                          <Link href={`/dashboard/compras/${c.id}/editar`}
                            className="text-amber-600 hover:text-amber-800 flex items-center gap-1 text-sm font-medium">
                            ✏️ Editar
                          </Link>
                        )}
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
