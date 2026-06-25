"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Plus, Users, Search, X, ChevronDown, Trash2 } from "lucide-react";
import { DEPARTAMENTOS_NICARAGUA } from "@/types";

interface Cliente {
  id: string;
  nombre: string;
  ruc?: string;
  cedula?: string;
  direccion?: string;
  ciudad?: string;
  departamento?: string;
  telefono?: string;
  correo?: string;
  tipo: "contado" | "credito";
  limite_credito?: number;
  activo: boolean;
}

const FORM_VACIO = {
  nombre: "", ruc: "", cedula: "", direccion: "", ciudad: "",
  departamento: "", telefono: "", correo: "", tipo: "contado", limite_credito: 0,
};

export default function ClientesPage() {
  const [clientes,   setClientes]   = useState<Cliente[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [busqueda,   setBusqueda]   = useState("");
  const [showModal,  setShowModal]  = useState(false);
  const [editando,   setEditando]   = useState<Cliente | null>(null);
  const [guardando,  setGuardando]  = useState(false);
  const [confirmDel, setConfirmDel] = useState<Cliente | null>(null);
  const [empresaId,  setEmpresaId]  = useState("");
  const [form,       setForm]       = useState({ ...FORM_VACIO });

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
      const { data } = await supabase
        .from("clientes")
        .select("*")
        .eq("empresa_id", eId)
        .order("nombre");
      setClientes((data as Cliente[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  function abrirNuevo() {
    setEditando(null);
    setForm({ ...FORM_VACIO });
    setShowModal(true);
  }

  function abrirEditar(c: Cliente) {
    setEditando(c);
    setForm({
      nombre:         c.nombre,
      ruc:            c.ruc ?? "",
      cedula:         c.cedula ?? "",
      direccion:      c.direccion ?? "",
      ciudad:         c.ciudad ?? "",
      departamento:   c.departamento ?? "",
      telefono:       c.telefono ?? "",
      correo:         c.correo ?? "",
      tipo:           c.tipo,
      limite_credito: c.limite_credito ?? 0,
    });
    setShowModal(true);
  }

  async function handleGuardar() {
    if (!form.nombre.trim()) { toast.error("El nombre del cliente es obligatorio."); return; }
    if (!empresaId)           { toast.error("No se encontró la empresa."); return; }

    setGuardando(true);
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();

    const payload = {
      empresa_id:     empresaId,
      nombre:         form.nombre.trim(),
      ruc:            form.ruc || null,
      cedula:         form.cedula || null,
      direccion:      form.direccion || null,
      ciudad:         form.ciudad || null,
      departamento:   form.departamento || null,
      telefono:       form.telefono || null,
      correo:         form.correo || null,
      tipo:           form.tipo,
      limite_credito: form.tipo === "credito" ? Number(form.limite_credito) : 0,
    };

    if (editando) {
      const { error } = await supabase.from("clientes").update(payload).eq("id", editando.id);
      if (error) { toast.error(`Error: ${error.message}`); setGuardando(false); return; }
      toast.success("Cliente actualizado");
    } else {
      const { error } = await supabase.from("clientes").insert({ ...payload, activo: true });
      if (error) { toast.error(`Error: ${error.message}`); setGuardando(false); return; }
      toast.success("Cliente creado");
    }

    setShowModal(false);
    setGuardando(false);
    loadData();
  }

  async function handleEliminar(c: Cliente) {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    await supabase.from("clientes").update({ activo: false }).eq("id", c.id);
    toast.success(`"${c.nombre}" eliminado`);
    setConfirmDel(null);
    loadData();
  }

  async function handleToggleActivo(c: Cliente) {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    await supabase.from("clientes").update({ activo: !c.activo }).eq("id", c.id);
    toast.success(c.activo ? "Cliente desactivado" : "Cliente activado");
    loadData();
  }

  const filtrados = clientes.filter(c =>
    c.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    (c.ruc ?? "").includes(busqueda) ||
    (c.cedula ?? "").includes(busqueda) ||
    (c.correo ?? "").toLowerCase().includes(busqueda.toLowerCase())
  );

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  return (
    <div>
      {/* ── Encabezado ── */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Clientes</h1>
          <p className="text-slate-500 text-sm mt-1">Gestiona tu cartera de clientes</p>
        </div>
        <button onClick={abrirNuevo} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Nuevo cliente
        </button>
      </div>

      {/* ── Tabla ── */}
      <div className="card p-0 overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text" className="input pl-9"
              placeholder="Buscar por nombre, RUC, cédula o correo..."
              value={busqueda} onChange={e => setBusqueda(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-7 h-7 border-4 border-brand-200 border-t-brand-700 rounded-full animate-spin" />
          </div>
        ) : !filtrados.length ? (
          <div className="text-center py-16 text-slate-400">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium">{busqueda ? "No se encontraron clientes" : "No hay clientes registrados"}</p>
            {!busqueda && (
              <button onClick={abrirNuevo} className="btn-primary inline-flex items-center gap-2 mt-4">
                <Plus className="w-4 h-4" /> Agregar primer cliente
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="table-header">Nombre</th>
                  <th className="table-header">RUC / Cédula</th>
                  <th className="table-header">Teléfono</th>
                  <th className="table-header">Correo</th>
                  <th className="table-header">Tipo</th>
                  <th className="table-header">Estado</th>
                  <th className="table-header">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(c => (
                  <tr key={c.id} className={`hover:bg-slate-50 transition-colors ${!c.activo ? "opacity-50" : ""}`}>
                    <td className="table-cell font-medium">{c.nombre}</td>
                    <td className="table-cell text-slate-500 text-xs font-mono">
                      {c.ruc && <div>RUC: {c.ruc}</div>}
                      {c.cedula && <div>Céd: {c.cedula}</div>}
                      {!c.ruc && !c.cedula && "—"}
                    </td>
                    <td className="table-cell">{c.telefono ?? "—"}</td>
                    <td className="table-cell text-sm">{c.correo ?? "—"}</td>
                    <td className="table-cell">
                      <span className={c.tipo === "credito" ? "badge-warning" : "badge-info"}>
                        {c.tipo === "credito" ? "Crédito" : "Contado"}
                      </span>
                    </td>
                    <td className="table-cell">
                      <span className={c.activo ? "badge-success" : "badge-gray"}>
                        {c.activo ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="table-cell">
                      <div className="flex items-center gap-3">
                        <button onClick={() => abrirEditar(c)} className="text-brand-700 hover:underline text-sm font-medium">Editar</button>
                        <button onClick={() => handleToggleActivo(c)} className="text-slate-400 hover:text-slate-700 text-sm">{c.activo ? "Desactivar" : "Activar"}</button>
                        <button onClick={() => setConfirmDel(c)} className="text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
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
            <h3 className="font-display font-bold text-slate-900 mb-2">¿Eliminar cliente?</h3>
            <p className="text-slate-500 text-sm mb-6">Se desactivará <strong>{confirmDel.nombre}</strong>. El historial de facturas se conserva.</p>
            <div className="flex gap-3">
              <button onClick={() => handleEliminar(confirmDel)} className="btn-danger flex-1">Sí, eliminar</button>
              <button onClick={() => setConfirmDel(null)} className="btn-secondary flex-1">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal nuevo / editar ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-modal w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
              <h2 className="font-display text-xl font-bold text-slate-900">
                {editando ? "Editar cliente" : "Nuevo cliente"}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Nombre */}
              <div>
                <label className="label">Nombre completo / Razón social <span className="text-red-500">*</span></label>
                <input type="text" className="input" placeholder="Nombre del cliente" value={form.nombre} onChange={f("nombre")} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">RUC</label>
                  <input type="text" className="input" placeholder="00000000000000" value={form.ruc} onChange={f("ruc")} />
                </div>
                <div>
                  <label className="label">Cédula</label>
                  <input type="text" className="input" placeholder="001-000000-0000A" value={form.cedula} onChange={f("cedula")} />
                </div>
                <div>
                  <label className="label">Teléfono</label>
                  <input type="tel" className="input" placeholder="8888-8888" value={form.telefono} onChange={f("telefono")} />
                </div>
                <div>
                  <label className="label">Correo electrónico</label>
                  <input type="email" className="input" placeholder="cliente@correo.com" value={form.correo} onChange={f("correo")} />
                </div>
              </div>

              <div>
                <label className="label">Dirección</label>
                <input type="text" className="input" placeholder="Dirección del cliente" value={form.direccion} onChange={f("direccion")} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Ciudad</label>
                  <input type="text" className="input" placeholder="Managua" value={form.ciudad} onChange={f("ciudad")} />
                </div>
                <div>
                  <label className="label">Departamento</label>
                  <div className="relative">
                    <select className="input appearance-none pr-10" value={form.departamento} onChange={f("departamento")}>
                      <option value="">Seleccionar...</option>
                      {DEPARTAMENTOS_NICARAGUA.map(d => <option key={d}>{d}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              </div>

              {/* Tipo de cliente */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Tipo de cliente</label>
                  <div className="relative">
                    <select className="input appearance-none pr-10" value={form.tipo} onChange={f("tipo")}>
                      <option value="contado">Contado</option>
                      <option value="credito">Crédito</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>
                {form.tipo === "credito" && (
                  <div>
                    <label className="label">Límite de crédito (C$)</label>
                    <input type="number" className="input" min="0" step="0.01"
                      value={form.limite_credito} onChange={f("limite_credito")} />
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 p-6 border-t border-slate-100 sticky bottom-0 bg-white rounded-b-2xl">
              <button onClick={handleGuardar} disabled={guardando} className="btn-primary flex-1 flex items-center justify-center gap-2">
                {guardando
                  ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : (editando ? "Guardar cambios" : "Crear cliente")}
              </button>
              <button onClick={() => setShowModal(false)} className="btn-secondary px-6">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
