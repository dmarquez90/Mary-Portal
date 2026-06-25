"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Settings, Save } from "lucide-react";

interface Consecutivo {
  id: string;
  tipo: string;
  ultimo: number;
  prefijo: string;
  digitos: number;
}

export default function ConfiguracionPage() {
  const [consecutivos, setConsecutivos] = useState<Consecutivo[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [guardando,    setGuardando]    = useState(false);
  const [empresaId,    setEmpresaId]    = useState("");

  useEffect(() => {
    async function load() {
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

      if (eId) {
        const { data } = await supabase.from("consecutivos").select("*").eq("empresa_id", eId);
        const cons = (data as Consecutivo[]) ?? [];

        // Crear los que faltan
        const tipos = ["factura", "compra"];
        const existentes = cons.map(c => c.tipo);
        const faltantes = tipos.filter(t => !existentes.includes(t));

        if (faltantes.length > 0) {
          await supabase.from("consecutivos").insert(
            faltantes.map(t => ({
              empresa_id: eId,
              tipo: t,
              ultimo: 0,
              prefijo: t === "factura" ? "F" : "C",
              digitos: 6,
            }))
          );
          const { data: data2 } = await supabase.from("consecutivos").select("*").eq("empresa_id", eId);
          setConsecutivos((data2 as Consecutivo[]) ?? []);
        } else {
          setConsecutivos(cons);
        }
      }
      setLoading(false);
    }
    load();
  }, []);

  function updateCons(id: string, key: keyof Consecutivo, val: string | number) {
    setConsecutivos(prev => prev.map(c => c.id === id ? { ...c, [key]: val } : c));
  }

  async function handleGuardar() {
    setGuardando(true);
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();

    for (const c of consecutivos) {
      await supabase.from("consecutivos").update({
        prefijo: c.prefijo.toUpperCase(),
        ultimo:  Number(c.ultimo),
        digitos: Number(c.digitos),
      }).eq("id", c.id);
    }

    toast.success("Configuración guardada");
    setGuardando(false);
  }

  const preview = (c: Consecutivo) => {
    const sig = Number(c.ultimo) + 1;
    return `${c.prefijo.toUpperCase()}-${String(sig).padStart(Number(c.digitos), "0")}`;
  };

  const labelTipo: Record<string, string> = {
    factura: "Facturas de Venta",
    compra:  "Compras",
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold text-slate-900">Configuración</h1>
        <p className="text-slate-500 text-sm mt-1">Personaliza los consecutivos y parámetros del sistema</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-7 h-7 border-4 border-brand-200 border-t-brand-700 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* Consecutivos */}
          <div className="card">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-brand-100 flex items-center justify-center">
                <Settings className="w-5 h-5 text-brand-700" />
              </div>
              <div>
                <h2 className="font-semibold text-slate-900">Numeración de documentos</h2>
                <p className="text-slate-500 text-xs mt-0.5">Configura el prefijo, número inicial y cantidad de dígitos</p>
              </div>
            </div>

            <div className="space-y-6">
              {consecutivos.map(c => (
                <div key={c.id} className="border border-slate-200 rounded-xl p-4">
                  <p className="font-semibold text-slate-800 mb-4">
                    {labelTipo[c.tipo] ?? c.tipo}
                  </p>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="label">Prefijo</label>
                      <input
                        type="text"
                        className="input uppercase"
                        maxLength={5}
                        value={c.prefijo}
                        onChange={e => updateCons(c.id, "prefijo", e.target.value.toUpperCase())}
                        placeholder="F"
                      />
                      <p className="text-xs text-slate-400 mt-1">Letras antes del número</p>
                    </div>
                    <div>
                      <label className="label">Último número</label>
                      <input
                        type="number"
                        className="input"
                        min="0"
                        value={c.ultimo}
                        onChange={e => updateCons(c.id, "ultimo", parseInt(e.target.value) || 0)}
                      />
                      <p className="text-xs text-slate-400 mt-1">El siguiente será {Number(c.ultimo) + 1}</p>
                    </div>
                    <div>
                      <label className="label">Dígitos</label>
                      <select className="input" value={c.digitos} onChange={e => updateCons(c.id, "digitos", parseInt(e.target.value))}>
                        <option value={4}>4 dígitos</option>
                        <option value={5}>5 dígitos</option>
                        <option value={6}>6 dígitos</option>
                        <option value={7}>7 dígitos</option>
                        <option value={8}>8 dígitos</option>
                      </select>
                      <p className="text-xs text-slate-400 mt-1">Ceros a la izquierda</p>
                    </div>
                  </div>
                  {/* Vista previa */}
                  <div className="mt-4 bg-slate-50 rounded-lg p-3 flex items-center justify-between">
                    <span className="text-xs text-slate-500">Próximo número:</span>
                    <span className="font-mono font-bold text-brand-700 text-lg">{preview(c)}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6">
              <button onClick={handleGuardar} disabled={guardando} className="btn-primary flex items-center gap-2">
                {guardando ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                Guardar configuración
              </button>
            </div>
          </div>

          {/* Info IVA */}
          <div className="card">
            <h2 className="font-semibold text-slate-900 mb-3">Tasas impositivas Nicaragua</h2>
            <div className="space-y-2 text-sm">
              {[
                { label: "IVA general", valor: "15%", desc: "Aplica a la mayoría de bienes y servicios" },
                { label: "IR retención en la fuente", valor: "2%", desc: "Sobre compras a personas naturales" },
                { label: "IMI (1%)", valor: "1%", desc: "Impuesto municipal sobre ingresos" },
              ].map(item => (
                <div key={item.label} className="flex items-start justify-between py-2 border-b border-slate-100 last:border-0">
                  <div>
                    <p className="font-medium text-slate-700">{item.label}</p>
                    <p className="text-xs text-slate-400">{item.desc}</p>
                  </div>
                  <span className="font-mono font-bold text-brand-700 text-base">{item.valor}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
