"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback, useMemo } from "react";
import { formatDate } from "@/lib/utils";
import {
  Lock, LockOpen, Banknote, TrendingUp, TrendingDown,
  AlertTriangle, CheckCircle2, Plus, Eye, DollarSign,
} from "lucide-react";
import { toast } from "sonner";

// ── Denominaciones NIO para conteo físico ────────────────────
const DENOMS_NIO = [
  { key: "denom_500",  valor: 500,  etiqueta: "C$500"  },
  { key: "denom_200",  valor: 200,  etiqueta: "C$200"  },
  { key: "denom_100",  valor: 100,  etiqueta: "C$100"  },
  { key: "denom_50",   valor: 50,   etiqueta: "C$50"   },
  { key: "denom_20",   valor: 20,   etiqueta: "C$20"   },
  { key: "denom_10",   valor: 10,   etiqueta: "C$10"   },
  { key: "denom_5",    valor: 5,    etiqueta: "C$5"    },
  { key: "denom_1",    valor: 1,    etiqueta: "C$1"    },
  { key: "denom_050",  valor: 0.5,  etiqueta: "C$0.50" },
];

const DENOMS_USD = [
  { key: "denom_usd_100", valor: 100, etiqueta: "$100" },
  { key: "denom_usd_50",  valor: 50,  etiqueta: "$50"  },
  { key: "denom_usd_20",  valor: 20,  etiqueta: "$20"  },
  { key: "denom_usd_10",  valor: 10,  etiqueta: "$10"  },
  { key: "denom_usd_5",   valor: 5,   etiqueta: "$5"   },
  { key: "denom_usd_1",   valor: 1,   etiqueta: "$1"   },
];

interface CuentaCaja {
  id: string;
  nombre: string;
  tipo: string;
  saldo_actual: number;
}

interface SesionCaja {
  id: string;
  fecha_apertura: string;
  fecha_cierre?: string;
  monto_apertura: number;
  monto_cierre_sistema: number;
  monto_cierre_fisico?: number;
  diferencia?: number;
  estado: string;
  cuenta_caja_id?: string;
}

type DenomCounts = Record<string, number>;

export default function ArqueoCajaPage() {
  const [empresaId,  setEmpresaId]  = useState("");
  const [cuentas,    setCuentas]    = useState<CuentaCaja[]>([]);
  const [sesiones,   setSesiones]   = useState<SesionCaja[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [tasaHoy,    setTasaHoy]    = useState(0);

  // Estado del arqueo activo
  const [sesionActiva, setSesionActiva] = useState<SesionCaja | null>(null);
  const [showNuevaSesion, setShowNuevaSesion] = useState(false);
  const [showArqueo, setShowArqueo] = useState(false);

  // Form apertura
  const [cuentaSelId, setCuentaSelId] = useState("");
  const [montoApertura, setMontoApertura] = useState("");
  const [notasApertura, setNotasApertura] = useState("");
  const [guardando, setGuardando] = useState(false);

  // Conteo físico arqueo
  const [denomsNio, setDenomsNio] = useState<DenomCounts>(() => {
    const d: DenomCounts = {};
    DENOMS_NIO.forEach(x => { d[x.key] = 0; });
    return d;
  });
  const [denomsUsd, setDenomsUsd] = useState<DenomCounts>(() => {
    const d: DenomCounts = {};
    DENOMS_USD.forEach(x => { d[x.key] = 0; });
    return d;
  });
  const [notasCierre, setNotasCierre] = useState("");
  const [cerrando, setCerrando] = useState(false);

  const loadData = useCallback(async () => {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: en }, { data: ej }] = await Promise.all([
      supabase.from("empresas_persona_natural").select("id").eq("user_id", user.id).maybeSingle(),
      supabase.from("empresas_juridicas").select("id").eq("user_id", user.id).maybeSingle(),
    ]);
    const eId = en?.id ?? ej?.id ?? "";
    setEmpresaId(eId);

    const [{ data: cts }, { data: sess }, { data: tasas }] = await Promise.all([
      supabase.from("cuentas_caja").select("id,nombre,tipo,saldo_actual").eq("empresa_id", eId).eq("activa", true),
      supabase.from("sesiones_caja").select("*").eq("empresa_id", eId).order("fecha_apertura", { ascending: false }).limit(20),
      supabase.from("tasa_cambio").select("tasa").eq("empresa_id", eId).order("fecha", { ascending: false }).limit(1),
    ]);

    setCuentas((cts as CuentaCaja[]) ?? []);
    setSesiones((sess as SesionCaja[]) ?? []);
    const activa = (sess as SesionCaja[] ?? []).find(s => s.estado === "abierta") ?? null;
    setSesionActiva(activa);
    if (cts && cts.length > 0 && !cuentaSelId) setCuentaSelId((cts[0] as CuentaCaja).id);
    if (tasas && tasas.length > 0) setTasaHoy(Number((tasas[0] as { tasa: number }).tasa));
    setLoading(false);
  }, [cuentaSelId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Total físico NIO
  const totalFisicoNio = useMemo(() =>
    DENOMS_NIO.reduce((sum, d) => sum + d.valor * (denomsNio[d.key] ?? 0), 0),
  [denomsNio]);

  // Total físico USD convertido a NIO
  const totalFisicoUsdEnNio = useMemo(() =>
    tasaHoy > 0
      ? DENOMS_USD.reduce((sum, d) => sum + d.valor * (denomsUsd[d.key] ?? 0), 0) * tasaHoy
      : 0,
  [denomsUsd, tasaHoy]);

  const totalFisicoTotal = totalFisicoNio + totalFisicoUsdEnNio;

  async function abrirSesion() {
    if (!cuentaSelId) { toast.error("Selecciona una cuenta de caja"); return; }
    if (isNaN(Number(montoApertura)) || Number(montoApertura) < 0) {
      toast.error("Ingresa un monto de apertura válido"); return;
    }
    setGuardando(true);
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase.from("sesiones_caja").insert({
      empresa_id: empresaId,
      cuenta_caja_id: cuentaSelId,
      monto_apertura: Number(montoApertura),
      notas: notasApertura.trim() || null,
      created_by: user?.id,
    });

    if (error) {
      toast.error("Error al abrir sesión: " + error.message);
    } else {
      toast.success("✅ Sesión de caja abierta");
      setShowNuevaSesion(false);
      setMontoApertura("");
      setNotasApertura("");
      loadData();
    }
    setGuardando(false);
  }

  async function cerrarSesion() {
    if (!sesionActiva) return;
    setCerrando(true);
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();

    // Calcular monto sistema: cobros de caja desde apertura
    const { data: movs } = await supabase
      .from("movimientos_caja")
      .select("monto, tipo")
      .eq("empresa_id", empresaId)
      .gte("created_at", sesionActiva.fecha_apertura);

    const ingresos = (movs ?? []).filter((m: { tipo: string }) => m.tipo === "ingreso").reduce((s: number, m: { monto: number }) => s + Number(m.monto), 0);
    const egresos  = (movs ?? []).filter((m: { tipo: string }) => m.tipo === "egreso").reduce((s: number, m: { monto: number }) => s + Number(m.monto), 0);
    const sistemaFinal = Number(sesionActiva.monto_apertura) + ingresos - egresos;

    const { error } = await supabase.from("sesiones_caja").update({
      fecha_cierre: new Date().toISOString(),
      monto_cierre_sistema: sistemaFinal,
      monto_cierre_fisico: totalFisicoTotal,
      estado: "cerrada",
      notas: notasCierre.trim() || null,
      tasa_usd: tasaHoy || null,
      ...denomsNio,
      ...denomsUsd,
    }).eq("id", sesionActiva.id);

    if (error) {
      toast.error("Error al cerrar sesión: " + error.message);
    } else {
      const dif = totalFisicoTotal - sistemaFinal;
      if (Math.abs(dif) < 0.01) {
        toast.success("✅ Caja cuadrada perfectamente", { duration: 5000 });
      } else if (dif > 0) {
        toast.success(`✅ Sesión cerrada — Sobrante: C$${dif.toFixed(2)}`, { duration: 5000 });
      } else {
        toast.error(`⚠️ Sesión cerrada — Faltante: C$${Math.abs(dif).toFixed(2)}`, { duration: 5000 });
      }
      setShowArqueo(false);
      setSesionActiva(null);
      loadData();
    }
    setCerrando(false);
  }

  const formatC = (n: number) =>
    `C$${n.toLocaleString("es-NI", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const diferencia = sesionActiva
    ? totalFisicoTotal - Number(sesionActiva.monto_cierre_sistema ?? sesionActiva.monto_apertura)
    : 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Arqueo de Caja</h1>
          <p className="text-slate-500 text-sm mt-1">Abre y cierra sesiones de caja, cuenta físicamente el efectivo</p>
        </div>
        {tasaHoy > 0 && (
          <div className="hidden sm:flex items-center gap-1.5 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5">
            <DollarSign className="w-3.5 h-3.5 text-green-600" />
            <span className="text-xs font-semibold text-green-700">1 USD = C${tasaHoy.toFixed(4)}</span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-700 rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* ── Sesión activa ── */}
          {sesionActiva ? (
            <div className="card bg-green-50 border-green-300 mb-6 p-5">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                    <LockOpen className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-green-800">Sesión de caja abierta</p>
                    <p className="text-sm text-green-600">
                      Desde: {new Date(sesionActiva.fecha_apertura).toLocaleString("es-NI")}
                    </p>
                    <p className="text-sm text-green-600">
                      Apertura: <strong>{formatC(sesionActiva.monto_apertura)}</strong>
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowArqueo(true)}
                  className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl font-semibold text-sm transition-colors"
                >
                  <Lock className="w-4 h-4" /> Realizar arqueo y cerrar
                </button>
              </div>
            </div>
          ) : (
            <div className="card bg-slate-50 border-slate-200 mb-6 p-5">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center">
                    <Lock className="w-5 h-5 text-slate-500" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-700">No hay sesión activa</p>
                    <p className="text-sm text-slate-500">Abre una sesión para empezar a recibir pagos</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowNuevaSesion(true)}
                  className="flex items-center gap-2 btn-primary text-sm"
                >
                  <Plus className="w-4 h-4" /> Abrir sesión de caja
                </button>
              </div>
            </div>
          )}

          {/* ── Saldos por cuenta ── */}
          {cuentas.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              {cuentas.map(c => (
                <div key={c.id} className="card p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-slate-700">{c.nombre}</p>
                    <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{c.tipo}</span>
                  </div>
                  <p className="font-display text-2xl font-bold text-slate-900">{formatC(Number(c.saldo_actual))}</p>
                  {tasaHoy > 0 && (
                    <p className="text-xs text-slate-400 font-mono mt-0.5">
                      ≈ ${(Number(c.saldo_actual) / tasaHoy).toFixed(2)} USD
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── Historial de sesiones ── */}
          <div className="card p-0 overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50">
              <p className="text-sm font-semibold text-slate-700">Historial de arqueos</p>
            </div>
            {!sesiones.filter(s => s.estado === "cerrada").length ? (
              <div className="text-center py-10 text-slate-400 text-sm">
                No hay arqueos cerrados aún
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-100">
                      <th className="table-header">Apertura</th>
                      <th className="table-header">Cierre</th>
                      <th className="table-header">Apertura C$</th>
                      <th className="table-header">Sistema</th>
                      <th className="table-header">Físico</th>
                      <th className="table-header">Diferencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sesiones.filter(s => s.estado === "cerrada").map(s => {
                      const dif = Number(s.diferencia ?? 0);
                      return (
                        <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                          <td className="table-cell text-sm">
                            {new Date(s.fecha_apertura).toLocaleString("es-NI", { dateStyle: "short", timeStyle: "short" })}
                          </td>
                          <td className="table-cell text-sm">
                            {s.fecha_cierre
                              ? new Date(s.fecha_cierre).toLocaleString("es-NI", { dateStyle: "short", timeStyle: "short" })
                              : "—"}
                          </td>
                          <td className="table-cell font-mono">{formatC(s.monto_apertura)}</td>
                          <td className="table-cell font-mono">{formatC(s.monto_cierre_sistema ?? 0)}</td>
                          <td className="table-cell font-mono">{formatC(s.monto_cierre_fisico ?? 0)}</td>
                          <td className="table-cell">
                            <span className={`font-mono font-bold ${
                              Math.abs(dif) < 0.01 ? "text-green-600"
                              : dif > 0 ? "text-blue-600"
                              : "text-red-600"
                            }`}>
                              {dif > 0 ? "+" : ""}{formatC(dif)}
                              {Math.abs(dif) < 0.01 && " ✓"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Modal apertura ── */}
      {showNuevaSesion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-modal w-full max-w-md p-6">
            <h2 className="font-display text-lg font-bold text-slate-900 mb-5">Abrir sesión de caja</h2>
            <div className="space-y-4">
              <div>
                <label className="label">Cuenta de caja</label>
                <select value={cuentaSelId} onChange={e => setCuentaSelId(e.target.value)} className="input">
                  {cuentas.map(c => (
                    <option key={c.id} value={c.id}>{c.nombre} ({c.tipo})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Monto de apertura (C$)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-mono">C$</span>
                  <input
                    type="number" step="0.01" min="0" placeholder="0.00"
                    value={montoApertura} onChange={e => setMontoApertura(e.target.value)}
                    className="input pl-9 font-mono"
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1">Efectivo con que inicia la caja (fondo de cambio)</p>
              </div>
              <div>
                <label className="label">Notas (opcional)</label>
                <input type="text" placeholder="Turno mañana, cajero..." value={notasApertura} onChange={e => setNotasApertura(e.target.value)} className="input" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={abrirSesion} disabled={guardando} className="btn-primary flex-1 flex items-center justify-center gap-2">
                {guardando ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <LockOpen className="w-4 h-4" />}
                Abrir caja
              </button>
              <button onClick={() => setShowNuevaSesion(false)} className="btn-secondary flex-1">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal arqueo + cierre ── */}
      {showArqueo && sesionActiva && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 py-6 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-modal w-full max-w-2xl p-6 my-auto">
            <h2 className="font-display text-lg font-bold text-slate-900 mb-1">Arqueo de Caja</h2>
            <p className="text-slate-500 text-sm mb-6">Cuenta físicamente el efectivo en caja</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Conteo NIO */}
              <div>
                <p className="font-semibold text-slate-700 text-sm mb-3 flex items-center gap-2">
                  <Banknote className="w-4 h-4" /> Billetes y monedas (C$)
                </p>
                <div className="space-y-2">
                  {DENOMS_NIO.map(d => {
                    const cant = denomsNio[d.key] ?? 0;
                    return (
                      <div key={d.key} className="flex items-center gap-2">
                        <span className="w-14 text-center text-xs font-bold bg-green-100 text-green-800 py-1 rounded-lg">{d.etiqueta}</span>
                        <input
                          type="number" min="0" value={cant}
                          onChange={e => setDenomsNio(prev => ({ ...prev, [d.key]: Math.max(0, parseInt(e.target.value) || 0) }))}
                          className="w-16 text-center border border-slate-200 rounded-lg py-1 text-sm font-mono focus:ring-2 focus:ring-brand-300 outline-none"
                        />
                        <span className={`text-xs font-mono ml-auto ${cant > 0 ? "text-slate-700" : "text-slate-300"}`}>
                          {cant > 0 ? `C$${(d.valor * cant).toFixed(2)}` : "—"}
                        </span>
                      </div>
                    );
                  })}
                  <div className="pt-2 border-t border-slate-200 flex justify-between">
                    <span className="text-sm font-semibold text-slate-700">Subtotal NIO</span>
                    <span className="font-mono font-bold text-slate-900">{`C$${totalFisicoNio.toFixed(2)}`}</span>
                  </div>
                </div>
              </div>

              {/* Conteo USD */}
              <div>
                <p className="font-semibold text-slate-700 text-sm mb-3 flex items-center gap-2">
                  <DollarSign className="w-4 h-4" /> Billetes USD {tasaHoy > 0 && <span className="text-xs text-slate-400 font-normal">@ C${tasaHoy.toFixed(4)}</span>}
                </p>
                <div className="space-y-2">
                  {DENOMS_USD.map(d => {
                    const cant = denomsUsd[d.key] ?? 0;
                    return (
                      <div key={d.key} className="flex items-center gap-2">
                        <span className="w-14 text-center text-xs font-bold bg-blue-100 text-blue-800 py-1 rounded-lg">{d.etiqueta}</span>
                        <input
                          type="number" min="0" value={cant}
                          onChange={e => setDenomsUsd(prev => ({ ...prev, [d.key]: Math.max(0, parseInt(e.target.value) || 0) }))}
                          className="w-16 text-center border border-slate-200 rounded-lg py-1 text-sm font-mono focus:ring-2 focus:ring-brand-300 outline-none"
                          disabled={tasaHoy === 0}
                        />
                        <span className={`text-xs font-mono ml-auto ${cant > 0 ? "text-slate-700" : "text-slate-300"}`}>
                          {cant > 0 && tasaHoy > 0 ? `C$${(d.valor * cant * tasaHoy).toFixed(2)}` : "—"}
                        </span>
                      </div>
                    );
                  })}
                  {tasaHoy === 0 && (
                    <p className="text-xs text-amber-600 bg-amber-50 rounded-lg p-2 mt-1">
                      ⚠️ Registra la tasa de cambio para contabilizar USD
                    </p>
                  )}
                  {tasaHoy > 0 && (
                    <div className="pt-2 border-t border-slate-200 flex justify-between">
                      <span className="text-sm font-semibold text-slate-700">Subtotal USD en C$</span>
                      <span className="font-mono font-bold text-slate-900">{`C$${totalFisicoUsdEnNio.toFixed(2)}`}</span>
                    </div>
                  )}
                </div>

                {/* Resumen total */}
                <div className="mt-4 bg-slate-50 rounded-xl p-4 border border-slate-200">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Apertura</span>
                      <span className="font-mono">{`C$${Number(sesionActiva.monto_apertura).toFixed(2)}`}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Total físico contado</span>
                      <span className="font-mono font-bold">{`C$${totalFisicoTotal.toFixed(2)}`}</span>
                    </div>
                    {Math.abs(totalFisicoTotal - Number(sesionActiva.monto_apertura)) > 0.01 && (
                      <div className={`flex justify-between font-bold pt-2 border-t ${diferencia >= 0 ? "text-green-700" : "text-red-700"}`}>
                        <span className="flex items-center gap-1">
                          {diferencia >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                          {diferencia >= 0 ? "Sobrante" : "Faltante"}
                        </span>
                        <span className="font-mono">{`C$${Math.abs(diferencia).toFixed(2)}`}</span>
                      </div>
                    )}
                    {Math.abs(diferencia) < 0.01 && totalFisicoTotal > 0 && (
                      <div className="flex items-center justify-center gap-2 pt-2 border-t text-green-600 font-semibold">
                        <CheckCircle2 className="w-4 h-4" /> Caja cuadrada
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5">
              <label className="label">Notas de cierre</label>
              <input type="text" placeholder="Observaciones del arqueo..." value={notasCierre} onChange={e => setNotasCierre(e.target.value)} className="input" />
            </div>

            {totalFisicoTotal === 0 && (
              <div className="mt-4 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-700 text-sm">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                Contaste 0 en todo. ¿Estás seguro de cerrar con caja vacía?
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <button
                onClick={cerrarSesion}
                disabled={cerrando}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors"
              >
                {cerrando ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Lock className="w-4 h-4" />}
                Cerrar caja
              </button>
              <button onClick={() => setShowArqueo(false)} className="flex-1 btn-secondary">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
