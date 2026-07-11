"use client";
export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, CheckCircle2, Eye, LogOut, ShieldAlert, Trash2, X } from "lucide-react";

interface Empresa {
  id: string;
  tipo: "juridica" | "natural";
  nombre: string;
  suspendida: boolean;
}

interface DetalleEmpresa {
  id: string;
  tipo: "juridica" | "natural";
  nombre: string;
  nombre_comercial: string | null;
  ruc: string | null;
  cedula?: string | null;
  representante_legal: string | null;
  direccion: string | null;
  correo: string | null;
  telefono: string | null;
  activa: boolean;
  suspendida: boolean;
  regimen_tributario: string | null;
  fecha_inscripcion_dgi: string | null;
  created_at: string;
}

interface UsuarioEmpresa {
  id: string;
  usuario_id: string;
  email: string;
  rol: string;
  suspendido: boolean;
  suspendido_razon: string | null;
  created_at: string;
}

export default function SuperAdminPage() {
  const router = useRouter();
  const [autorizado, setAutorizado] = useState<boolean | null>(null);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [detalle, setDetalle] = useState<DetalleEmpresa | null>(null);
  const [usuarios, setUsuarios] = useState<UsuarioEmpresa[]>([]);
  const [loadingDetalle, setLoadingDetalle] = useState(false);

  const cargar = useCallback(async () => {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setAutorizado(false); setLoading(false); return; }

    const { data: superAdminRow } = await supabase
      .from("super_admins").select("usuario_id").eq("usuario_id", user.id).maybeSingle();
    if (!superAdminRow) { setAutorizado(false); setLoading(false); return; }
    setAutorizado(true);

    const [{ data: juridicas }, { data: naturales }] = await Promise.all([
      supabase.from("empresas_juridicas").select("id, nombre_empresa, suspendida"),
      supabase.from("empresas_persona_natural").select("id, nombre_completo, suspendida"),
    ]);

    const lista: Empresa[] = [
      ...((juridicas ?? []).map(e => ({ id: e.id, tipo: "juridica" as const, nombre: e.nombre_empresa, suspendida: e.suspendida }))),
      ...((naturales ?? []).map(e => ({ id: e.id, tipo: "natural" as const, nombre: e.nombre_completo, suspendida: e.suspendida }))),
    ];
    setEmpresas(lista);
    setLoading(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  async function handleLogout() {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    await supabase.auth.signOut();
    toast.success("Sesión cerrada");
    router.push("/auth/login");
    router.refresh();
  }

  async function suspenderEmpresa(e: Empresa) {
    const razon = window.prompt(`Razón para suspender "${e.nombre}":`);
    if (razon === null || razon.trim() === "") { toast.error("La razón es obligatoria"); return; }
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { error } = await supabase.rpc("fn_suspender_empresa", { p_empresa_id: e.id, p_razon: razon });
    if (error) toast.error(error.message);
    else { toast.success("Empresa suspendida"); cargar(); }
  }

  async function reactivarEmpresa(e: Empresa) {
    const razon = window.prompt(`Razón para reactivar "${e.nombre}" (opcional):`) ?? "";
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { error } = await supabase.rpc("fn_reactivar_empresa", { p_empresa_id: e.id, p_razon: razon });
    if (error) toast.error(error.message);
    else { toast.success("Empresa reactivada"); cargar(); }
  }

  async function eliminarEmpresa(e: Empresa) {
    const razon = window.prompt(
      `Esto eliminará PERMANENTEMENTE a "${e.nombre}" y TODOS sus datos (facturas, asientos contables, planillas, etc.). No hay respaldo ni forma de deshacerlo.\n\nEscribe una razón para continuar:`
    );
    if (razon === null || razon.trim() === "") { toast.error("La razón es obligatoria"); return; }
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { error } = await supabase.rpc("fn_eliminar_empresa", { p_empresa_id: e.id, p_razon: razon });
    if (error) toast.error(error.message);
    else {
      toast.success("Empresa eliminada");
      if (detalle?.id === e.id) { setDetalle(null); setUsuarios([]); }
      cargar();
    }
  }

  async function verDetalle(e: Empresa) {
    setLoadingDetalle(true);
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const [{ data: det, error: errDet }, { data: usrs, error: errUsrs }] = await Promise.all([
      supabase.rpc("fn_detalle_empresa", { p_empresa_id: e.id }),
      supabase.rpc("fn_listar_usuarios_empresa", { p_empresa_id: e.id }),
    ]);
    if (errDet) { toast.error(errDet.message); setLoadingDetalle(false); return; }
    if (errUsrs) toast.error(errUsrs.message);
    setDetalle(det as DetalleEmpresa);
    setUsuarios((usrs ?? []) as UsuarioEmpresa[]);
    setLoadingDetalle(false);
  }

  async function suspenderUsuario(u: UsuarioEmpresa) {
    const razon = window.prompt(`Razón para suspender a "${u.email}":`);
    if (razon === null || razon.trim() === "") { toast.error("La razón es obligatoria"); return; }
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { error } = await supabase.rpc("fn_suspender_usuario", { p_empresa_usuario_id: u.id, p_razon: razon });
    if (error) toast.error(error.message);
    else { toast.success("Usuario suspendido"); if (detalle) verDetalle({ id: detalle.id, tipo: detalle.tipo, nombre: detalle.nombre, suspendida: detalle.suspendida }); }
  }

  async function reactivarUsuario(u: UsuarioEmpresa) {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { error } = await supabase.rpc("fn_reactivar_usuario", { p_empresa_usuario_id: u.id });
    if (error) toast.error(error.message);
    else { toast.success("Usuario reactivado"); if (detalle) verDetalle({ id: detalle.id, tipo: detalle.tipo, nombre: detalle.nombre, suspendida: detalle.suspendida }); }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="w-7 h-7 border-4 border-brand-200 border-t-brand-700 rounded-full animate-spin" />
      </div>
    );
  }

  if (!autorizado) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-center px-4">
        <ShieldAlert className="text-red-500 mb-3" size={40} />
        <h1 className="font-display text-xl font-bold text-slate-900">Acceso restringido</h1>
        <p className="text-slate-500 text-sm mt-1">Esta sección es exclusiva de Super Admin.</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 lg:p-8">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Panel Super Admin</h1>
          <p className="text-slate-500 text-sm mt-1">Empresas registradas en SARA</p>
        </div>
        <button onClick={handleLogout} className="text-slate-500 hover:text-red-600 flex items-center gap-1.5 text-sm shrink-0">
          <LogOut size={16} /> Cerrar sesión
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-4 py-2">Empresa</th>
              <th className="text-left px-4 py-2">Tipo</th>
              <th className="text-left px-4 py-2">Estado</th>
              <th className="text-left px-4 py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {empresas.map(e => (
              <tr key={e.id} className="border-t border-slate-100">
                <td className="px-4 py-2">{e.nombre}</td>
                <td className="px-4 py-2 capitalize">{e.tipo}</td>
                <td className="px-4 py-2">
                  {e.suspendida
                    ? <span className="text-red-600">Suspendida</span>
                    : <span className="text-emerald-600">Activa</span>}
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <button onClick={() => verDetalle(e)} className="text-slate-600 hover:underline flex items-center gap-1">
                      <Eye size={14} /> Ver detalle
                    </button>
                    {e.suspendida ? (
                      <button onClick={() => reactivarEmpresa(e)} className="text-emerald-600 hover:underline flex items-center gap-1">
                        <CheckCircle2 size={14} /> Reactivar
                      </button>
                    ) : (
                      <button onClick={() => suspenderEmpresa(e)} className="text-red-600 hover:underline flex items-center gap-1">
                        <Ban size={14} /> Suspender
                      </button>
                    )}
                    <button onClick={() => eliminarEmpresa(e)} className="text-red-700 hover:underline flex items-center gap-1">
                      <Trash2 size={14} /> Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {empresas.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400">Sin empresas registradas</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {(detalle || loadingDetalle) && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center overflow-y-auto p-4 z-50">
          <div className="bg-white rounded-xl max-w-2xl w-full mt-8 p-6 relative">
            <button
              onClick={() => { setDetalle(null); setUsuarios([]); }}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700"
            >
              <X size={20} />
            </button>

            {loadingDetalle && !detalle ? (
              <div className="flex items-center justify-center h-40">
                <div className="w-6 h-6 border-4 border-brand-200 border-t-brand-700 rounded-full animate-spin" />
              </div>
            ) : detalle && (
              <>
                <h2 className="font-display text-lg font-bold text-slate-900">{detalle.nombre}</h2>
                <p className="text-slate-500 text-sm capitalize mb-4">
                  Empresa {detalle.tipo} · {detalle.suspendida ? <span className="text-red-600">Suspendida</span> : <span className="text-emerald-600">Activa</span>}
                </p>

                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm mb-6">
                  {detalle.nombre_comercial && (<><dt className="text-slate-500">Nombre comercial</dt><dd className="text-slate-900">{detalle.nombre_comercial}</dd></>)}
                  {detalle.ruc && (<><dt className="text-slate-500">RUC</dt><dd className="text-slate-900">{detalle.ruc}</dd></>)}
                  {detalle.cedula && (<><dt className="text-slate-500">Cédula</dt><dd className="text-slate-900">{detalle.cedula}</dd></>)}
                  {detalle.representante_legal && (<><dt className="text-slate-500">Representante legal</dt><dd className="text-slate-900">{detalle.representante_legal}</dd></>)}
                  <dt className="text-slate-500">Régimen tributario</dt><dd className="text-slate-900">{detalle.regimen_tributario ?? "—"}</dd>
                  <dt className="text-slate-500">Correo</dt><dd className="text-slate-900">{detalle.correo ?? "—"}</dd>
                  <dt className="text-slate-500">Teléfono</dt><dd className="text-slate-900">{detalle.telefono ?? "—"}</dd>
                  <dt className="text-slate-500">Dirección</dt><dd className="text-slate-900">{detalle.direccion ?? "—"}</dd>
                  <dt className="text-slate-500">Fecha inscripción DGI</dt><dd className="text-slate-900">{detalle.fecha_inscripcion_dgi ?? "—"}</dd>
                  <dt className="text-slate-500">Registrada el</dt><dd className="text-slate-900">{new Date(detalle.created_at).toLocaleDateString()}</dd>
                </dl>

                <h3 className="font-display text-sm font-bold text-slate-900 mb-2">Usuarios ({usuarios.length})</h3>
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="text-left px-3 py-1.5">Correo</th>
                        <th className="text-left px-3 py-1.5">Rol</th>
                        <th className="text-left px-3 py-1.5">Estado</th>
                        <th className="text-left px-3 py-1.5">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usuarios.map(u => (
                        <tr key={u.id} className="border-t border-slate-100">
                          <td className="px-3 py-1.5">{u.email}</td>
                          <td className="px-3 py-1.5 capitalize">{u.rol}</td>
                          <td className="px-3 py-1.5">
                            {u.suspendido
                              ? <span className="text-red-600">Suspendido</span>
                              : <span className="text-emerald-600">Activo</span>}
                          </td>
                          <td className="px-3 py-1.5">
                            {u.suspendido ? (
                              <button onClick={() => reactivarUsuario(u)} className="text-emerald-600 hover:underline flex items-center gap-1">
                                <CheckCircle2 size={13} /> Reactivar
                              </button>
                            ) : (
                              <button onClick={() => suspenderUsuario(u)} className="text-red-600 hover:underline flex items-center gap-1">
                                <Ban size={13} /> Suspender
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {usuarios.length === 0 && (
                        <tr><td colSpan={4} className="px-3 py-4 text-center text-slate-400">Sin usuarios en esta empresa</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
