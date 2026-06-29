"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback } from "react";
import { formatDate } from "@/lib/utils";
import { Plus, DollarSign, Pencil, Trash2, Save, X, TrendingUp, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface Tasa {
  id: string;
  fecha: string;
  tasa: number;
  fuente: string;
  notas: string | null;
}

export default function TasaCambioPage() {
  const [tasas,      setTasas]      = useState<Tasa[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [empresaId,  setEmpresaId]  = useState("");
  const [showForm,   setShowForm]   = useState(false);
  const [editId,     setEditId]     = useState<string | null>(null);
  const [saving,     setSaving]     = useState(false);
  const [loadingBcn, setLoadingBcn] = useState(false);

  // Form fields
  const [fecha,  setFecha]  = useState(new Date().toISOString().split("T")[0]);
  const [tasa,   setTasa]   = useState("");
  const [fuente, setFuente] = useState("BCN");
  const [notas,  setNotas]  = useState("");

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

    const { data } = await supabase
      .from("tasa_cambio")
      .select("id, fecha, tasa, fuente, notas")
      .eq("empresa_id", eId)
      .order("fecha", { ascending: false })
      .limit(90);

    setTasas((data as Tasa[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  function abrirNuevo() {
    setEditId(null);
    setFecha(new Date().toISOString().split("T")[0]);
    setTasa("");
    setFuente("BCN");
    setNotas("");
    setShowForm(true);
  }

  function abrirEditar(t: Tasa) {
    setEditId(t.id);
    setFecha(t.fecha);
    setTasa(String(t.tasa));
    setFuente(t.fuente);
    setNotas(t.notas ?? "");
    setShowForm(true);
  }

  function cancelar() {
    setShowForm(false);
    setEditId(null);
  }

  // Intentar obtener tasa del BCN via scraping indirecto (el BCN no tiene API pública)
  // En producción esto quedaría como referencia; el usuario ingresa la tasa manualmente.
  async function cargarTasaBCN() {
    setLoadingBcn(true);
    try {
      // El BCN publica la tasa oficial en: https://www.bcn.gob.ni/
      // Como no tienen API pública, mostramos instrucción y ponemos valor referencial
      toast.info("Consultá la tasa oficial en bcn.gob.ni e ingrésala manualmente.", {
        duration: 5000,
      });
      // Aquí podrías integrar un proxy/webhook en el futuro
    } finally {
      setLoadingBcn(false);
    }
  }

  async function handleSave() {
    if (!tasa || isNaN(Number(tasa)) || Number(tasa) <= 0) {
      toast.error("Ingresa una tasa válida mayor a 0");
      return;
    }
    if (!fecha) { toast.error("Selecciona la fecha"); return; }
    setSaving(true);
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();

    const payload = {
      empresa_id: empresaId,
      fecha,
      tasa: Number(Number(tasa).toFixed(4)),
      fuente,
      notas: notas.trim() || null,
    };

    let error;
    if (editId) {
      ({ error } = await supabase.from("tasa_cambio").update(payload).eq("id", editId));
    } else {
      // upsert por (empresa_id, fecha)
      ({ error } = await supabase.from("tasa_cambio").upsert(payload, { onConflict: "empresa_id,fecha" }));
    }

    if (error) {
      toast.error("Error al guardar: " + error.message);
    } else {
      toast.success(editId ? "Tasa actualizada" : "Tasa registrada");
      cancelar();
      loadData();
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar esta tasa de cambio?")) return;
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    await supabase.from("tasa_cambio").delete().eq("id", id);
    toast.success("Tasa eliminada");
    loadData();
  }

  const tasaHoy = tasas[0];

  return (
    <div>
      {/* ── Cabecera ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Tasa de Cambio</h1>
          <p className="text-slate-500 text-sm mt-1">Registro histórico de la tasa oficial USD → C$ (BCN)</p>
        </div>
        <button onClick={abrirNuevo} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Registrar tasa
        </button>
      </div>

      {/* ── Banner tasa vigente ── */}
      {tasaHoy && (
        <div className="card mb-6 bg-gradient-to-r from-green-50 to-emerald-50 border-green-200 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-green-600 font-semibold uppercase tracking-wide">Tasa más reciente</p>
                <p className="font-display text-3xl font-bold text-green-800">
                  C$ {Number(tasaHoy.tasa).toFixed(4)}
                </p>
                <p className="text-sm text-green-600">
                  1 USD = C${Number(tasaHoy.tasa).toFixed(4)} · {formatDate(tasaHoy.fecha)} · Fuente: {tasaHoy.fuente}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-500" />
              <span className="text-green-600 text-sm font-medium">
                {tasas.length} registro{tasas.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Tabla ── */}
      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-7 h-7 border-4 border-brand-200 border-t-brand-700 rounded-full animate-spin" />
          </div>
        ) : !tasas.length ? (
          <div className="text-center py-16 text-slate-400">
            <DollarSign className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No hay tasas registradas</p>
            <p className="text-sm mt-1">Registra la tasa oficial del BCN para convertir montos en USD a Córdobas</p>
            <button onClick={abrirNuevo} className="btn-primary inline-flex items-center gap-2 mt-4">
              <Plus className="w-4 h-4" /> Registrar primera tasa
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="table-header">Fecha</th>
                  <th className="table-header">Tasa (C$ por 1 USD)</th>
                  <th className="table-header">Fuente</th>
                  <th className="table-header">Notas</th>
                  <th className="table-header">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {tasas.map((t, i) => (
                  <tr key={t.id} className={`hover:bg-slate-50 transition-colors ${i === 0 ? "bg-green-50/50" : ""}`}>
                    <td className="table-cell font-medium">
                      {formatDate(t.fecha)}
                      {i === 0 && (
                        <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">
                          Vigente
                        </span>
                      )}
                    </td>
                    <td className="table-cell">
                      <span className="font-mono font-bold text-green-700">
                        C$ {Number(t.tasa).toFixed(4)}
                      </span>
                    </td>
                    <td className="table-cell">
                      <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                        {t.fuente}
                      </span>
                    </td>
                    <td className="table-cell text-slate-500 text-sm">{t.notas ?? "—"}</td>
                    <td className="table-cell">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => abrirEditar(t)}
                          className="text-brand-700 hover:text-brand-900 flex items-center gap-1 text-sm font-medium"
                        >
                          <Pencil className="w-3.5 h-3.5" /> Editar
                        </button>
                        <button
                          onClick={() => handleDelete(t.id)}
                          className="text-red-400 hover:text-red-600 flex items-center gap-1 text-sm"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Nota BCN ── */}
      <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
        <strong>📌 Tasa oficial BCN:</strong> Consultá la tasa de cambio oficial del día en{" "}
        <a
          href="https://www.bcn.gob.ni/estadisticas/tipo_de_cambio"
          target="_blank"
          rel="noopener noreferrer"
          className="underline font-semibold"
        >
          bcn.gob.ni
        </a>{" "}
        e ingrésala aquí. La tasa se usará automáticamente en facturas y compras para conversión USD ↔ C$.
      </div>

      {/* ── Modal formulario ── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-modal w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-lg font-bold text-slate-900">
                {editId ? "Editar tasa" : "Nueva tasa de cambio"}
              </h2>
              <button onClick={cancelar} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Fecha */}
              <div>
                <label className="label">Fecha</label>
                <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className="input" />
              </div>

              {/* Tasa */}
              <div>
                <label className="label">Tasa (C$ por 1 USD)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-mono text-sm">C$</span>
                  <input
                    type="number"
                    step="0.0001"
                    min="0.0001"
                    placeholder="36.5830"
                    value={tasa}
                    onChange={e => setTasa(e.target.value)}
                    className="input pl-9 font-mono"
                  />
                </div>
                {tasa && !isNaN(Number(tasa)) && Number(tasa) > 0 && (
                  <p className="text-xs text-green-600 mt-1">
                    1 USD = C$ {Number(tasa).toFixed(4)} · 1 C$ = USD {(1 / Number(tasa)).toFixed(6)}
                  </p>
                )}
              </div>

              {/* Fuente */}
              <div>
                <label className="label">Fuente</label>
                <select value={fuente} onChange={e => setFuente(e.target.value)} className="input">
                  <option value="BCN">BCN (Banco Central de Nicaragua)</option>
                  <option value="BAC">BAC</option>
                  <option value="BDF">BDF</option>
                  <option value="LAFISE">LAFISE</option>
                  <option value="manual">Manual</option>
                </select>
              </div>

              {/* Notas */}
              <div>
                <label className="label">Notas (opcional)</label>
                <input
                  type="text"
                  placeholder="Ej: Tasa oficial de compra"
                  value={notas}
                  onChange={e => setNotas(e.target.value)}
                  className="input"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
                {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                {editId ? "Actualizar" : "Guardar"}
              </button>
              <button onClick={cancelar} className="btn-secondary flex-1">Cancelar</button>
            </div>

            <button
              onClick={cargarTasaBCN}
              disabled={loadingBcn}
              className="w-full mt-3 flex items-center justify-center gap-2 text-xs text-blue-600 hover:text-blue-800 py-2"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingBcn ? "animate-spin" : ""}`} />
              Ver instrucciones para tasa BCN
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
