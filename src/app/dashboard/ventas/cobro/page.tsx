"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback, useMemo } from "react";
import { formatDate } from "@/lib/utils";
import Link from "next/link";
import {
  Banknote, CheckCircle2, ArrowLeft, Calculator,
  Plus, Minus, DollarSign, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

// ── Denominaciones NIO ───────────────────────────────────────
const DENOMS_NIO: { valor: number; etiqueta: string; tipo: "billete" | "moneda" }[] = [
  { valor: 500,  etiqueta: "C$500",  tipo: "billete" },
  { valor: 200,  etiqueta: "C$200",  tipo: "billete" },
  { valor: 100,  etiqueta: "C$100",  tipo: "billete" },
  { valor: 50,   etiqueta: "C$50",   tipo: "billete" },
  { valor: 20,   etiqueta: "C$20",   tipo: "billete" },
  { valor: 10,   etiqueta: "C$10",   tipo: "billete" },
  { valor: 5,    etiqueta: "C$5",    tipo: "moneda"  },
  { valor: 1,    etiqueta: "C$1",    tipo: "moneda"  },
  { valor: 0.5,  etiqueta: "C$0.50", tipo: "moneda"  },
];

interface Factura {
  id: string;
  numero_factura: string;
  fecha_emision: string;
  total: number;
  estado: string;
  cliente_nombre?: string;
  cliente: { nombre: string } | null;
  monto_recibido?: number;
  cambio_entregado?: number;
}

interface CobrarState {
  factura: Factura;
  cantidades: Record<number, number>; // valor_denominacion -> cantidad
  montoManual: string; // si prefiere ingresar monto directo
  modoManual: boolean;
}

export default function CobroCajaPage() {
  const [facturasPendientes, setFacturasPendientes] = useState<Factura[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [empresaId, setEmpresaId] = useState("");
  const [tasaHoy,   setTasaHoy]   = useState<number>(0);
  const [cobrar,    setCobrar]     = useState<CobrarState | null>(null);
  const [procesando, setProcesando] = useState(false);

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

    const [{ data: facts }, { data: tasas }] = await Promise.all([
      supabase
        .from("facturas")
        .select("id, numero_factura, fecha_emision, total, estado, cliente_nombre, cliente:clientes(nombre), monto_recibido, cambio_entregado")
        .in("empresa_id", ids.length ? ids : ["none"])
        .in("estado", ["emitida"])
        .order("created_at", { ascending: false })
        .limit(50),
      eId
        ? supabase.from("tasa_cambio").select("tasa").eq("empresa_id", eId).order("fecha", { ascending: false }).limit(1)
        : Promise.resolve({ data: null }),
    ]);

    setFacturasPendientes((facts as unknown as Factura[]) ?? []);
    if (tasas && tasas.length > 0) setTasaHoy(Number((tasas[0] as { tasa: number }).tasa));
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  function iniciarCobro(f: Factura) {
    const cantidades: Record<number, number> = {};
    DENOMS_NIO.forEach(d => { cantidades[d.valor] = 0; });
    setCobrar({ factura: f, cantidades, montoManual: "", modoManual: false });
  }

  function ajustarDenom(valor: number, delta: number) {
    if (!cobrar) return;
    const actual = cobrar.cantidades[valor] ?? 0;
    const nuevo = Math.max(0, actual + delta);
    setCobrar(prev => prev ? { ...prev, cantidades: { ...prev.cantidades, [valor]: nuevo } } : null);
  }

  // Total recibido basado en denominaciones
  const totalDenoms = useMemo(() => {
    if (!cobrar || cobrar.modoManual) return 0;
    return DENOMS_NIO.reduce((sum, d) => sum + d.valor * (cobrar.cantidades[d.valor] ?? 0), 0);
  }, [cobrar]);

  const montoRecibido = cobrar?.modoManual
    ? (isNaN(Number(cobrar.montoManual)) ? 0 : Number(cobrar.montoManual))
    : totalDenoms;

  const cambio = cobrar ? Math.max(0, montoRecibido - cobrar.factura.total) : 0;
  const falta  = cobrar ? Math.max(0, cobrar.factura.total - montoRecibido) : 0;
  const suficiente = montoRecibido >= (cobrar?.factura.total ?? 0);

  async function registrarCobro() {
    if (!cobrar || !suficiente) return;
    setProcesando(true);
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();

    const { error } = await supabase.from("facturas").update({
      estado: "pagada",
      monto_recibido: montoRecibido,
      cambio_entregado: cambio,
    }).eq("id", cobrar.factura.id);

    if (error) {
      toast.error("Error al registrar cobro: " + error.message);
    } else {
      toast.success(
        `✅ Cobro registrado — Cambio: C$${cambio.toFixed(2)}`,
        { duration: 5000 }
      );
      setCobrar(null);
      loadData();
    }
    setProcesando(false);
  }

  const formatC = (n: number) =>
    `C$${n.toLocaleString("es-NI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link href="/dashboard/ventas" className="text-slate-400 hover:text-slate-600">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Cobro en Caja</h1>
          <p className="text-slate-500 text-sm mt-0.5">Registra pagos con denominaciones y calcula el cambio</p>
        </div>
        {tasaHoy > 0 && (
          <div className="ml-auto flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
            <DollarSign className="w-3.5 h-3.5 text-green-600" />
            <span className="text-xs font-semibold text-green-700">1 USD = C${tasaHoy.toFixed(4)}</span>
          </div>
        )}
      </div>

      {/* ── Lista facturas pendientes de cobro ── */}
      {!cobrar && (
        <div className="card p-0 overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50">
            <p className="text-sm font-semibold text-slate-700">Facturas emitidas pendientes de cobro</p>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-7 h-7 border-4 border-brand-200 border-t-brand-700 rounded-full animate-spin" />
            </div>
          ) : !facturasPendientes.length ? (
            <div className="text-center py-16 text-slate-400">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-40 text-green-400" />
              <p className="font-medium text-green-600">¡Todo cobrado!</p>
              <p className="text-sm mt-1">No hay facturas pendientes de cobro en este momento</p>
              <Link href="/dashboard/ventas/nueva" className="btn-primary inline-flex items-center gap-2 mt-4">
                <Plus className="w-4 h-4" /> Nueva factura
              </Link>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="table-header">N° Factura</th>
                  <th className="table-header">Cliente</th>
                  <th className="table-header">Fecha</th>
                  <th className="table-header">Total a Cobrar</th>
                  {tasaHoy > 0 && <th className="table-header">Equiv. USD</th>}
                  <th className="table-header">Acción</th>
                </tr>
              </thead>
              <tbody>
                {facturasPendientes.map(f => {
                  const cliente = f.cliente?.nombre ?? f.cliente_nombre ?? "Consumidor final";
                  return (
                    <tr key={f.id} className="hover:bg-slate-50 transition-colors">
                      <td className="table-cell font-mono font-medium text-brand-700">{f.numero_factura}</td>
                      <td className="table-cell">{cliente}</td>
                      <td className="table-cell">{formatDate(f.fecha_emision)}</td>
                      <td className="table-cell font-bold text-slate-900">{formatC(f.total)}</td>
                      {tasaHoy > 0 && (
                        <td className="table-cell text-slate-400 text-sm font-mono">
                          ${(f.total / tasaHoy).toFixed(2)}
                        </td>
                      )}
                      <td className="table-cell">
                        <button
                          onClick={() => iniciarCobro(f)}
                          className="btn-primary text-sm py-1.5 px-3 flex items-center gap-1.5"
                        >
                          <Banknote className="w-4 h-4" /> Cobrar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Panel de cobro (denominaciones) ── */}
      {cobrar && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Columna izquierda: info factura + denominaciones */}
          <div className="space-y-4">
            {/* Info factura */}
            <div className="card bg-brand-50 border-brand-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-brand-600 font-semibold uppercase tracking-wide">Factura a cobrar</p>
                  <p className="font-display text-xl font-bold text-brand-800 mt-0.5">
                    {cobrar.factura.numero_factura}
                  </p>
                  <p className="text-sm text-brand-600">
                    {cobrar.factura.cliente?.nombre ?? cobrar.factura.cliente_nombre ?? "Consumidor final"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-brand-600 font-semibold">Total</p>
                  <p className="font-display text-3xl font-bold text-brand-900">
                    {formatC(cobrar.factura.total)}
                  </p>
                  {tasaHoy > 0 && (
                    <p className="text-xs text-brand-500 font-mono">
                      ≈ ${(cobrar.factura.total / tasaHoy).toFixed(2)} USD
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Toggle modo */}
            <div className="flex gap-2">
              <button
                onClick={() => setCobrar(prev => prev ? { ...prev, modoManual: false } : null)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors flex items-center justify-center gap-1.5 ${
                  !cobrar.modoManual
                    ? "bg-brand-700 text-white border-brand-700"
                    : "bg-white text-slate-600 border-slate-200 hover:border-brand-300"
                }`}
              >
                <Banknote className="w-4 h-4" /> Por denominaciones
              </button>
              <button
                onClick={() => setCobrar(prev => prev ? { ...prev, modoManual: true } : null)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-colors flex items-center justify-center gap-1.5 ${
                  cobrar.modoManual
                    ? "bg-brand-700 text-white border-brand-700"
                    : "bg-white text-slate-600 border-slate-200 hover:border-brand-300"
                }`}
              >
                <Calculator className="w-4 h-4" /> Monto directo
              </button>
            </div>

            {/* Modo: denominaciones */}
            {!cobrar.modoManual && (
              <div className="card p-4">
                <p className="text-sm font-semibold text-slate-700 mb-3">Billetes y monedas recibidos</p>
                <div className="space-y-2">
                  {DENOMS_NIO.map(d => {
                    const cant = cobrar.cantidades[d.valor] ?? 0;
                    const subtotal = d.valor * cant;
                    return (
                      <div key={d.valor} className="flex items-center gap-3">
                        {/* Etiqueta */}
                        <div className={`w-16 text-center py-1 rounded-lg text-xs font-bold ${
                          d.tipo === "billete"
                            ? "bg-green-100 text-green-800"
                            : "bg-slate-100 text-slate-700"
                        }`}>
                          {d.etiqueta}
                        </div>
                        {/* Control cantidad */}
                        <div className="flex items-center gap-2 flex-1">
                          <button
                            onClick={() => ajustarDenom(d.valor, -1)}
                            disabled={cant === 0}
                            className="w-7 h-7 rounded-full border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100 disabled:opacity-30 transition-colors"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <input
                            type="number"
                            min="0"
                            value={cant}
                            onChange={e => {
                              const v = Math.max(0, parseInt(e.target.value) || 0);
                              setCobrar(prev => prev ? { ...prev, cantidades: { ...prev.cantidades, [d.valor]: v } } : null);
                            }}
                            className="w-12 text-center border border-slate-200 rounded-lg py-1 text-sm font-mono focus:ring-2 focus:ring-brand-300 focus:border-brand-400 outline-none"
                          />
                          <button
                            onClick={() => ajustarDenom(d.valor, 1)}
                            className="w-7 h-7 rounded-full border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                        {/* Subtotal */}
                        <div className={`w-20 text-right text-sm font-mono font-medium ${cant > 0 ? "text-slate-800" : "text-slate-300"}`}>
                          {subtotal > 0 ? formatC(subtotal) : "—"}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {/* Botón limpiar */}
                <button
                  onClick={() => {
                    const cantidades: Record<number, number> = {};
                    DENOMS_NIO.forEach(d => { cantidades[d.valor] = 0; });
                    setCobrar(prev => prev ? { ...prev, cantidades } : null);
                  }}
                  className="mt-3 w-full text-xs text-slate-400 hover:text-slate-600 flex items-center justify-center gap-1 py-1"
                >
                  <RefreshCw className="w-3 h-3" /> Limpiar denominaciones
                </button>
              </div>
            )}

            {/* Modo: monto manual */}
            {cobrar.modoManual && (
              <div className="card p-4">
                <label className="label">Monto recibido del cliente (C$)</label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-mono font-bold">C$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={cobrar.montoManual}
                    onChange={e => setCobrar(prev => prev ? { ...prev, montoManual: e.target.value } : null)}
                    className="input pl-10 font-mono text-lg font-bold"
                    autoFocus
                  />
                </div>
                {/* Botones rápidos */}
                <div className="flex flex-wrap gap-2 mt-3">
                  {[cobrar.factura.total, cobrar.factura.total + 5, cobrar.factura.total + 10, cobrar.factura.total + 20, cobrar.factura.total + 50, cobrar.factura.total + 100]
                    .map(v => Math.ceil(v / 5) * 5)
                    .filter((v, i, arr) => arr.indexOf(v) === i && v >= cobrar.factura.total)
                    .slice(0, 6)
                    .map(v => (
                      <button
                        key={v}
                        onClick={() => setCobrar(prev => prev ? { ...prev, montoManual: String(v) } : null)}
                        className={`text-xs px-3 py-1.5 rounded-lg border font-mono font-semibold transition-colors ${
                          Number(cobrar.montoManual) === v
                            ? "bg-brand-700 text-white border-brand-700"
                            : "border-slate-200 text-slate-600 hover:border-brand-300 hover:text-brand-700"
                        }`}
                      >
                        {formatC(v)}
                      </button>
                    ))
                  }
                </div>
              </div>
            )}
          </div>

          {/* Columna derecha: resumen + botón cobrar */}
          <div className="space-y-4">
            {/* Resumen */}
            <div className="card p-5 space-y-3">
              <p className="font-semibold text-slate-700 text-sm">Resumen del cobro</p>

              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="text-slate-500 text-sm">Total factura</span>
                <span className="font-mono font-bold text-slate-900">{formatC(cobrar.factura.total)}</span>
              </div>

              <div className="flex justify-between items-center py-2 border-b border-slate-100">
                <span className="text-slate-500 text-sm">Monto recibido</span>
                <span className={`font-mono font-bold ${montoRecibido > 0 ? "text-blue-700" : "text-slate-400"}`}>
                  {montoRecibido > 0 ? formatC(montoRecibido) : "—"}
                </span>
              </div>

              {falta > 0 && (
                <div className="flex justify-between items-center py-3 bg-red-50 rounded-xl px-3 border border-red-200">
                  <span className="text-red-700 font-semibold text-sm">Falta</span>
                  <span className="font-mono font-bold text-red-700 text-xl">{formatC(falta)}</span>
                </div>
              )}

              {suficiente && montoRecibido > 0 && (
                <div className="flex justify-between items-center py-3 bg-green-50 rounded-xl px-3 border border-green-200">
                  <span className="text-green-700 font-semibold text-sm">Cambio a dar</span>
                  <span className="font-mono font-bold text-green-700 text-2xl">{formatC(cambio)}</span>
                </div>
              )}

              {/* Desglose denominaciones cuando hay cambio */}
              {suficiente && cambio > 0 && (
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                  <p className="text-xs font-semibold text-slate-500 mb-2">Sugerencia de cambio</p>
                  <div className="space-y-1">
                    {calcDesglose(cambio).map(({ denom, cantidad }) => (
                      <div key={denom.valor} className="flex justify-between text-xs text-slate-600">
                        <span>{denom.etiqueta} × {cantidad}</span>
                        <span className="font-mono">{formatC(denom.valor * cantidad)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Botones acción */}
            <button
              onClick={registrarCobro}
              disabled={!suficiente || procesando}
              className={`w-full py-4 rounded-xl font-bold text-base flex items-center justify-center gap-2 transition-all ${
                suficiente
                  ? "bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-200"
                  : "bg-slate-100 text-slate-400 cursor-not-allowed"
              }`}
            >
              {procesando
                ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <CheckCircle2 className="w-5 h-5" />
              }
              {suficiente ? "Confirmar cobro" : `Falta ${formatC(falta)}`}
            </button>

            <button
              onClick={() => setCobrar(null)}
              className="w-full py-3 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold text-sm transition-colors"
            >
              Cancelar — volver a la lista
            </button>

            {/* Equivalente USD */}
            {tasaHoy > 0 && montoRecibido > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700 text-center">
                <DollarSign className="w-3.5 h-3.5 inline-block mr-1" />
                {formatC(montoRecibido)} ≈ ${(montoRecibido / tasaHoy).toFixed(2)} USD
                {cambio > 0 && ` · Cambio ≈ $${(cambio / tasaHoy).toFixed(2)} USD`}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Algoritmo de desglose de cambio (greedy) ─────────────────
function calcDesglose(monto: number) {
  let resto = Math.round(monto * 100); // trabajar en centavos
  const resultado: { denom: typeof DENOMS_NIO[0]; cantidad: number }[] = [];

  for (const d of DENOMS_NIO) {
    const valorCents = Math.round(d.valor * 100);
    const cant = Math.floor(resto / valorCents);
    if (cant > 0) {
      resultado.push({ denom: d, cantidad: cant });
      resto -= cant * valorCents;
    }
    if (resto === 0) break;
  }
  return resultado;
}
