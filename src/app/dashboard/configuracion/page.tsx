"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  Building2, Lock, Hash, Save, Eye, EyeOff,
  CheckCircle, AlertCircle, Settings,
} from "lucide-react";
import { DEPARTAMENTOS_NICARAGUA } from "@/types";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Consecutivo {
  id: string;
  tipo: string;
  ultimo: number;
  prefijo: string;
  digitos: number;
}

type Tab = "empresa" | "contrasena" | "serializacion";

// ─── Hook: datos de usuario y empresa ────────────────────────────────────────

function useSupabaseUser() {
  const [empresaId, setEmpresaId] = useState("");
  const [natural,   setNatural]   = useState<Record<string, string> | null>(null);
  const [juridica,  setJuridica]  = useState<Record<string, string> | null>(null);
  const [ready,     setReady]     = useState(false);

  const load = useCallback(async () => {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [{ data: en }, { data: ej }] = await Promise.all([
      supabase.from("empresas_persona_natural").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("empresas_juridicas").select("*").eq("user_id", user.id).maybeSingle(),
    ]);
    setNatural(en as Record<string, string> | null);
    setJuridica(ej as Record<string, string> | null);
    setEmpresaId((en as any)?.id ?? (ej as any)?.id ?? "");
    setReady(true);
  }, []);

  useEffect(() => { load(); }, [load]);
  return { empresaId, natural, juridica, ready };
}

// ══════════════════════════════════════════════════════════════════════════════
// PESTAÑA 1 — Datos de empresa
// ══════════════════════════════════════════════════════════════════════════════

function TabEmpresa({
  natural, juridica,
}: {
  natural: Record<string, string> | null;
  juridica: Record<string, string> | null;
}) {
  const isJuridica = !!juridica;
  const empresa    = natural ?? juridica;

  // Persona Natural
  const [nombreCompleto, setNombreCompleto] = useState(natural?.nombre_completo ?? "");
  const [cedula,         setCedula]         = useState(natural?.numero_cedula ?? "");
  const [rucNat,         setRucNat]         = useState(natural?.numero_ruc ?? "");
  const [direccion,      setDireccion]      = useState(natural?.direccion ?? "");
  const [ciudad,         setCiudad]         = useState(natural?.ciudad ?? "");
  const [departamento,   setDepartamento]   = useState(natural?.departamento ?? "");
  const [telefono,       setTelefono]       = useState(natural?.telefono ?? "");
  const [correoNat,      setCorreoNat]      = useState(natural?.correo_electronico ?? "");
  const [webNat,         setWebNat]         = useState(natural?.sitio_web ?? "");

  // Persona Juridica
  const [nombreEmpresa,   setNombreEmpresa]   = useState(juridica?.nombre_empresa ?? "");
  const [nombreComercial, setNombreComercial] = useState(juridica?.nombre_comercial ?? "");
  const [rucJur,          setRucJur]          = useState(juridica?.numero_ruc ?? "");
  const [representante,   setRepresentante]   = useState(juridica?.nombre_representante_legal ?? "");
  const [direccionLegal,  setDireccionLegal]  = useState(juridica?.direccion_legal ?? "");
  const [correoJur,       setCorreoJur]       = useState(juridica?.correo_electronico ?? "");
  const [webJur,          setWebJur]          = useState(juridica?.sitio_web ?? "");

  const [loading, setLoading] = useState(false);

  async function guardar() {
    if (!empresa) return;
    setLoading(true);
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();

    if (isJuridica) {
      const { error } = await supabase.from("empresas_juridicas").update({
        nombre_empresa:             nombreEmpresa,
        nombre_comercial:           nombreComercial,
        numero_ruc:                 rucJur,
        nombre_representante_legal: representante,
        direccion_legal:            direccionLegal,
        correo_electronico:         correoJur,
        sitio_web:                  webJur || null,
        updated_at:                 new Date().toISOString(),
      }).eq("id", empresa.id);
      if (error) { toast.error("Error: " + error.message); setLoading(false); return; }
    } else {
      const { error } = await supabase.from("empresas_persona_natural").update({
        nombre_completo:    nombreCompleto,
        numero_cedula:      cedula,
        numero_ruc:         rucNat,
        direccion,
        ciudad,
        departamento,
        telefono,
        correo_electronico: correoNat,
        sitio_web:          webNat || null,
        updated_at:         new Date().toISOString(),
      }).eq("id", empresa.id);
      if (error) { toast.error("Error: " + error.message); setLoading(false); return; }
    }

    toast.success("Datos de empresa actualizados");
    setLoading(false);
  }

  if (!empresa) {
    return (
      <div className="text-center py-16">
        <Building2 className="w-12 h-12 mx-auto mb-3 text-slate-300" />
        <p className="text-slate-500 font-medium">No se encontró información de empresa</p>
        <p className="text-slate-400 text-sm mt-1">
          Completa tu registro o contacta soporte
        </p>
      </div>
    );
  }

  const tipoLabel = isJuridica
    ? "Persona Jurídica"
    : natural?.tipo_empresa === "cuota_fija" ? "Cuota Fija" : "Persona Natural";

  return (
    <div className="space-y-6">
      {/* Badge tipo empresa */}
      <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
        <Building2 className="w-5 h-5 text-blue-600 flex-shrink-0" />
        <div>
          <p className="text-sm font-semibold text-blue-900">{tipoLabel}</p>
          <p className="text-xs text-blue-600 mt-0.5">
            Estos datos aparecen en tus facturas y son los que la DGI tiene registrados
          </p>
        </div>
      </div>

      {/* Formulario Persona Natural / Cuota Fija */}
      {!isJuridica && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="label">Nombre completo <span className="text-red-500">*</span></label>
            <input className="input" value={nombreCompleto} onChange={e => setNombreCompleto(e.target.value)}
              placeholder="Como aparece en la cédula" />
          </div>
          <div>
            <label className="label">Número de cédula <span className="text-red-500">*</span></label>
            <input className="input font-mono" value={cedula} onChange={e => setCedula(e.target.value)}
              placeholder="001-000000-0000X" />
            <p className="text-xs text-slate-400 mt-1">Formato: 001-000000-0000X</p>
          </div>
          <div>
            <label className="label">RUC <span className="text-red-500">*</span></label>
            <input className="input font-mono" value={rucNat} onChange={e => setRucNat(e.target.value)}
              placeholder="14 dígitos" maxLength={14} />
            <p className="text-xs text-slate-400 mt-1">14 dígitos sin guiones</p>
          </div>
          <div className="md:col-span-2">
            <label className="label">Dirección <span className="text-red-500">*</span></label>
            <input className="input" value={direccion} onChange={e => setDireccion(e.target.value)}
              placeholder="Dirección completa del negocio" />
          </div>
          <div>
            <label className="label">Ciudad</label>
            <input className="input" value={ciudad} onChange={e => setCiudad(e.target.value)} placeholder="Managua" />
          </div>
          <div>
            <label className="label">Departamento</label>
            <select className="input" value={departamento} onChange={e => setDepartamento(e.target.value)}>
              <option value="">Seleccionar...</option>
              {DEPARTAMENTOS_NICARAGUA.map(d => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Teléfono <span className="text-red-500">*</span></label>
            <input className="input" value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="2222-0000" />
          </div>
          <div>
            <label className="label">Correo electrónico <span className="text-red-500">*</span></label>
            <input type="email" className="input" value={correoNat} onChange={e => setCorreoNat(e.target.value)}
              placeholder="correo@empresa.com" />
          </div>
          <div className="md:col-span-2">
            <label className="label">Sitio web <span className="text-slate-400 font-normal">(opcional)</span></label>
            <input className="input" value={webNat} onChange={e => setWebNat(e.target.value)} placeholder="https://miempresa.com" />
          </div>
        </div>
      )}

      {/* Formulario Persona Juridica */}
      {isJuridica && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Nombre de la empresa <span className="text-red-500">*</span></label>
            <input className="input" value={nombreEmpresa} onChange={e => setNombreEmpresa(e.target.value)}
              placeholder="Razón social" />
          </div>
          <div>
            <label className="label">Nombre comercial <span className="text-red-500">*</span></label>
            <input className="input" value={nombreComercial} onChange={e => setNombreComercial(e.target.value)}
              placeholder="Nombre que usa el público" />
          </div>
          <div>
            <label className="label">RUC <span className="text-red-500">*</span></label>
            <input className="input font-mono" value={rucJur} onChange={e => setRucJur(e.target.value)}
              placeholder="14 dígitos" maxLength={14} />
            <p className="text-xs text-slate-400 mt-1">14 dígitos sin guiones</p>
          </div>
          <div>
            <label className="label">Representante legal <span className="text-red-500">*</span></label>
            <input className="input" value={representante} onChange={e => setRepresentante(e.target.value)}
              placeholder="Nombre completo" />
          </div>
          <div className="md:col-span-2">
            <label className="label">Dirección legal <span className="text-red-500">*</span></label>
            <input className="input" value={direccionLegal} onChange={e => setDireccionLegal(e.target.value)}
              placeholder="Dirección registrada en la DGI" />
          </div>
          <div>
            <label className="label">Correo electrónico <span className="text-red-500">*</span></label>
            <input type="email" className="input" value={correoJur} onChange={e => setCorreoJur(e.target.value)}
              placeholder="contacto@empresa.com" />
          </div>
          <div>
            <label className="label">Sitio web <span className="text-slate-400 font-normal">(opcional)</span></label>
            <input className="input" value={webJur} onChange={e => setWebJur(e.target.value)} placeholder="https://miempresa.com" />
          </div>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
        <button onClick={guardar} disabled={loading} className="btn-primary flex items-center gap-2">
          {loading
            ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            : <Save className="w-4 h-4" />}
          Guardar datos de empresa
        </button>
        <p className="text-xs text-slate-400">Estos datos se imprimen en tus facturas y reportes DGI</p>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PESTAÑA 2 — Cambiar contraseña
// ══════════════════════════════════════════════════════════════════════════════

function TabContrasena() {
  const [actual,     setActual]     = useState("");
  const [nueva,      setNueva]      = useState("");
  const [confirmar,  setConfirmar]  = useState("");
  const [showActual, setShowActual] = useState(false);
  const [showNueva,  setShowNueva]  = useState(false);
  const [showConf,   setShowConf]   = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [resultado,  setResultado]  = useState<"ok" | "error" | null>(null);
  const [msgError,   setMsgError]   = useState("");

  const longitud  = nueva.length >= 8;
  const mayuscula = /[A-Z]/.test(nueva);
  const numero    = /[0-9]/.test(nueva);
  const coinciden = nueva === confirmar && confirmar.length > 0;

  async function handleCambiar() {
    setResultado(null);
    setMsgError("");
    if (!actual.trim()) { setMsgError("Ingresa tu contraseña actual"); return; }
    if (!longitud || !mayuscula || !numero) { setMsgError("La nueva contraseña no cumple los requisitos"); return; }
    if (!coinciden) { setMsgError("Las contraseñas no coinciden"); return; }

    setLoading(true);
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) { setMsgError("No se pudo verificar tu sesión"); setLoading(false); return; }

    // Verificar contraseña actual
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email:    user.email,
      password: actual,
    });

    if (signInErr) {
      setMsgError("Contraseña actual incorrecta");
      setResultado("error");
      setLoading(false);
      return;
    }

    // Actualizar contraseña
    const { error: updErr } = await supabase.auth.updateUser({ password: nueva });
    if (updErr) {
      setMsgError("Error al actualizar: " + updErr.message);
      setResultado("error");
    } else {
      setResultado("ok");
      setActual(""); setNueva(""); setConfirmar("");
      toast.success("Contraseña actualizada correctamente");
    }
    setLoading(false);
  }

  const Req = ({ ok, label }: { ok: boolean; label: string }) => (
    <li className={`flex items-center gap-2 text-xs ${ok ? "text-green-600" : "text-slate-400"}`}>
      <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[10px] flex-shrink-0 ${ok ? "bg-green-100 text-green-600" : "bg-slate-100"}`}>
        {ok ? "✓" : "·"}
      </span>
      {label}
    </li>
  );

  const PwdInput = ({
    label, value, onChange, show, onToggle, placeholder,
  }: {
    label: string; value: string; onChange: (v: string) => void;
    show: boolean; onToggle: () => void; placeholder?: string;
  }) => (
    <div>
      <label className="label">{label}</label>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          className="input pr-10"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
        />
        <button type="button" onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );

  return (
    <div className="max-w-md space-y-5">
      {/* Requisitos */}
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
        <p className="text-sm font-medium text-slate-700 mb-3">Requisitos de la nueva contraseña:</p>
        <ul className="space-y-2">
          <Req ok={longitud}  label="Mínimo 8 caracteres" />
          <Req ok={mayuscula} label="Al menos una letra mayúscula (A-Z)" />
          <Req ok={numero}    label="Al menos un número (0-9)" />
          <Req ok={coinciden} label="Las contraseñas coinciden" />
        </ul>
      </div>

      <PwdInput label="Contraseña actual" value={actual} onChange={setActual}
        show={showActual} onToggle={() => setShowActual(v => !v)} placeholder="Tu contraseña actual" />

      <PwdInput label="Nueva contraseña" value={nueva}
        onChange={v => { setNueva(v); setResultado(null); }}
        show={showNueva} onToggle={() => setShowNueva(v => !v)} placeholder="Mínimo 8 caracteres" />

      <PwdInput label="Confirmar nueva contraseña" value={confirmar}
        onChange={v => { setConfirmar(v); setResultado(null); }}
        show={showConf} onToggle={() => setShowConf(v => !v)} placeholder="Repite la nueva contraseña" />

      {msgError && (
        <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {msgError}
        </div>
      )}

      {resultado === "ok" && (
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          Contraseña actualizada correctamente
        </div>
      )}

      <button onClick={handleCambiar} disabled={loading}
        className="btn-primary flex items-center gap-2 w-full justify-center">
        {loading
          ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          : <Lock className="w-4 h-4" />}
        Cambiar contraseña
      </button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PESTAÑA 3 — Serialización de documentos
// ══════════════════════════════════════════════════════════════════════════════

function TabSerializacion({ empresaId }: { empresaId: string }) {
  const [consecutivos, setConsecutivos] = useState<Consecutivo[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [guardando,    setGuardando]    = useState(false);

  useEffect(() => {
    if (!empresaId) return;
    (async () => {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data } = await supabase.from("consecutivos").select("*").eq("empresa_id", empresaId);
      const cons = (data as Consecutivo[]) ?? [];

      const tipos = ["factura", "compra"];
      const faltantes = tipos.filter(t => !cons.map(c => c.tipo).includes(t));

      if (faltantes.length > 0) {
        await supabase.from("consecutivos").insert(
          faltantes.map(t => ({
            empresa_id: empresaId,
            tipo:       t,
            ultimo:     0,
            prefijo:    t === "factura" ? "F" : "C",
            digitos:    6,
          }))
        );
        const { data: d2 } = await supabase.from("consecutivos").select("*").eq("empresa_id", empresaId);
        setConsecutivos((d2 as Consecutivo[]) ?? []);
      } else {
        setConsecutivos(cons);
      }
      setLoading(false);
    })();
  }, [empresaId]);

  function update(id: string, key: keyof Consecutivo, val: string | number) {
    setConsecutivos(prev => prev.map(c => c.id === id ? { ...c, [key]: val } : c));
  }

  async function guardar() {
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
    toast.success("Serialización guardada correctamente");
    setGuardando(false);
  }

  const preview = (c: Consecutivo) =>
    `${c.prefijo.toUpperCase()}-${String(Number(c.ultimo) + 1).padStart(Number(c.digitos), "0")}`;

  const meta: Record<string, { label: string; desc: string; accent: string }> = {
    factura: {
      label:  "Facturas de Venta",
      desc:   "Numeración correlativa para facturas emitidas a clientes",
      accent: "border-green-200 bg-green-50",
    },
    compra: {
      label:  "Comprobantes de Compra",
      desc:   "Numeración correlativa para compras a proveedores",
      accent: "border-blue-200 bg-blue-50",
    },
  };

  if (loading) return (
    <div className="flex items-center justify-center h-40">
      <div className="w-7 h-7 border-4 border-brand-200 border-t-brand-700 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5">
      {/* Aviso DGI */}
      <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
        <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800">
          <strong>Importante:</strong> La DGI exige que los números sean correlativos y sin saltos.
          Solo modifica el último número si necesitas corregir un rango. El prefijo puede ser
          personalizado (ej: FAC, VEN, COM).
        </p>
      </div>

      {consecutivos
        .sort((a, b) => a.tipo.localeCompare(b.tipo))
        .map(c => {
          const m = meta[c.tipo] ?? { label: c.tipo, desc: "", accent: "border-slate-200 bg-slate-50" };
          return (
            <div key={c.id} className={`border rounded-xl p-5 ${m.accent}`}>
              <div className="mb-4">
                <p className="font-semibold text-slate-800">{m.label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{m.desc}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="label">Prefijo</label>
                  <input
                    type="text"
                    className="input uppercase font-mono tracking-widest"
                    maxLength={5}
                    value={c.prefijo}
                    onChange={e => update(c.id, "prefijo", e.target.value.toUpperCase())}
                    placeholder="F"
                  />
                  <p className="text-xs text-slate-400 mt-1">Letras antes del número (ej: FAC)</p>
                </div>
                <div>
                  <label className="label">Último número emitido</label>
                  <input
                    type="number"
                    className="input"
                    min="0"
                    value={c.ultimo}
                    onChange={e => update(c.id, "ultimo", parseInt(e.target.value) || 0)}
                  />
                  <p className="text-xs text-slate-400 mt-1">El próximo será {Number(c.ultimo) + 1}</p>
                </div>
                <div>
                  <label className="label">Dígitos</label>
                  <select className="input" value={c.digitos}
                    onChange={e => update(c.id, "digitos", parseInt(e.target.value))}>
                    {[4, 5, 6, 7, 8].map(n => (
                      <option key={n} value={n}>{n} dígitos</option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-400 mt-1">Ceros a la izquierda</p>
                </div>
              </div>

              {/* Vista previa */}
              <div className="mt-4 bg-white/80 rounded-lg px-4 py-3 flex items-center justify-between border border-white shadow-sm">
                <span className="text-xs text-slate-500 font-medium">Próximo número a emitir:</span>
                <span className="font-mono font-bold text-brand-700 text-2xl tracking-wider">{preview(c)}</span>
              </div>
            </div>
          );
        })}

      {/* Tasas informativas */}
      <div className="border border-slate-200 rounded-xl p-5">
        <p className="font-semibold text-slate-800 mb-3">Tasas impositivas Nicaragua</p>
        <div className="space-y-0">
          {[
            { label: "IVA general",               valor: "15%", desc: "Mayoría de bienes y servicios (Art. 107 LCT)" },
            { label: "IR retención en la fuente",  valor: "2%",  desc: "Compras a personas naturales (Art. 44 LCT)" },
            { label: "IMI (Impuesto Municipal)",    valor: "1%",  desc: "Sobre ingresos brutos mensuales" },
          ].map(item => (
            <div key={item.label}
              className="flex items-start justify-between py-3 border-b border-slate-100 last:border-0">
              <div>
                <p className="text-sm font-medium text-slate-700">{item.label}</p>
                <p className="text-xs text-slate-400">{item.desc}</p>
              </div>
              <span className="font-mono font-bold text-brand-700 text-base ml-4">{item.valor}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="pt-2">
        <button onClick={guardar} disabled={guardando} className="btn-primary flex items-center gap-2">
          {guardando
            ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            : <Save className="w-4 h-4" />}
          Guardar serialización
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════════

const TABS: { id: Tab; label: string; icon: typeof Building2 }[] = [
  { id: "empresa",       label: "Datos de Empresa", icon: Building2 },
  { id: "contrasena",    label: "Contraseña",        icon: Lock      },
  { id: "serializacion", label: "Serialización",     icon: Hash      },
];

export default function ConfiguracionPage() {
  const [tab, setTab] = useState<Tab>("empresa");
  const { natural, juridica, empresaId, ready } = useSupabaseUser();

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-brand-100 flex items-center justify-center">
          <Settings className="w-5 h-5 text-brand-700" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Configuración</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Datos de empresa, seguridad y numeración de documentos
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 mb-7">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
                tab === t.id
                  ? "border-brand-600 text-brand-700"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Contenido */}
      {!ready ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-7 h-7 border-4 border-brand-200 border-t-brand-700 rounded-full animate-spin" />
        </div>
      ) : (
        <div>
          {tab === "empresa"       && <TabEmpresa natural={natural} juridica={juridica} />}
          {tab === "contrasena"    && <TabContrasena />}
          {tab === "serializacion" && <TabSerializacion empresaId={empresaId} />}
        </div>
      )}
    </div>
  );
}
