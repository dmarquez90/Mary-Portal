import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Endpoint llamado por el workflow n8n (cron diario) para actualizar la
// tasa USD/EUR -> NIO. Protegido con API key propia (no sesión de usuario),
// porque n8n llama server-to-server. Aplica la misma tasa a todas las
// empresas activas para no duplicar información por empresa.
export async function POST(request: NextRequest) {
  const apiKey = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!apiKey || apiKey !== process.env.N8N_TASA_CAMBIO_API_KEY) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await request.json();
  const { fecha, usd_nio, eur_nio, fuente } = body;

  if (!fecha || !usd_nio || !eur_nio) {
    return NextResponse.json({ error: "Faltan campos: fecha, usd_nio, eur_nio" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const [{ data: empresasPN }, { data: empresasEJ }] = await Promise.all([
    supabase.from("empresas_persona_natural").select("id"),
    supabase.from("empresas_juridicas").select("id"),
  ]);

  const empresaIds = [
    ...(empresasPN ?? []).map(e => e.id),
    ...(empresasEJ ?? []).map(e => e.id),
  ];

  if (!empresaIds.length) {
    return NextResponse.json({ ok: true, actualizadas: 0 });
  }

  const filas = empresaIds.map(empresa_id => ({
    empresa_id,
    fecha,
    tasa: Number(usd_nio),
    tasa_eur: Number(eur_nio),
    fuente: fuente || "automatico",
  }));

  const { error } = await supabase
    .from("tasa_cambio")
    .upsert(filas, { onConflict: "empresa_id,fecha" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, actualizadas: filas.length });
}

// GET: última tasa registrada (para el nodo "Leer Ultima Tasa" del webhook de conversión en n8n)
export async function GET(request: NextRequest) {
  const apiKey = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!apiKey || apiKey !== process.env.N8N_TASA_CAMBIO_API_KEY) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const empresaId = searchParams.get("empresa_id");
  if (!empresaId) {
    return NextResponse.json({ error: "Falta empresa_id" }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("tasa_cambio")
    .select("fecha, tasa, tasa_eur, fuente")
    .eq("empresa_id", empresaId)
    .order("fecha", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "No hay tasas registradas" }, { status: 404 });

  return NextResponse.json({
    fecha: data.fecha,
    usd_nio: data.tasa,
    eur_nio: data.tasa_eur,
    fuente: data.fuente,
  });
}
