"use client";
export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { UserPlus, Ban, CheckCircle2, Settings2 } from "lucide-react";
import { usePermissionsSARA } from "@/hooks/usePermissionsSARA";
import { MODULOS_PERMISOS, type Rol, type PermisosCustom } from "@/lib/permissions";

interface UsuarioEmpresa {
  id: string;
  usuario_id: string;
  empresa_id: string;
  rol: Rol;
  permisos_custom: PermisosCustom | null;
  suspendido: boolean;
  suspendido_at: string | null;
  suspendido_razon: string | null;
  created_at: string;
  email: string | null;
}

const ROLES: Rol[] = ["admin", "contador", "auxiliar", "ventas"];

export default function UsuariosEmpresaPage() {
  const { loading: cargandoPermisos, empresaId, can, rol } = usePermissionsSARA();
  const [usuarios, setUsuarios] = useState<UsuarioEmpresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [creando, setCreando] = useState(false);
  const [emailNuevo, setEmailNuevo] = useState("");
  const [rolNuevo, setRolNuevo] = useState<Rol>("auxiliar");
  const [editandoPermisos, setEditandoPermisos] = useState<UsuarioEmpresa | null>(null);

  const cargar = useCallback(async () => {
    if (!empresaId) return;
    setLoading(true);
    const res = await fetch(`/api/admin/usuarios/listar?empresa_id=${empresaId}`);
    const data = await res.json();
    if (res.ok) setUsuarios(data.usuarios ?? []);
    else toast.error(data.error ?? "Error al cargar usuarios");
    setLoading(false);
  }, [empresaId]);

  useEffect(() => { cargar(); }, [cargar]);

  async function crearUsuario(e: React.FormEvent) {
    e.preventDefault();
    setCreando(true);
    const res = await fetch("/api/admin/usuarios/crear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailNuevo, rol: rolNuevo }),
    });
    const data = await res.json();
    setCreando(false);
    if (!res.ok) { toast.error(data.error ?? "No se pudo crear el usuario"); return; }
    toast.success(`Usuario creado. Contraseña temporal: ${data.password_temporal}`, { duration: 15000 });
    setEmailNuevo("");
    setRolNuevo("auxiliar");
    cargar();
  }

  async function suspender(u: UsuarioEmpresa) {
    const razon = window.prompt(`Razón para suspender a ${u.email ?? u.usuario_id}:`);
    if (razon === null || razon.trim() === "") { toast.error("La razón es obligatoria"); return; }
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { error } = await supabase.rpc("fn_suspender_usuario", { p_empresa_usuario_id: u.id, p_razon: razon });
    if (error) toast.error(error.message);
    else { toast.success("Usuario suspendido"); cargar(); }
  }

  async function reactivar(u: UsuarioEmpresa) {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { error } = await supabase.rpc("fn_reactivar_usuario", { p_empresa_usuario_id: u.id });
    if (error) toast.error(error.message);
    else { toast.success("Usuario reactivado"); cargar(); }
  }

  async function guardarPermisosCustom(u: UsuarioEmpresa, permisos: PermisosCustom) {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { error } = await supabase.rpc("fn_actualizar_permisos_custom", {
      p_empresa_usuario_id: u.id,
      p_permisos_custom: permisos,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Permisos actualizados");
    setEditandoPermisos(null);
    cargar();
  }

  if (cargandoPermisos || loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-7 h-7 border-4 border-brand-200 border-t-brand-700 rounded-full animate-spin" />
      </div>
    );
  }

  if (!can("usuarios_ver")) {
    return <p className="text-slate-500">No tienes permiso para ver esta sección.</p>;
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Usuarios de la Empresa</h1>
          <p className="text-slate-500 text-sm mt-1">Roles y permisos de las personas con acceso a tu empresa</p>
        </div>
      </div>

      {can("usuarios_gestionar") && (
        <form onSubmit={crearUsuario} className="mb-6 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 p-4">
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs font-medium text-slate-600 mb-1">Correo del nuevo usuario</label>
            <input type="email" required value={emailNuevo} onChange={e => setEmailNuevo(e.target.value)}
              className="input w-full" placeholder="usuario@empresa.com" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Rol</label>
            <select value={rolNuevo} onChange={e => setRolNuevo(e.target.value as Rol)} className="input">
              {ROLES.filter(r => r !== "admin" || rol === "admin").map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <button type="submit" disabled={creando} className="btn-primary flex items-center gap-2">
            <UserPlus size={16} /> Crear usuario
          </button>
        </form>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-4 py-2">Email</th>
              <th className="text-left px-4 py-2">Rol</th>
              <th className="text-left px-4 py-2">Estado</th>
              <th className="text-left px-4 py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map(u => (
              <tr key={u.id} className="border-t border-slate-100">
                <td className="px-4 py-2">{u.email ?? u.usuario_id}</td>
                <td className="px-4 py-2">{u.rol}</td>
                <td className="px-4 py-2">
                  {u.suspendido
                    ? <span className="text-red-600">Suspendido{u.suspendido_razon ? ` — ${u.suspendido_razon}` : ""}</span>
                    : <span className="text-emerald-600">Activo</span>}
                </td>
                <td className="px-4 py-2">
                  {can("usuarios_gestionar") && (
                    <div className="flex items-center gap-3">
                      {u.suspendido ? (
                        <button onClick={() => reactivar(u)} className="text-emerald-600 hover:underline flex items-center gap-1">
                          <CheckCircle2 size={14} /> Reactivar
                        </button>
                      ) : (
                        <button onClick={() => suspender(u)} className="text-red-600 hover:underline flex items-center gap-1">
                          <Ban size={14} /> Suspender
                        </button>
                      )}
                      <button onClick={() => setEditandoPermisos(u)} className="text-slate-600 hover:underline flex items-center gap-1">
                        <Settings2 size={14} /> Permisos
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {usuarios.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400">Sin usuarios registrados</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editandoPermisos && (
        <PermisosCustomModal
          usuario={editandoPermisos}
          onClose={() => setEditandoPermisos(null)}
          onSave={(p) => guardarPermisosCustom(editandoPermisos, p)}
        />
      )}
    </div>
  );
}

function PermisosCustomModal({ usuario, onClose, onSave }: {
  usuario: UsuarioEmpresa;
  onClose: () => void;
  onSave: (permisos: PermisosCustom) => void;
}) {
  const [permisos, setPermisos] = useState<PermisosCustom>(usuario.permisos_custom ?? {});

  function set(modulo: string, tipo: "ver" | "editar", valor: boolean | undefined) {
    setPermisos(prev => ({ ...prev, [modulo]: { ...prev[modulo], [tipo]: valor } }));
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6">
        <h2 className="font-display text-lg font-bold text-slate-900 mb-1">
          Permisos personalizados — {usuario.email}
        </h2>
        <p className="text-slate-500 text-sm mb-4">
          Sobrescribe el rol base ({usuario.rol}) módulo por módulo. Deja "heredar" para usar el permiso del rol.
        </p>
        <div className="space-y-3">
          {MODULOS_PERMISOS.map(m => (
            <div key={m.id} className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-sm text-slate-700">{m.label}</span>
              <div className="flex items-center gap-3 text-xs">
                <SelectorTristate
                  label="Ver"
                  valor={permisos[m.id]?.ver}
                  onChange={v => set(m.id, "ver", v)}
                />
                {m.tieneEditar && (
                  <SelectorTristate
                    label="Editar"
                    valor={permisos[m.id]?.editar}
                    onChange={v => set(m.id, "editar", v)}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
          <button onClick={() => onSave(permisos)} className="btn-primary">Guardar</button>
        </div>
      </div>
    </div>
  );
}

function SelectorTristate({ label, valor, onChange }: {
  label: string;
  valor: boolean | undefined;
  onChange: (v: boolean | undefined) => void;
}) {
  return (
    <label className="flex items-center gap-1">
      {label}
      <select
        className="input !py-1 !px-1 text-xs"
        value={valor === undefined ? "heredar" : String(valor)}
        onChange={e => {
          const v = e.target.value;
          onChange(v === "heredar" ? undefined : v === "true");
        }}
      >
        <option value="heredar">heredar</option>
        <option value="true">sí</option>
        <option value="false">no</option>
      </select>
    </label>
  );
}
