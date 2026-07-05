"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Search, Undo2 } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";

interface DetalleFacturaPOS {
  id: string; producto_id: string | null; descripcion: string;
  cantidad: number; precio_unitario: number;
}
interface FacturaPOS {
  id: string; numero_factura: string; cliente_nombre: string;
  fecha_emision: string; total: number; tipo_pago: string;
  detalle: DetalleFacturaPOS[];
}

export default function DevolucionPosPage() {
  const [empresaId, setEmpresaId] = useState("");
  const [sesionId, setSesionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [facturas, setFacturas] = useState<FacturaPOS[]>([]);
  const [facturaSel, setFacturaSel] = useState<FacturaPOS | null>(null);
  const [cantidades, setCantidades] = useState<Record<string, number>>({});
  const [seleccionados, setSeleccionados] = useState<Record<string, boolean>>({});
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    (async () => {
      const { createClient } = await import("@/lib/supabase/client");
      const { getEmpresaIdActual } = await import("@/lib/supabase/empresa-actual");
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const eId = await getEmpresaIdActual(supabase, user.id) ?? "";
      setEmpresaId(eId);
      if (eId) {
        const { data } = await supabase.rpc("fn_pos_estado_inicial", { p_empresa_id: eId });
        setSesionId(data?.sesion_activa?.id ?? null);
      }
      setLoading(false);
    })();
  }, []);

  async function buscar() {
    setBuscando(true);
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { data, error } = await supabase.rpc("fn_pos_buscar_facturas", {
      p_empresa_id: empresaId, p_query: query || null,
    });
    if (error) toast.error("Error al buscar: " + error.message);
    else setFacturas(data ?? []);
    setBuscando(false);
  }

  function elegirFactura(f: FacturaPOS) {
    setFacturaSel(f);
    setCantidades(Object.fromEntries(f.detalle.map(d => [d.id, d.cantidad])));
    setSeleccionados(Object.fromEntries(f.detalle.map(d => [d.id, false])));
  }

  const itemsElegidos = facturaSel
    ? facturaSel.detalle.filter(d => seleccionados[d.id])
    : [];
  const subtotal = itemsElegidos.reduce((s, d) => s + (cantidades[d.id] ?? 0) * d.precio_unitario, 0);
  const iva = subtotal * 0.15;
  const total = subtotal + iva;

  async function confirmarDevolucion() {
    if (!sesionId) { toast.error("Necesitas un turno de caja abierto"); return; }
    if (itemsElegidos.length === 0) { toast.error("Selecciona al menos un ítem a devolver"); return; }
    if (!motivo.trim()) { toast.error("Indica el motivo de la devolución"); return; }

    setEnviando(true);
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { data, error } = await supabase.rpc("fn_registrar_devolucion_pos", {
      p_empresa_id: empresaId,
      p_sesion_caja_id: sesionId,
      p_ref_factura_id: facturaSel!.id,
      p_motivo: motivo.trim(),
      p_items: itemsElegidos.map(d => ({
        producto_id: d.producto_id, descripcion: d.descripcion,
        cantidad: cantidades[d.id], precio_unitario: d.precio_unitario,
      })),
    });
    if (error) {
      toast.error("No se pudo registrar la devolución: " + error.message, { duration: 7000 });
    } else {
      toast.success(`Nota de crédito ${data.numero_nota} emitida — ${formatCurrency(data.total)}`, { duration: 6000 });
      setFacturaSel(null);
      setFacturas([]);
      setQuery("");
      setMotivo("");
    }
    setEnviando(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-700 rounded-full animate-spin" />
      </div>
    );
  }

  if (!sesionId) {
    return (
      <div className="max-w-lg mx-auto mt-10 card p-6 text-center">
        <p className="text-slate-600 mb-4">Necesitas un turno de caja abierto para hacer devoluciones.</p>
        <Link href="/dashboard/pos" className="btn-primary">Ir al Punto de Venta</Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <Link href="/dashboard/pos" className="btn-ghost p-2"><ArrowLeft className="w-5 h-5" /></Link>
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Devolución — Punto de Venta</h1>
          <p className="text-slate-500 text-sm mt-1">Busca la factura de origen y selecciona los ítems a devolver</p>
        </div>
      </div>

      {!facturaSel ? (
        <div className="card">
          <div className="flex gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className="input pl-9" placeholder="N° de factura o nombre del cliente..."
                value={query} onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === "Enter" && buscar()} />
            </div>
            <button onClick={buscar} disabled={buscando} className="btn-primary px-5">
              {buscando ? "Buscando..." : "Buscar"}
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {facturas.map(f => (
              <button key={f.id} onClick={() => elegirFactura(f)}
                className="w-full text-left py-3 flex items-center justify-between hover:bg-slate-50 rounded-lg px-2 -mx-2">
                <div>
                  <p className="font-semibold text-slate-800 text-sm">{f.numero_factura} · {f.cliente_nombre}</p>
                  <p className="text-xs text-slate-400">{formatDate(f.fecha_emision)} · {f.tipo_pago}</p>
                </div>
                <span className="font-mono font-semibold text-slate-700">{formatCurrency(f.total)}</span>
              </button>
            ))}
            {facturas.length === 0 && (
              <p className="text-center text-slate-400 text-sm py-10">Busca una factura para empezar.</p>
            )}
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="font-semibold text-slate-900">{facturaSel.numero_factura} · {facturaSel.cliente_nombre}</p>
              <p className="text-xs text-slate-400">Total original: {formatCurrency(facturaSel.total)}</p>
            </div>
            <button onClick={() => setFacturaSel(null)} className="btn-secondary text-xs px-3">Cambiar factura</button>
          </div>

          <table className="w-full mb-4">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="table-header"></th>
                <th className="table-header">Producto</th>
                <th className="table-header">Cant. original</th>
                <th className="table-header">Cant. a devolver</th>
                <th className="table-header">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {facturaSel.detalle.map(d => (
                <tr key={d.id}>
                  <td className="table-cell">
                    <input type="checkbox" checked={!!seleccionados[d.id]}
                      onChange={e => setSeleccionados(prev => ({ ...prev, [d.id]: e.target.checked }))} />
                  </td>
                  <td className="table-cell">
                    <p className="font-medium text-sm">{d.descripcion}</p>
                    <p className="text-xs text-slate-400 font-mono">{formatCurrency(d.precio_unitario)} c/u</p>
                  </td>
                  <td className="table-cell text-sm">{d.cantidad}</td>
                  <td className="table-cell">
                    <input type="number" min={1} max={d.cantidad} className="w-20 input py-1 text-sm"
                      value={cantidades[d.id] ?? d.cantidad}
                      onChange={e => setCantidades(prev => ({ ...prev, [d.id]: Math.min(d.cantidad, Math.max(1, parseInt(e.target.value) || 1)) }))} />
                  </td>
                  <td className="table-cell font-mono text-sm">
                    {seleccionados[d.id] ? formatCurrency((cantidades[d.id] ?? 0) * d.precio_unitario) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mb-4">
            <label className="label">Motivo de la devolución</label>
            <input className="input" placeholder="Producto defectuoso, error en la venta, etc."
              value={motivo} onChange={e => setMotivo(e.target.value)} />
          </div>

          <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 mb-4 space-y-1 text-sm">
            <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
            <div className="flex justify-between text-slate-500"><span>IVA 15%</span><span>{formatCurrency(iva)}</span></div>
            <div className="flex justify-between font-bold text-lg text-slate-900 pt-1 border-t border-slate-200"><span>Total nota</span><span>{formatCurrency(total)}</span></div>
          </div>

          <button onClick={confirmarDevolucion} disabled={enviando} className="btn-primary w-full flex items-center justify-center gap-2">
            <Undo2 className="w-4 h-4" /> {enviando ? "Emitiendo..." : "Emitir Nota de Crédito"}
          </button>
        </div>
      )}
    </div>
  );
}
