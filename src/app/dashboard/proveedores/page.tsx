"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Plus, Truck, Search, X, Trash2, ChevronDown } from "lucide-react";

interface Proveedor {
  id: string;
  nombre: string;
  ruc?: string;
  direccion?: string;
  telefono?: string;
  correo?: string;
  contacto?: string;
  tipo_persona: "natural" | "juridica" | "cuota_fija" | "gran_contribuyente";
  activo: boolean;
}

const FORM_VACIO = {
  nombre: "", ruc: "", direccion: "", telefono: "",
  correo: "", contacto: "", tipo_persona: "juridica" as string,
};

export default function ProveedoresPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [busqueda,    setBusqueda]    = useState("");
  const [showModal,   setShowModal]   = useState(false);
  const [editando,    setEditando]    = useState<Proveedor | null>(null);
  const [guardando,   setGuardando]   = useState(false);
  const [confirmDel,  setConfirmDel]  = useState<Proveedor | null>(null);
  const [empresaId,   setEmpresaId]   = useState("");
  const [form,        setForm]        = useState({ ...FORM_VACIO });

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

    if (eId) {
      const { data } = await supabase.from("proveedores").select("*").eq("empresa_id", eId).order("nombre");
      setProveedores((data as Proveedor[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  function abrirNuevo() {
    setEditando(null);
    setForm({ ...FORM_VACIO });
    setShowModal(true);
  }

  function abrirEditar(p: Proveedor) {
    setEditando(p);
    setForm({
      nombre:       p.nombre,
      ruc:          p.ruc ?? "",
      direccion:    p.direccion ?? "",
      telefono:     p.telefono ?? "",
      correo:       p.correo ?? "",
      contacto:     p.contacto ?? "",
      tipo_persona: p.tipo_persona ?? "juridica",
    });
    setShowModal(true);
  }

  async function handleGuardar() {
    if (!form.nombre.trim()) { toast.error("El nombre del proveedor es obligatorio."); return; }
    if (!empresaId)           { toast.error("No se encontró la empresa."); return; }

    setGuardando(true);
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();

    const payload = {
      empresa_id:   empresaId,
      nombre:       form.nombre.trim(),
      ruc:          form.ruc || null,
      direccion:    form.direccion || null,
      telefono:     form.telefono || null,
      correo:       form.correo || null,
      contacto:     form.contacto || null,
      tipo_persona: form.tipo_persona,
    };

    if (editando) {
      const { error } = await supabase.from("proveedores").update(payload).eq("id", editando.id);
      if (error) { toast.error(`Error: ${error.message}`); setGuardando(false); return; }
      toast.success("Proveedor actualizado");
    } else {
      const { error } = await supabase.from("proveedores").insert({ ...payload, activo: true });
      if (error) { toast.error(`Error: ${error.message}`); setGuardando(false); return; }
      toast.success("Proveedor creado");
    }

    setShowModal(false);
    setGuardando(false);
    loadData();
  }

  async function handleEliminar(p: Proveedor) {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    await supabase.from("proveedores").update({ activo: false }).eq("id", p.id);
    toast.success(`"${p.nombre}" eliminado`);
    setConfirmDel(null);
    loadData();
  }

  async function handleToggleActivo(p: Proveedor) {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    await supabase.from("proveedores").update({ activo: !p.activo }).eq("id", p.id);
    toast.success(p.activo ? "Proveedor desactivado" : "Proveedor activado");
    loadData();
  }

  const filtrados = proveedores.filter(p =>
    p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    (p.ruc ?? "").includes(busqueda) ||
    (p.correo ?? "").toLowerCase().includes(busqueda.toLowerCase())
  );

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Proveedores</h1>
          <p className="text-slate-500 text-sm mt-1">Gestiona tus proveedores de productos y servicios</p>
        </div>
        <button onClick={abrirNuevo} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Nuevo proveedor
        </button>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" className="input pl-9" placeholder="Buscar por nombre, RUC o correo..."
              value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-7 h-7 border-4 border-brand-200 border-t-brand-700 rounded-full animate-spin" />
          </div>
        ) : !filtrados.length ? (
          <div className="text-center py-16 text-slate-400">
            <Truck className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium">{busqueda ? "No se encontraron proveedores" : "No hay proveedores registrados"}</p>
            {!busqueda && (
              <button onClick={abrirNuevo} className="btn-primary inline-flex items-center gap-2 mt-4">
                <Plus className="w-4 h-4" /> Agregar primer proveedor
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="table-header">Nombre</th>
                  <th className="table-header">Tipo</th>
                  <th className="table-header">RUC</th>
                  <th className="table-header">Contacto</th>
                  <th className="table-header">Teléfono</th>
                  <th className="table-header">Correo</th>
                  <th className="table-header">Estado</th>
                  <th className="table-header">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(p => (
                  <tr key={p.id} className={`hover:bg-slate-50 transition-colors ${!p.activo ? "opacity-50" : ""}`}>
                    <td className="table-cell font-medium">{p.nombre}</td>
                    <td className="table-cell">
                      {p.tipo_persona === "natural"          && <span className="badge-warning">Natural</span>}
                      {p.tipo_persona === "juridica"         && <span className="badge-info">Jurídica</span>}
                      {p.tipo_persona === "cuota_fija"       && <span className="badge-gray">Cuota Fija</span>}
                      {p.tipo_persona === "gran_contribuyente" && <span className="badge-success">Gran Contrib.</span>}
                      {!p.tipo_persona                       && <span className="badge-gray">Jurídica</span>}
                    </td>
                    <td className="table-cell font-mono text-xs">{p.ruc ?? "—"}</td>
                    <td className="table-cell">{p.contacto ?? "—"}</td>
                    <td className="table-cell">{p.telefono ?? "—"}</td>
                    <td className="table-cell text-sm">{p.correo ?? "—"}</td>
                    <td className="table-cell">
                      <span className={p.activo ? "badge-success" : "badge-gray"}>
                        {p.activo ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-3">
                        <button onClick={() => abrirEditar(p)} className="text-brand-700 hover:underline text-sm font-medium">Editar</button>
                        <button onClick={() => handleToggleActivo(p)} className="text-slate-400 hover:text-slate-700 text-sm">
                          {p.activo ? "Desactivar" : "Activar"}
                        </button>
                        <button onClick={() => setConfirmDel(p)} className="text-red-400 hover:text-red-600">
                          <Trash2 className="w-4 h-4" />
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

      {/* Confirmar eliminación */}
      {confirmDel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-modal w-full max-w-sm p-6 text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="font-display font-bold text-slate-900 mb-2">¿Eliminar proveedor?</h3>
            <p className="text-slate-500 text-sm mb-6">Se desactivará <strong>{confirmDel.nombre}</strong>. El historial de compras se conserva.</p>
            <div className="flex gap-3">
              <button onClick={() => handleEliminar(confirmDel)} className="btn-danger flex-1">Sí, eliminar</button>
              <button onClick={() => setConfirmDel(null)} className="btn-secondary flex-1">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal nuevo / editar */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-modal w-full max-w-lg">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h2 className="font-display text-xl font-bold text-slate-900">
                {editando ? "Editar proveedor" : "Nuevo proveedor"}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="label">Nombre / Razón social <span className="text-red-500">*</span></label>
                <input type="text" className="input" placeholder="Nombre del proveedor" value={form.nombre} onChange={f("nombre")} />
              </div>

              {/* Tipo de persona — CLAVE para retenciones IR */}
              <div>
                <label className="label">
                  Tipo de contribuyente <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <select className="input appearance-none pr-10" value={form.tipo_persona}
                    onChange={e => setForm(prev => ({ ...prev, tipo_persona: e.target.value }))}>
                    <option value="juridica">Persona Jurídica (empresa, S.A., SRL...)</option>
                    <option value="natural">Persona Natural — Régimen General</option>
                    <option value="cuota_fija">Persona Natural — Cuota Fija</option>
                    <option value="gran_contribuyente">Gran Contribuyente</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
                {form.tipo_persona === "natural" && (
                  <p className="text-amber-600 text-xs mt-1">
                    ⚠️ Aplica retención IR 2% (Código 22) — se incluirá en planilla de retenciones DGI
                  </p>
                )}
                {form.tipo_persona === "cuota_fija" && (
                  <p className="text-green-600 text-xs mt-1">
                    ✓ Cuota Fija — exento de retención IR en la fuente (Art. 44 Reglamento LCT)
                  </p>
                )}
                {form.tipo_persona === "gran_contribuyente" && (
                  <p className="text-blue-600 text-xs mt-1">
                    ✓ Gran Contribuyente — no sujeto a retenciones en la fuente
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">RUC / Cédula</label>
                  <input type="text" className="input" placeholder="RUC o cédula del proveedor" value={form.ruc} onChange={f("ruc")} />
                </div>
                <div>
                  <label className="label">Persona de contacto</label>
                  <input type="text" className="input" placeholder="Nombre del contacto" value={form.contacto} onChange={f("contacto")} />
                </div>
                <div>
                  <label className="label">Teléfono</label>
                  <input type="tel" className="input" placeholder="8888-8888" value={form.telefono} onChange={f("telefono")} />
                </div>
                <div>
                  <label className="label">Correo electrónico</label>
                  <input type="email" className="input" placeholder="proveedor@correo.com" value={form.correo} onChange={f("correo")} />
                </div>
              </div>
              <div>
                <label className="label">Dirección</label>
                <input type="text" className="input" placeholder="Dirección del proveedor" value={form.direccion} onChange={f("direccion")} />
              </div>
            </div>

            <div className="flex gap-3 p-6 border-t border-slate-100">
              <button onClick={handleGuardar} disabled={guardando} className="btn-primary flex-1 flex items-center justify-center gap-2">
                {guardando
                  ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : (editando ? "Guardar cambios" : "Crear proveedor")}
              </button>
              <button onClick={() => setShowModal(false)} className="btn-secondary px-6">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
