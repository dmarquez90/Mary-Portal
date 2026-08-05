"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Search, X, UserPlus, ChevronDown, FileText, Save } from "lucide-react";
import type { Proveedor } from "@/types";

const PROV_FORM_VACIO = {
  nombre: "", tipo_persona: "juridica" as string, ruc: "",
  contacto: "", telefono: "", correo: "", direccion: "",
};

interface Props {
  compraId: string;
  empresaId: string;
  proveedorIdInicial: string | null;
  proveedorNombreInicial?: string | null;
  numeroFacturaInicial: string | null;
  onClose: () => void;
  onSaved: (datos: { proveedor_id: string | null; proveedor_nombre: string | null; numero_factura_proveedor: string | null }) => void;
}

// Modal ligero para corregir SOLO el proveedor y el N° de factura del
// proveedor de una compra ya existente — a diferencia del editor completo
// (/compras/[id]/editar), no toca montos, líneas ni contabilidad, así que
// puede usarse sin importar el estado de la compra (recibida, pagada, etc.).
export default function EditarDatosProveedorModal({
  compraId, empresaId, proveedorIdInicial, proveedorNombreInicial, numeroFacturaInicial, onClose, onSaved,
}: Props) {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [proveedorId, setProveedorId] = useState(proveedorIdInicial ?? "");
  const [busquedaProv, setBusquedaProv] = useState(proveedorNombreInicial ?? "");
  const [mostrarDropdownProv, setMostrarDropdownProv] = useState(false);
  const [numFactura, setNumFactura] = useState(numeroFacturaInicial ?? "");
  const [guardando, setGuardando] = useState(false);

  const [showNuevoProv, setShowNuevoProv] = useState(false);
  const [provForm, setProvForm] = useState({ ...PROV_FORM_VACIO });
  const [creandoProv, setCreandoProv] = useState(false);

  useEffect(() => {
    async function load() {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data } = await supabase.from("proveedores").select("*").eq("empresa_id", empresaId).eq("activo", true).order("nombre");
      setProveedores((data as Proveedor[]) ?? []);
    }
    load();
  }, [empresaId]);

  function proveedoresFiltrados() {
    const b = busquedaProv.toLowerCase();
    if (!b) return proveedores;
    return proveedores.filter(p => p.nombre.toLowerCase().includes(b) || (p.ruc ?? "").toLowerCase().includes(b));
  }

  function sinResultadosProv() {
    return busquedaProv.length >= 2 && proveedoresFiltrados().length === 0;
  }

  function seleccionarProveedor(prov: Proveedor) {
    setProveedorId(prov.id);
    setBusquedaProv(prov.nombre);
    setMostrarDropdownProv(false);
  }

  function quitarProveedor() {
    setProveedorId("");
    setBusquedaProv("");
  }

  function abrirNuevoProveedor() {
    setProvForm({ ...PROV_FORM_VACIO, nombre: busquedaProv });
    setShowNuevoProv(true);
    setMostrarDropdownProv(false);
  }

  async function handleCrearProveedor() {
    if (!provForm.nombre.trim()) { toast.error("El nombre del proveedor es obligatorio."); return; }

    setCreandoProv(true);
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();

    const { data: nuevo, error } = await supabase.from("proveedores").insert({
      empresa_id: empresaId,
      nombre: provForm.nombre.trim(),
      tipo_persona: provForm.tipo_persona,
      ruc: provForm.ruc || null,
      contacto: provForm.contacto || null,
      telefono: provForm.telefono || null,
      correo: provForm.correo || null,
      direccion: provForm.direccion || null,
      activo: true,
    }).select().single();

    if (error || !nuevo) {
      toast.error(`Error al crear el proveedor: ${error?.message}`);
      setCreandoProv(false);
      return;
    }

    const provNuevo = nuevo as Proveedor;
    setProveedores(prev => [...prev, provNuevo].sort((a, b) => a.nombre.localeCompare(b.nombre)));
    seleccionarProveedor(provNuevo);
    toast.success(`Proveedor "${provNuevo.nombre}" creado`);
    setShowNuevoProv(false);
    setCreandoProv(false);
  }

  async function handleGuardar() {
    setGuardando(true);
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();

    const { error } = await supabase.from("compras").update({
      proveedor_id: proveedorId || null,
      numero_factura_proveedor: numFactura.trim() || null,
    }).eq("id", compraId);

    setGuardando(false);
    if (error) { toast.error(`Error al guardar: ${error.message}`); return; }

    toast.success("Datos del proveedor actualizados");
    onSaved({
      proveedor_id: proveedorId || null,
      proveedor_nombre: proveedores.find(p => p.id === proveedorId)?.nombre ?? null,
      numero_factura_proveedor: numFactura.trim() || null,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-modal w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
          <div>
            <h3 className="font-display text-lg font-bold text-slate-900">Editar datos del proveedor</h3>
            <p className="text-slate-400 text-xs mt-0.5">No afecta montos, artículos ni la contabilidad ya generada</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4">
          <div className="relative">
            <label className="label">Proveedor</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                className="input pl-8 pr-8"
                placeholder="Buscar proveedor..."
                value={busquedaProv}
                onChange={e => {
                  setBusquedaProv(e.target.value);
                  if (!e.target.value) setProveedorId("");
                  setMostrarDropdownProv(true);
                }}
                onFocus={() => setMostrarDropdownProv(true)}
                onBlur={() => setTimeout(() => setMostrarDropdownProv(false), 150)}
              />
              {busquedaProv && (
                <button type="button" onClick={quitarProveedor}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {mostrarDropdownProv && (
              <div className="absolute z-20 w-full bg-white border border-slate-200 rounded-xl shadow-lg mt-1 max-h-52 overflow-y-auto">
                {proveedoresFiltrados().map(prov => (
                  <button key={prov.id} type="button" className="w-full text-left px-4 py-2.5 hover:bg-brand-50 text-sm"
                    onMouseDown={() => seleccionarProveedor(prov)}>
                    <span className="font-medium">{prov.nombre}</span>
                    {prov.tipo_persona === "natural" && <span className="text-amber-600 text-xs ml-2">Natural</span>}
                    {prov.ruc && <span className="text-slate-400 text-xs ml-2">{prov.ruc}</span>}
                  </button>
                ))}
                <button type="button" className="w-full text-left px-4 py-3 hover:bg-brand-50 flex items-start gap-3 border-t border-slate-100"
                  onMouseDown={abrirNuevoProveedor}>
                  <UserPlus className="w-5 h-5 text-brand-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-brand-700">
                      {sinResultadosProv() ? `+ Crear "${busquedaProv}" como nuevo proveedor` : "+ Crear nuevo proveedor"}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">No existe en tu lista. Se creará automáticamente.</p>
                  </div>
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="label flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              N° Factura del proveedor
            </label>
            <input type="text" className="input font-mono" placeholder="Ej: 0001-0001-00123456"
              value={numFactura} onChange={e => setNumFactura(e.target.value.toUpperCase())} />
          </div>
        </div>

        <div className="flex gap-3 p-5 border-t border-slate-100 sticky bottom-0 bg-white rounded-b-2xl">
          <button onClick={handleGuardar} disabled={guardando} className="btn-primary flex-1 flex items-center justify-center gap-2">
            {guardando ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Save className="w-4 h-4" />Guardar cambios</>}
          </button>
          <button onClick={onClose} className="btn-secondary px-5">Cancelar</button>
        </div>
      </div>

      {/* Modal anidado: crear proveedor */}
      {showNuevoProv && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-modal w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
              <div>
                <h3 className="font-display text-lg font-bold text-slate-900 flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-brand-700" />
                  Nuevo proveedor
                </h3>
                <p className="text-slate-400 text-xs mt-0.5">Quedará disponible para esta y futuras compras</p>
              </div>
              <button onClick={() => setShowNuevoProv(false)} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="label">Nombre / Razón social <span className="text-red-500">*</span></label>
                <input className="input" value={provForm.nombre} onChange={e => setProvForm(f => ({ ...f, nombre: e.target.value }))} />
              </div>

              <div>
                <label className="label">Tipo de contribuyente <span className="text-red-500">*</span></label>
                <div className="relative">
                  <select className="input appearance-none pr-10" value={provForm.tipo_persona}
                    onChange={e => setProvForm(f => ({ ...f, tipo_persona: e.target.value }))}>
                    <option value="juridica">Persona Jurídica (empresa, S.A., SRL...)</option>
                    <option value="natural">Persona Natural — Régimen General</option>
                    <option value="cuota_fija">Persona Natural — Cuota Fija</option>
                    <option value="gran_contribuyente">Gran Contribuyente</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
                {provForm.tipo_persona === "natural" && (
                  <p className="text-amber-600 text-xs mt-1">⚠️ Aplica retención IR 2% (Código 22)</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">RUC / Cédula</label>
                  <input className="input" value={provForm.ruc} onChange={e => setProvForm(f => ({ ...f, ruc: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Persona de contacto</label>
                  <input className="input" value={provForm.contacto} onChange={e => setProvForm(f => ({ ...f, contacto: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Teléfono</label>
                  <input type="tel" className="input" placeholder="8888-8888" value={provForm.telefono}
                    onChange={e => setProvForm(f => ({ ...f, telefono: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Correo electrónico</label>
                  <input type="email" className="input" value={provForm.correo} onChange={e => setProvForm(f => ({ ...f, correo: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="label">Dirección</label>
                <input className="input" value={provForm.direccion} onChange={e => setProvForm(f => ({ ...f, direccion: e.target.value }))} />
              </div>
            </div>

            <div className="flex gap-3 p-5 border-t border-slate-100 sticky bottom-0 bg-white rounded-b-2xl">
              <button onClick={handleCrearProveedor} disabled={creandoProv} className="btn-primary flex-1 flex items-center justify-center gap-2">
                {creandoProv ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><UserPlus className="w-4 h-4" />Crear y usar</>}
              </button>
              <button onClick={() => setShowNuevoProv(false)} className="btn-secondary px-5">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
