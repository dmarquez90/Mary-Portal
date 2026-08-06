"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Save, Building2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { DEPARTAMENTOS_NICARAGUA } from "@/types";

interface Props {
  empresaNatural: Record<string, string> | null;
  empresaJuridica: Record<string, string> | null;
  userId: string;
}

export default function EmpresaForm({ empresaNatural, empresaJuridica, userId }: Props) {
  const supabase = createClient();
  const [loading, setLoading] = useState(false);

  const empresa = empresaNatural ?? empresaJuridica;
  const isJuridica = !!empresaJuridica;

  // Persona Natural
  const [nombreCompleto, setNombreCompleto] = useState(empresaNatural?.nombre_completo ?? "");
  const [nombreComercialNat, setNombreComercialNat] = useState(empresaNatural?.nombre_comercial ?? "");
  const [cedula, setCedula] = useState(empresaNatural?.numero_cedula ?? "");
  const [rucNatural, setRucNatural] = useState(empresaNatural?.numero_ruc ?? "");
  const [direccion, setDireccion] = useState(empresaNatural?.direccion ?? "");
  const [ciudad, setCiudad] = useState(empresaNatural?.ciudad ?? "");
  const [departamento, setDepartamento] = useState(empresaNatural?.departamento ?? "");
  const [telefono, setTelefono] = useState(empresaNatural?.telefono ?? "");
  const [sitioWebNat, setSitioWebNat] = useState(empresaNatural?.sitio_web ?? "");

  // Jurídica
  const [nombreEmpresa, setNombreEmpresa] = useState(empresaJuridica?.nombre_empresa ?? "");
  const [nombreComercial, setNombreComercial] = useState(empresaJuridica?.nombre_comercial ?? "");
  const [rucJuridica, setRucJuridica] = useState(empresaJuridica?.numero_ruc ?? "");
  const [representante, setRepresentante] = useState(empresaJuridica?.nombre_representante_legal ?? "");
  const [direccionLegal, setDireccionLegal] = useState(empresaJuridica?.direccion_legal ?? "");
  const [sitioWebJur, setSitioWebJur] = useState(empresaJuridica?.sitio_web ?? "");

  async function handleSave() {
    setLoading(true);

    if (isJuridica && empresa) {
      const { error } = await supabase.from("empresas_juridicas").update({
        nombre_empresa: nombreEmpresa,
        nombre_comercial: nombreComercial,
        numero_ruc: rucJuridica,
        nombre_representante_legal: representante,
        direccion_legal: direccionLegal,
        sitio_web: sitioWebJur || null,
        updated_at: new Date().toISOString(),
      }).eq("id", empresa.id);

      if (error) { toast.error("Error al guardar."); setLoading(false); return; }
    } else if (empresa) {
      const { error } = await supabase.from("empresas_persona_natural").update({
        nombre_completo: nombreCompleto,
        nombre_comercial: nombreComercialNat || null,
        numero_cedula: cedula,
        numero_ruc: rucNatural,
        direccion,
        ciudad,
        departamento,
        telefono,
        sitio_web: sitioWebNat || null,
        updated_at: new Date().toISOString(),
      }).eq("id", empresa.id);

      if (error) { toast.error("Error al guardar."); setLoading(false); return; }
    }

    toast.success("Datos de empresa actualizados");
    setLoading(false);
  }

  if (!empresa) {
    return (
      <div className="card text-center py-12">
        <Building2 className="w-12 h-12 mx-auto mb-3 text-slate-300" />
        <p className="text-slate-500">
          No se encontró información de empresa. 
          Regístrate nuevamente o contacta soporte.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <div className="card mb-5">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-brand-100 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-brand-700" />
          </div>
          <div>
            <p className="font-semibold text-slate-900">
              {isJuridica ? "Persona Jurídica" : empresaNatural?.tipo_empresa === "cuota_fija" ? "Cuota Fija" : "Persona Natural"}
            </p>
            <p className="text-slate-500 text-sm">Datos registrados en la DGI</p>
          </div>
        </div>

        {!isJuridica ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="label">Nombre completo</label>
              <input className="input" value={nombreCompleto} onChange={e => setNombreCompleto(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <label className="label">Nombre comercial <span className="text-slate-400 text-xs">(opcional)</span></label>
              <input className="input" placeholder="Ej. Pulpería Doña María" value={nombreComercialNat} onChange={e => setNombreComercialNat(e.target.value)} />
            </div>
            <div>
              <label className="label">Cédula</label>
              <input className="input" value={cedula} onChange={e => setCedula(e.target.value)} />
            </div>
            <div>
              <label className="label">RUC</label>
              <input className="input" value={rucNatural} onChange={e => setRucNatural(e.target.value)} maxLength={14} />
            </div>
            <div className="md:col-span-2">
              <label className="label">Dirección</label>
              <input className="input" value={direccion} onChange={e => setDireccion(e.target.value)} />
            </div>
            <div>
              <label className="label">Ciudad</label>
              <input className="input" value={ciudad} onChange={e => setCiudad(e.target.value)} />
            </div>
            <div>
              <label className="label">Departamento</label>
              <select className="input" value={departamento} onChange={e => setDepartamento(e.target.value)}>
                <option value="">Seleccionar...</option>
                {DEPARTAMENTOS_NICARAGUA.map(d => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Teléfono</label>
              <input className="input" value={telefono} onChange={e => setTelefono(e.target.value)} />
            </div>
            <div>
              <label className="label">Sitio web</label>
              <input className="input" value={sitioWebNat} onChange={e => setSitioWebNat(e.target.value)} />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Nombre de empresa</label>
              <input className="input" value={nombreEmpresa} onChange={e => setNombreEmpresa(e.target.value)} />
            </div>
            <div>
              <label className="label">Nombre comercial</label>
              <input className="input" value={nombreComercial} onChange={e => setNombreComercial(e.target.value)} />
            </div>
            <div>
              <label className="label">RUC (14 dígitos)</label>
              <input className="input" value={rucJuridica} onChange={e => setRucJuridica(e.target.value)} maxLength={14} />
            </div>
            <div>
              <label className="label">Representante legal</label>
              <input className="input" value={representante} onChange={e => setRepresentante(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <label className="label">Dirección legal</label>
              <input className="input" value={direccionLegal} onChange={e => setDireccionLegal(e.target.value)} />
            </div>
            <div>
              <label className="label">Sitio web</label>
              <input className="input" value={sitioWebJur} onChange={e => setSitioWebJur(e.target.value)} />
            </div>
          </div>
        )}
      </div>

      <button
        onClick={handleSave}
        disabled={loading}
        className="btn-primary flex items-center gap-2"
      >
        {loading ? (
          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : (
          <Save className="w-4 h-4" />
        )}
        Guardar cambios
      </button>
    </div>
  );
}
