import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mes  = parseInt(searchParams.get("mes")  ?? "0");
  const anio = parseInt(searchParams.get("anio") ?? "0");

  if (!mes || !anio) return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const [{ data: en }, { data: ej }] = await Promise.all([
    supabase.from("empresas_persona_natural").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("empresas_juridicas").select("*").eq("user_id", user.id).maybeSingle(),
  ]);

  const empresa = en
    ? { nombre: en.nombre_completo, ruc: en.numero_ruc }
    : ej
    ? { nombre: ej.nombre_empresa,  ruc: ej.numero_ruc }
    : { nombre: "", ruc: "" };

  const ids = [en?.id, ej?.id].filter(Boolean) as string[];
  if (!ids.length) return NextResponse.json({ error: "No hay empresa" }, { status: 400 });

  const firstDay = `${anio}-${String(mes).padStart(2, "0")}-01`;
  const lastDay  = new Date(anio, mes, 0).toISOString().split("T")[0];

  const [
    { data: cuentasCaja },
    { data: cuentasBanco },
    { data: movimientosCaja },
    { data: transaccionesBanco },
  ] = await Promise.all([
    supabase.from("cuentas_caja").select("*").in("empresa_id", ids).eq("activa", true).order("created_at"),
    supabase.from("cuentas_banco").select("*").in("empresa_id", ids).eq("activa", true).order("created_at"),
    supabase
      .from("movimientos_caja")
      .select("*, cuenta_caja:cuentas_caja(nombre, tipo)")
      .in("empresa_id", ids)
      .eq("estado", "registrado")
      .gte("fecha", firstDay)
      .lte("fecha", lastDay)
      .order("fecha", { ascending: false }),
    supabase
      .from("transacciones_banco")
      .select("*, cuenta_banco:cuentas_banco(nombre, banco)")
      .in("empresa_id", ids)
      .eq("estado", "registrado")
      .gte("fecha", firstDay)
      .lte("fecha", lastDay)
      .order("fecha", { ascending: false }),
  ]);

  return NextResponse.json({
    empresa,
    mes,
    anio,
    cuentasCaja:         cuentasCaja         ?? [],
    cuentasBanco:        cuentasBanco        ?? [],
    movimientosCaja:     movimientosCaja     ?? [],
    transaccionesBanco:  transaccionesBanco  ?? [],
  });
}
