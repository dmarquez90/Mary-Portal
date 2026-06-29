"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback, useMemo } from "react";
import { formatCurrency, formatDate } from "@/lib/utils";
import Link from "next/link";
import { Plus, FileText, Eye, Printer, Search, X, Calendar, DollarSign } from "lucide-react";

const BADGE: Record<string, string> = {
  emitida: "badge-info", pagada: "badge-success",
  borrador: "badge-gray", anulada: "badge-danger",
};

interface Factura {
  id: string;
  numero_factura: string;
  fecha_emision: string;
  total: number;
  estado: string;
  cliente_nombre?: string;
  cliente: { nombre: string } | null;
}

interface TasaCambio { fecha: string; tasa: number; }

export default function VentasPage() {
  const [facturas,    setFacturas]    = useState<Factura[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [tasaHoy,     setTasaHoy]     = useState<TasaCambio | null>(null);

  // ── Filtros ──────────────────────────────────────────────────
  const [filtroNumero,  setFiltroNumero]  = useState("");
  const [filtroCliente, setFiltroCliente] = useState("");
  const [filtroDesde,   setFiltroDesde]   = useState("");
  const [filtroHasta,   setFiltroHasta]   = useState("");
  const [filtroEstado,  setFiltroEstado]  = useState("");

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
    const empresaId = en?.id ?? ej?.id ?? "";

    const [{ data: facts }, { data: tasas }] = await Promise.all([
      supabase
        .from("facturas")
        .select("id, numero_factura, fecha_emision, total, estado, cliente_nombre, cliente:clientes(nombre)")
        .in("empresa_id", ids.length ? ids : ["none"])
        .order("created_at", { ascending: false })
        .limit(500),
      empresaId
        ? supabase.from("tasa_cambio").select("fecha, tasa").eq("empresa_id", empresaId)
            .order("fecha", { ascending: false }).limit(1)
        : Promise.resolve({ data: null }),
    ]);

    setFacturas((facts as unknown as Factura[]) ?? []);
    if (tasas && tasas.length > 0) setTasaHoy(tasas[0] as TasaCambio);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Filtrado en memoria ───────────────────────────────────────
  const facturasFiltradas = useMemo(() => {
    return facturas.filter(f => {
      const nombre = f.cliente?.nombre ?? f.cliente_nombre ?? "";
      if (filtroNumero  && !f.numero_factura.toLowerCase().includes(filtroNumero.toLowerCase())) return false;
      if (filtroCliente && !nombre.toLowerCase().includes(filtroCliente.toLowerCase())) return false;
      if (filtroEstado  && f.estado !== filtroEstado) return false;
      if (filtroDesde   && f.fecha_emision < filtroDesde) return false;
      if (filtroHasta   && f.fecha_emision > filtroHasta) return false;
      return true;
    });
  }, [facturas, filtroNumero, filtroCliente, filtroDesde, filtroHasta, filtroEstado]);

  const hayFiltros = filtroNumero || filtroCliente || filtroDesde || filtroHasta || filtroEstado;

  function limpiarFiltros() {
    setFiltroNumero(""); setFiltroCliente("");
    setFiltroDesde("");  setFiltroHasta(""); setFiltroEstado("");
  }

  return (
    <div>
      {/* ── Cabecera ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Ventas</h1>
          <p className="text-slate-500 text-sm mt-1">Gestiona tus facturas de venta</p>
        </div>
        <div className="flex items-center gap-3">
          {tasaHoy && (
            <div className="hidden sm:flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
              <DollarSign className="w-3.5 h-3.5 text-green-600" />
              <span className="text-xs font-semibold text-green-700">1 USD = C${Number(tasaHoy.tasa).toFixed(4)}</span>
              <span className="text-xs text-green-500">· {formatDate(tasaHoy.fecha)}</span>
            </div>
          )}
          <Link href="/dashboard/ventas/nueva" className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Nueva factura
          </Link>
        </div>
      </div>

      {/* ── Barra de filtros ── */}
      <div className="card mb-4 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input type="text" placeholder="N° Factura" value={filtroNumero}
              onChange={e => setFiltroNumero(e.target.value)} className="input pl-8 text-sm h-9 w-full" />
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input type="text" placeholder="Cliente" value={filtroCliente}
              onChange={e => setFiltroCliente(e.target.value)} className="input pl-8 text-sm h-9 w-full" />
          </div>
          <div className="relative">
            <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <input type="date" value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)}
              className="input pl-8 text-sm h-9 w-full" title="Desde" />
          </div>
          <div className="relative">
            <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <input type="date" value={filtroHasta} onChange={e => setFiltroHasta(e.target.value)}
              className="input pl-8 text-sm h-9 w-full" title="Hasta" />
          </div>
          <div className="flex gap-2">
            <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
              className="input text-sm h-9 flex-1">
              <option value="">Todos los estados</option>
              <option value="borrador">Borrador</option>
              <option value="emitida">Emitida</option>
              <option value="pagada">Pagada</option>
              <option value="anulada">Anulada</option>
            </select>
            {hayFiltros && (
              <button onClick={limpiarFiltros} title="Limpiar filtros"
                className="h-9 w-9 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors flex-shrink-0">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        {hayFiltros && (
          <p className="text-xs text-slate-500 mt-2">
            Mostrando <strong className="text-slate-700">{facturasFiltradas.length}</strong> de{" "}
            <strong className="text-slate-700">{facturas.length}</strong> facturas
          </p>
        )}
      </div>

      {/* ── Tabla ── */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-7 h-7 border-4 border-brand-200 border-t-brand-700 rounded-full animate-spin" />
          </div>
        ) : !facturasFiltradas.length ? (
          <div className="text-center py-16 text-slate-400">
            <FileText className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium">
              {hayFiltros ? "No hay facturas con esos filtros" : "No hay facturas aún"}
            </p>
            {!hayFiltros
              ? <Link href="/dashboard/ventas/nueva" className="btn-primary inline-flex items-center gap-2 mt-4"><Plus className="w-4 h-4" /> Nueva factura</Link>
              : <button onClick={limpiarFiltros} className="btn-secondary inline-flex items-center gap-2 mt-4"><X className="w-4 h-4" /> Limpiar filtros</button>
            }
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
                {facturasFiltradas.map(f => {
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
                          {/* Borrador → puede continuar editando */}
                          {f.estado === "borrador" && (
                            <Link href={`/dashboard/ventas/${f.id}/editar`}
                              className="text-amber-600 hover:text-amber-800 flex items-center gap-1 text-sm font-medium">
                              ✏️ Editar
                            </Link>
                          )}
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
