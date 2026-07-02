"use client";
export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Ban, CheckCircle2, ShieldAlert } from "lucide-react";

interface Empresa {
  id: string;
  tipo: "juridica" | "natural";
  nombre: string;
  suspendida: boolean;
}

export default function SuperAdminPage() {
  const [autorizado, setAutorizado] = useState<boolean | null>(null);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);

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
      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold text-slate-900">Panel Super Admin</h1>
        <p className="text-slate-500 text-sm mt-1">Empresas registradas en SARA</p>
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
                  {e.suspendida ? (
                    <button onClick={() => reactivarEmpresa(e)} className="text-emerald-600 hover:underline flex items-center gap-1">
                      <CheckCircle2 size={14} /> Reactivar
                    </button>
                  ) : (
                    <button onClick={() => suspenderEmpresa(e)} className="text-red-600 hover:underline flex items-center gap-1">
                      <Ban size={14} /> Suspender
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {empresas.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400">Sin empresas registradas</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
