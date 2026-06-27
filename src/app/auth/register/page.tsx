"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff, UserPlus, ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { DEPARTAMENTOS_NICARAGUA } from "@/types";

type TipoEmpresa = "persona_natural" | "cuota_fija" | "persona_juridica";

// Opciones de tipo de relación con la propiedad
const TIPO_PROPIETARIO_OPTIONS = [
  { value: "propietario",  label: "Propietario del local" },
  { value: "arrendatario", label: "Arrendatario / Inquilino" },
  { value: "renta",        label: "Declarado en Renta" },
  { value: "comodato",     label: "En comodato" },
  { value: "otro",         label: "Otro" },
];

export default function RegisterPage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading]       = useState(false);
  const [showPass, setShowPass]     = useState(false);
  const [tipoEmpresa, setTipoEmpresa] = useState<TipoEmpresa>("persona_natural");

  // ── Acceso ──────────────────────────────────────────
  const [email,           setEmail]           = useState("");
  const [password,        setPassword]        = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // ── Persona Natural / Cuota Fija ────────────────────
  const [nombreCompleto, setNombreCompleto] = useState("");
  const [numeroCedula,   setNumeroCedula]   = useState("");
  const [numeroRuc,      setNumeroRuc]      = useState("");
  const [direccion,      setDireccion]      = useState("");
  const [ciudad,         setCiudad]         = useState("");
  const [departamento,   setDepartamento]   = useState("");
  const [telefono,       setTelefono]       = useState("");
  const [sitioWeb,       setSitioWeb]       = useState("");

  // ── Persona Jurídica – datos empresa ────────────────
  const [nombreEmpresa,   setNombreEmpresa]   = useState("");
  const [nombreComercial, setNombreComercial] = useState("");
  const [rucJuridica,     setRucJuridica]     = useState("");
  const [direccionLegal,  setDireccionLegal]  = useState("");
  const [tipoPropietario, setTipoPropietario] = useState("");
  const [sitioWebJur,     setSitioWebJur]     = useState("");

  // ── Persona Jurídica – representante legal ──────────
  const [repNombre,    setRepNombre]    = useState("");
  const [repCedula,    setRepCedula]    = useState("");
  const [repDireccion, setRepDireccion] = useState("");
  const [repCiudad,    setRepCiudad]    = useState("");
  const [repEmail,     setRepEmail]     = useState("");
  const [repTelefono,  setRepTelefono]  = useState("");

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error("Las contraseñas no coinciden.");
      return;
    }
    if (password.length < 6) {
      toast.error("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (tipoEmpresa === "persona_juridica" && rucJuridica.trim().length !== 14) {
      toast.error("El RUC de Persona Jurídica debe tener exactamente 14 caracteres.");
      return;
    }

    setLoading(true);

    // 1. Crear usuario Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { tipo_empresa: tipoEmpresa } },
    });

    if (authError || !authData.user) {
      toast.error(authError?.message ?? "Error al crear la cuenta.");
      setLoading(false);
      return;
    }

    const userId = authData.user.id;

    // 2. Guardar datos empresa
    let dbError = null;

    if (tipoEmpresa === "persona_juridica") {
      const { error } = await supabase.from("empresas_juridicas").insert({
        user_id:                    userId,
        tipo_empresa:               "persona_juridica",
        nombre_empresa:             nombreEmpresa,
        nombre_comercial:           nombreComercial,
        numero_ruc:                 rucJuridica.replace(/\D/g, ""),
        direccion_legal:            direccionLegal,
        tipo_propietario:           tipoPropietario,
        nombre_representante_legal: repNombre,
        cedula_representante:       repCedula,
        direccion_representante:    repDireccion,
        ciudad_representante:       repCiudad,
        email_representante:        repEmail,
        telefono_representante:     repTelefono,
        correo_electronico:         email,
        sitio_web:                  sitioWebJur || null,
      });
      dbError = error;
    } else {
      const { error } = await supabase.from("empresas_persona_natural").insert({
        user_id:            userId,
        tipo_empresa:       tipoEmpresa,
        nombre_completo:    nombreCompleto,
        numero_cedula:      numeroCedula,
        numero_ruc:         numeroRuc.replace(/\D/g, ""),
        direccion,
        ciudad,
        departamento,
        correo_electronico: email,
        telefono,
        sitio_web:          sitioWeb || null,
      });
      dbError = error;
    }

    if (dbError) {
      toast.error("Error al guardar los datos. Intenta de nuevo.");
      setLoading(false);
      return;
    }

    // 3. Consecutivos por defecto
    await supabase.from("consecutivos").insert([
      { empresa_id: userId, tipo: "factura", ultimo: 0, prefijo: "F" },
      { empresa_id: userId, tipo: "compra",  ultimo: 0, prefijo: "C" },
    ]);

    toast.success("¡Cuenta creada exitosamente! Ahora inicia sesión.");
    router.push("/auth/login");
  }

  const esJuridica = tipoEmpresa === "persona_juridica";

  return (
    <div className="w-full max-w-2xl">
      <div className="bg-white rounded-2xl shadow-modal p-8">
        <div className="text-center mb-8">
          <h1 className="font-display text-2xl font-bold text-slate-900 mb-2">
            Crear cuenta
          </h1>
          <p className="text-slate-500 text-sm">
            Completa tus datos para registrarte en SARA
          </p>
        </div>

        <form onSubmit={handleRegister} className="space-y-5">

          {/* ── Tipo de empresa ── */}
          <div>
            <label className="label">
              Tipo de contribuyente <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <select
                className="input appearance-none pr-10"
                value={tipoEmpresa}
                onChange={(e) => setTipoEmpresa(e.target.value as TipoEmpresa)}
                required
              >
                <option value="persona_natural">Persona Natural</option>
                <option value="cuota_fija">Cuota Fija</option>
                <option value="persona_juridica">Persona Jurídica</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* ══════════════════════════════════════════════
              PERSONA NATURAL / CUOTA FIJA
          ══════════════════════════════════════════════ */}
          {!esJuridica && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="label">Nombre completo <span className="text-red-500">*</span></label>
                <input type="text" className="input" placeholder="Juan Carlos López Martínez"
                  value={nombreCompleto} onChange={e => setNombreCompleto(e.target.value)} required />
              </div>
              <div>
                <label className="label">Número de cédula <span className="text-red-500">*</span></label>
                <input type="text" className="input" placeholder="001-000000-0000A"
                  value={numeroCedula} onChange={e => setNumeroCedula(e.target.value)} required />
              </div>
              <div>
                <label className="label">Número RUC <span className="text-red-500">*</span></label>
                <input type="text" className="input" placeholder="00100000000000"
                  value={numeroRuc} onChange={e => setNumeroRuc(e.target.value)} required maxLength={14} />
              </div>
              <div className="md:col-span-2">
                <label className="label">Dirección <span className="text-red-500">*</span></label>
                <input type="text" className="input" placeholder="Barrio Los Robles, de la farmacia 2c al norte"
                  value={direccion} onChange={e => setDireccion(e.target.value)} required />
              </div>
              <div>
                <label className="label">Ciudad <span className="text-red-500">*</span></label>
                <input type="text" className="input" placeholder="Managua"
                  value={ciudad} onChange={e => setCiudad(e.target.value)} required />
              </div>
              <div>
                <label className="label">Departamento <span className="text-red-500">*</span></label>
                <div className="relative">
                  <select className="input appearance-none pr-10" value={departamento}
                    onChange={e => setDepartamento(e.target.value)} required>
                    <option value="">Seleccionar departamento</option>
                    {DEPARTAMENTOS_NICARAGUA.map(d => <option key={d}>{d}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="label">Teléfono <span className="text-red-500">*</span></label>
                <input type="tel" className="input" placeholder="8888-8888"
                  value={telefono} onChange={e => setTelefono(e.target.value)} required />
              </div>
              <div>
                <label className="label">Sitio web (opcional)</label>
                <input type="text" className="input" placeholder="www.miweb.com"
                  value={sitioWeb} onChange={e => setSitioWeb(e.target.value)} />
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════
              PERSONA JURÍDICA
          ══════════════════════════════════════════════ */}
          {esJuridica && (
            <>
              {/* Info RUC */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-blue-800 text-sm">
                ℹ️ Para Persona Jurídica el RUC debe contener exactamente 14 caracteres (letras y números).
              </div>

              {/* — Datos de la empresa — */}
              <div className="border border-slate-200 rounded-xl p-5 space-y-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  Datos de la empresa
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="label">Nombre de la empresa <span className="text-red-500">*</span></label>
                    <input type="text" className="input" placeholder="Comercial XYZ S.A."
                      value={nombreEmpresa} onChange={e => setNombreEmpresa(e.target.value)} required />
                  </div>
                  <div>
                    <label className="label">Nombre comercial <span className="text-red-500">*</span></label>
                    <input type="text" className="input" placeholder="XYZ Store"
                      value={nombreComercial} onChange={e => setNombreComercial(e.target.value)} required />
                  </div>
                  <div>
                    <label className="label">Número RUC (14 dígitos) <span className="text-red-500">*</span></label>
                    <input type="text" className="input" placeholder="J0000000000000"
                      value={rucJuridica} onChange={e => setRucJuridica(e.target.value)} required maxLength={14} />
                  </div>
                  <div>
                    <label className="label">Sitio web (opcional)</label>
                    <input type="text" className="input" placeholder="www.miempresa.com"
                      value={sitioWebJur} onChange={e => setSitioWebJur(e.target.value)} />
                  </div>

                  {/* Dirección legal */}
                  <div className="md:col-span-2">
                    <label className="label">Dirección legal <span className="text-red-500">*</span></label>
                    <input type="text" className="input" placeholder="Km. 5.5 Carretera Norte, Managua"
                      value={direccionLegal} onChange={e => setDireccionLegal(e.target.value)} required />
                  </div>

                  {/* Tipo propietario - dropdown separado */}
                  <div className="md:col-span-2">
                    <label className="label">Condición del local <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <select
                        className="input appearance-none pr-10"
                        value={tipoPropietario}
                        onChange={e => setTipoPropietario(e.target.value)}
                        required
                      >
                        <option value="">Seleccionar condición...</option>
                        {TIPO_PROPIETARIO_OPTIONS.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      Indica si eres propietario, arrendatario o si la dirección está declarada en Renta.
                    </p>
                  </div>
                </div>
              </div>

              {/* — Representante Legal — */}
              <div className="border border-slate-200 rounded-xl p-5 space-y-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                  Información del Representante Legal
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="label">Nombre completo <span className="text-red-500">*</span></label>
                    <input type="text" className="input" placeholder="María Elena López Martínez"
                      value={repNombre} onChange={e => setRepNombre(e.target.value)} required />
                  </div>
                  <div>
                    <label className="label">Número de cédula <span className="text-red-500">*</span></label>
                    <input type="text" className="input" placeholder="001-000000-0000A"
                      value={repCedula} onChange={e => setRepCedula(e.target.value)} required />
                  </div>
                  <div>
                    <label className="label">Teléfono <span className="text-red-500">*</span></label>
                    <input type="tel" className="input" placeholder="8888-8888"
                      value={repTelefono} onChange={e => setRepTelefono(e.target.value)} required />
                  </div>
                  <div>
                    <label className="label">Ciudad <span className="text-red-500">*</span></label>
                    <input type="text" className="input" placeholder="Managua"
                      value={repCiudad} onChange={e => setRepCiudad(e.target.value)} required />
                  </div>
                  <div>
                    <label className="label">Correo electrónico <span className="text-red-500">*</span></label>
                    <input type="email" className="input" placeholder="representante@empresa.com"
                      value={repEmail} onChange={e => setRepEmail(e.target.value)} required />
                  </div>
                  <div className="md:col-span-2">
                    <label className="label">Dirección <span className="text-red-500">*</span></label>
                    <input type="text" className="input" placeholder="Barrio, referencia de ubicación..."
                      value={repDireccion} onChange={e => setRepDireccion(e.target.value)} required />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── Datos de acceso ── */}
          <div className="border-t border-slate-100 pt-5">
            <p className="text-sm font-semibold text-slate-700 mb-4">
              Datos de acceso al sistema
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="label">Correo electrónico <span className="text-red-500">*</span></label>
                <input type="email" className="input" placeholder="correo@empresa.com"
                  value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" />
              </div>
              <div>
                <label className="label">Contraseña <span className="text-red-500">*</span></label>
                <div className="relative">
                  <input type={showPass ? "text" : "password"} className="input pr-10"
                    placeholder="Mínimo 6 caracteres" value={password}
                    onChange={e => setPassword(e.target.value)} required autoComplete="new-password" />
                  <button type="button" onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="label">Confirmar contraseña <span className="text-red-500">*</span></label>
                <input type={showPass ? "text" : "password"} className="input"
                  placeholder="Repite tu contraseña" value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)} required autoComplete="new-password" />
              </div>
            </div>
          </div>

          <button type="submit" disabled={loading}
            className="btn-primary w-full flex items-center justify-center gap-2 mt-2">
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <><UserPlus className="w-4 h-4" />Crear mi cuenta</>
            )}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-slate-500">
          ¿Ya tienes cuenta?{" "}
          <Link href="/auth/login" className="text-brand-700 font-semibold hover:underline">
            Iniciar sesión
          </Link>
        </div>
      </div>
    </div>
  );
}
}
