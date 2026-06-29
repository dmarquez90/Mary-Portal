import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tipo  = searchParams.get("tipo");   // ingresos | compras | credito | retenciones
  const mes   = parseInt(searchParams.get("mes")  ?? "0");
  const anio  = parseInt(searchParams.get("anio") ?? "0");

  if (!tipo || !mes || !anio) {
    return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  // Obtener empresa
  const [{ data: en }, { data: ej }] = await Promise.all([
    supabase.from("empresas_persona_natural").select("*").eq("user_id", user.id).single(),
    supabase.from("empresas_juridicas").select("*").eq("user_id", user.id).single(),
  ]);

  const empresa = en ? {
    nombre: en.nombre_completo,
    ruc:    en.numero_ruc,
    tipo:   en.tipo_empresa,
  } : ej ? {
    nombre: ej.nombre_empresa,
    ruc:    ej.numero_ruc,
    tipo:   "juridica",
  } : { nombre: "", ruc: "", tipo: "" };

  const ids = [en?.id, ej?.id].filter(Boolean) as string[];
  if (!ids.length) return NextResponse.json({ error: "No hay empresa" }, { status: 400 });

  // Rango de fechas del mes
  const firstDay = `${anio}-${String(mes).padStart(2,"0")}-01`;
  const lastDay  = new Date(anio, mes, 0).toISOString().split("T")[0];

  // ── Obtener datos según tipo ──
  if (tipo === "ingresos" || tipo === "ventas" || tipo === "libro_ventas") {
    const { data: facturas } = await supabase
      .from("facturas")
      .select("*, cliente:clientes(nombre, ruc, cedula)")
      .in("empresa_id", ids)
      .gte("fecha_emision", firstDay)
      .lte("fecha_emision", lastDay)
      .in("estado", ["emitida", "pagada"])
      .order("fecha_emision");

    const ventas = (facturas ?? []).map((f) => ({
      numero_factura: f.numero_factura,
      fecha_emision:  f.fecha_emision,
      cliente_nombre: (f.cliente as { nombre?: string } | null)?.nombre ?? f.cliente_nombre ?? "Consumidor final",
      cliente_ruc:    (f.cliente as { ruc?: string; cedula?: string } | null)?.ruc ??
                      (f.cliente as { ruc?: string; cedula?: string } | null)?.cedula ?? "",
      subtotal:       Number(f.subtotal),
      iva_total:      Number(f.iva_total),
      total:          Number(f.total),
    }));

    return NextResponse.json({ ventas, empresa, mes, anio });
  }

  if (tipo === "compras" || tipo === "credito" || tipo === "retenciones" || tipo === "libro_compras") {
    const { data: comprasData } = await supabase
      .from("compras")
      .select("*, proveedor:proveedores(nombre, ruc, tipo_persona)")
      .in("empresa_id", ids)
      .gte("fecha_compra", firstDay)
      .lte("fecha_compra", lastDay)
      .eq("estado", "recibida")
      .order("fecha_compra");

    const compras = (comprasData ?? []).map((c) => ({
      numero_compra:            c.numero_compra,
      numero_factura_proveedor: c.numero_factura_proveedor ?? null,
      fecha_compra:             c.fecha_compra,
      proveedor_nombre:         (c.proveedor as { nombre?: string } | null)?.nombre ?? "",
      proveedor_ruc:            (c.proveedor as { ruc?: string } | null)?.ruc ?? "",
      subtotal:                 Number(c.subtotal),
      iva_total:                Number(c.iva_total),
      total:                    Number(c.total),
      tipo_proveedor:           (c.proveedor as { tipo_persona?: string } | null)?.tipo_persona ?? "juridica",
    }));

    return NextResponse.json({ compras, empresa, mes, anio });
  }

  return NextResponse.json({ error: "Tipo no válido" }, { status: 400 });
}
