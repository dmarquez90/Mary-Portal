"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Plus, Package, Search, AlertTriangle, Trash2, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { Producto } from "@/types";

const FORM_VACIO = {
  codigo: "", nombre: "", descripcion: "", unidad_medida: "unidad",
  precio_compra: 0, precio_venta: 0, stock_actual: 0, stock_minimo: 0, aplica_iva: true,
};

export default function InventarioPage() {
  const [productos,  setProductos]  = useState<Producto[]>([]);
  const [busqueda,   setBusqueda]   = useState("");
  const [empresaId,  setEmpresaId]  = useState("");
  const [showModal,  setShowModal]  = useState(false);
  const [editando,   setEditando]   = useState<Producto | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [guardando,  setGuardando]  = useState(false);
  const [form,       setForm]       = useState({ ...FORM_VACIO });
  const [confirmDel, setConfirmDel] = useState<Producto | null>(null);

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
      const { data } = await supabase.from("productos").select("*").eq("empresa_id", eId).order("nombre");
      setProductos((data as Producto[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const filtrados = productos.filter(p =>
    p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    p.codigo.toLowerCase().includes(busqueda.toLowerCase())
  );

  const stockBajo = productos.filter(p => Number(p.stock_actual) <= Number(p.stock_minimo));

  function abrirNuevo() {
    setEditando(null);
    setForm({ ...FORM_VACIO });
    setShowModal(true);
  }

  function abrirEditar(p: Producto) {
    setEditando(p);
    setForm({
      codigo: p.codigo, nombre: p.nombre, descripcion: p.descripcion ?? "",
      unidad_medida: p.unidad_medida, precio_compra: p.precio_compra,
      precio_venta: p.precio_venta, stock_actual: p.stock_actual,
      stock_minimo: p.stock_minimo, aplica_iva: p.aplica_iva,
    });
    setShowModal(true);
  }

  async function handleGuardar() {
    if (!form.codigo.trim() || !form.nombre.trim()) { toast.error("Código y nombre son obligatorios."); return; }
    if (!empresaId) { toast.error("Configura tu empresa primero."); return; }

    setGuardando(true);
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();

    const payload = { ...form, empresa_id: empresaId };

    if (editando) {
      const { error } = await supabase.from("productos").update(payload).eq("id", editando.id);
      if (error) { toast.error(`Error: ${error.message}`); setGuardando(false); return; }
      toast.success("Producto actualizado");
    } else {
      const { error } = await supabase.from("productos").insert({ ...payload, activo: true });
      if (error) { toast.error(`Error: ${error.message}`); setGuardando(false); return; }
      toast.success("Producto creado");
    }

    setShowModal(false);
    setGuardando(false);
    loadData();
  }

  async function handleEliminar(p: Producto) {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    // Soft delete: marcar como inactivo
    const { error } = await supabase.from("productos").update({ activo: false }).eq("id", p.id);
    if (error) { toast.error(`Error: ${error.message}`); return; }
    toast.success(`"${p.nombre}" eliminado del inventario`);
    setConfirmDel(null);
    loadData();
  }

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Inventario</h1>
          <p className="text-slate-500 text-sm mt-1">Control de productos y existencias · Método FIFO</p>
        </div>
        <button onClick={abrirNuevo} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> Nuevo producto
        </button>
      </div>

      {stockBajo.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold text-amber-900 text-sm">{stockBajo.length} producto(s) con stock bajo o agotado</p>
            <p className="text-amber-700 text-xs mt-0.5">{stockBajo.map(p => p.nombre).join(", ")}</p>
          </div>
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" className="input pl-9" placeholder="Buscar por nombre o código..."
              value={busqueda} onChange={e => setBusqueda(e.target.value)} />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-7 h-7 border-4 border-brand-200 border-t-brand-700 rounded-full animate-spin" />
          </div>
        ) : !filtrados.length ? (
          <div className="text-center py-16 text-slate-400">
            <Package className="w-12 h-12 mx-auto mb-3 opacity-40" />
            <p className="font-medium">No hay productos</p>
            <button onClick={abrirNuevo} className="btn-primary inline-flex items-center gap-2 mt-4">
              <Plus className="w-4 h-4" /> Agregar producto
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="table-header">Código</th>
                  <th className="table-header">Nombre</th>
                  <th className="table-header">Unidad</th>
                  <th className="table-header">P. Compra</th>
                  <th className="table-header">P. Venta</th>
                  <th className="table-header">Stock</th>
                  <th className="table-header">Mín.</th>
                  <th className="table-header">IVA</th>
                  <th className="table-header">Estado</th>
                  <th className="table-header">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(p => {
                  const bajo = Number(p.stock_actual) <= Number(p.stock_minimo);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                      <td className="table-cell font-mono text-xs">{p.codigo}</td>
                      <td className="table-cell font-medium">{p.nombre}</td>
                      <td className="table-cell text-slate-500 text-xs">{p.unidad_medida}</td>
                      <td className="table-cell">{formatCurrency(p.precio_compra)}</td>
                      <td className="table-cell font-semibold">{formatCurrency(p.precio_venta)}</td>
                      <td className={`table-cell font-bold ${bajo ? "text-red-600" : "text-green-700"}`}>{p.stock_actual}</td>
                      <td className="table-cell text-slate-400">{p.stock_minimo}</td>
                      <td className="table-cell">{p.aplica_iva ? <span className="badge-info">15%</span> : <span className="badge-gray">No</span>}</td>
                      <td className="table-cell">{bajo ? <span className="badge-danger">Stock bajo</span> : <span className="badge-success">OK</span>}</td>
                      <td className="table-cell">
                        <div className="flex items-center gap-3">
                          <button onClick={() => abrirEditar(p)} className="text-brand-700 hover:underline text-sm font-medium">Editar</button>
                          <button onClick={() => setConfirmDel(p)} className="text-red-400 hover:text-red-600">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal crear/editar */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-modal w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-100 sticky top-0 bg-white rounded-t-2xl">
              <h2 className="font-display text-xl font-bold text-slate-900">{editando ? "Editar producto" : "Nuevo producto"}</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              <div>
                <label className="label">Código *</label>
                <input className="input" value={form.codigo} onChange={f("codigo")} placeholder="PROD-001" />
              </div>
              <div>
                <label className="label">Nombre *</label>
                <input className="input" value={form.nombre} onChange={f("nombre")} placeholder="Nombre del producto" />
              </div>
              <div className="col-span-2">
                <label className="label">Descripción</label>
                <input className="input" value={form.descripcion} onChange={f("descripcion")} />
              </div>
              <div>
                <label className="label">Unidad de medida</label>
                <select className="input" value={form.unidad_medida} onChange={f("unidad_medida")}>
                  {["unidad","caja","kg","gr","litro","ml","metro","par","docena","servicio"].map(u => <option key={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Aplica IVA 15%</label>
                <select className="input" value={form.aplica_iva ? "si" : "no"} onChange={e => setForm(f => ({ ...f, aplica_iva: e.target.value === "si" }))}>
                  <option value="si">Sí</option>
                  <option value="no">No</option>
                </select>
              </div>
              <div>
                <label className="label">Precio de compra (C$)</label>
                <input type="number" className="input" min="0" step="0.01" value={form.precio_compra} onChange={f("precio_compra")} />
              </div>
              <div>
                <label className="label">Precio de venta (C$)</label>
                <input type="number" className="input" min="0" step="0.01" value={form.precio_venta} onChange={f("precio_venta")} />
              </div>
              <div>
                <label className="label">Stock actual</label>
                <input type="number" className="input" min="0" step="0.01" value={form.stock_actual} onChange={f("stock_actual")} />
              </div>
              <div>
                <label className="label">Stock mínimo</label>
                <input type="number" className="input" min="0" step="0.01" value={form.stock_minimo} onChange={f("stock_minimo")} />
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t border-slate-100 sticky bottom-0 bg-white rounded-b-2xl">
              <button onClick={handleGuardar} disabled={guardando} className="btn-primary flex-1 flex items-center justify-center gap-2">
                {guardando ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : (editando ? "Guardar cambios" : "Crear producto")}
              </button>
              <button onClick={() => setShowModal(false)} className="btn-secondary px-6">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmar eliminación */}
      {confirmDel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-modal w-full max-w-sm p-6 text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="font-display font-bold text-slate-900 mb-2">¿Eliminar producto?</h3>
            <p className="text-slate-500 text-sm mb-6">
              Se desactivará <strong>{confirmDel.nombre}</strong>. El historial de compras y ventas se conserva.
            </p>
            <div className="flex gap-3">
              <button onClick={() => handleEliminar(confirmDel)} className="btn-danger flex-1">Sí, eliminar</button>
              <button onClick={() => setConfirmDel(null)} className="btn-secondary flex-1">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
