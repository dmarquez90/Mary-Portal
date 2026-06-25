"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import EmpresaForm from "./EmpresaForm";

export default function EmpresaPage() {
  const [data, setData] = useState<{ natural: Record<string,string>|null; juridica: Record<string,string>|null; userId: string } | null>(null);

  useEffect(() => {
    async function load() {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [{ data: natural }, { data: juridica }] = await Promise.all([
        supabase.from("empresas_persona_natural").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("empresas_juridicas").select("*").eq("user_id", user.id).maybeSingle(),
      ]);

      setData({ natural: natural as Record<string,string>|null, juridica: juridica as Record<string,string>|null, userId: user.id });
    }
    load();
  }, []);

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold text-slate-900">Mi Empresa</h1>
        <p className="text-slate-500 text-sm mt-1">Información fiscal y datos de contacto de tu negocio</p>
      </div>
      {!data ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-7 h-7 border-4 border-brand-200 border-t-brand-700 rounded-full animate-spin" />
        </div>
      ) : (
        <EmpresaForm empresaNatural={data.natural} empresaJuridica={data.juridica} userId={data.userId} />
      )}
    </div>
  );
}
