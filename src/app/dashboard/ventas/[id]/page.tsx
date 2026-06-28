"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Printer, FileX, Check, Package, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/utils";
import { toast } from "sonner";

// ── Tipos ─────────────────────────────────────────────────────
interface DetalleFactura {
  id: string;
  producto_id?: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  descuento_pct: number;
  subtotal: number;
  iva: number;
  total: number;
}

interface Factura {
  id: string;
  numero_factura: string;
  fecha_emision: string;
  fecha_vencimiento?: string;
  tipo_pago: string;
  estado: string;
  subtotal: number;
  descuento_total: number;
  iva_total: number;
  total: number;
  notas?: string;
  cliente_id?: string;
  cliente_nombre?: string;
  cliente?: { nombre: string; ruc?: string; cedula?: string; direccion?: string; telefono?: string } | null;
  detalles?: DetalleFactura[];
}

interface Empresa {
  nombre: string; ruc: string; direccion: string;
  telefono?: string; correo: string; sitio_web?: string;
}

// Item en el modal de anulación con cuánto se devuelve
interface ItemAnulacion extends DetalleFactura {
  cant_devolver: number;
  seleccionado: boolean;
}

const BADGE: Record<string, string> = {
  emitida: "badge-info", pagada: "badge-success",
  borrador: "badge-gray", anulada: "badge-danger",
};
const fmt = (n: number) => new Intl.NumberFormat("es-NI", { style: "currency", currency: "NIO" }).format(n ?? 0);

// ── Componente ────────────────────────────────────────────────
export default function FacturaDetallePage() {
  const params = useParams();
  const router = useRouter();

  const [factura,   setFactura]   = useState<Factura | null>(null);
  const [empresa,   setEmpresa]   = useState<Empresa | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [procesando,setProcesando]= useState(false);

  // ── Modal anulación ───────────────────────────────────────
  const [showAnular,  setShowAnular]  = useState(false);
  const [modoAnular,  setModoAnular]  = useState<"total" | "parcial">("total");
  const [items,       setItems]       = useState<ItemAnulacion[]>([]);
  const [motivo,      setMotivo]      = useState("");

  useEffect(() => {
    async function load() {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [{ data: en }, { data: ej }] = await Promise.all([
        supabase.from("empresas_persona_natural").select("nombre_completo,numero_ruc,direccion,telefono,correo_electronico,sitio_web").eq("user_id", user.id).maybeSingle(),
        supabase.from("empresas_juridicas").select("nombre_empresa,numero_ruc,direccion_legal,correo_electronico,sitio_web").eq("user_id", user.id).maybeSingle(),
      ]);
      if (en) setEmpresa({ nombre: en.nombre_completo, ruc: en.numero_ruc, direccion: en.direccion, telefono: en.telefono, correo: en.correo_electronico, sitio_web: en.sitio_web });
      if (ej) setEmpresa({ nombre: ej.nombre_empresa, ruc: ej.numero_ruc, direccion: ej.direccion_legal, correo: ej.correo_electronico, sitio_web: ej.sitio_web });

      const { data: fac } = await supabase
        .from("facturas")
        .select("*, cliente:clientes(nombre,ruc,cedula,direccion,telefono), detalles:detalle_facturas(*)")
        .eq("id", params.id as string)
        .single();

      if (fac) setFactura(fac as unknown as Factura);
      setLoading(false);
    }
    load();
  }, [params.id]);

  // Cuando abre el modal, pre-cargar ítems
  function abrirModalAnular() {
    const detalles = factura?.detalles ?? [];
    setItems(detalles.map(d => ({ ...d, cant_devolver: d.cantidad, seleccionado: true })));
    setModoAnular(detalles.length > 0 ? "total" : "total");
    setMotivo("");
    setShowAnular(true);
  }

  function toggleItem(idx: number) {
    setItems(prev => prev.map((it, i) => i === idx
      ? { ...it, seleccionado: !it.seleccionado, cant_devolver: !it.seleccionado ? it.cantidad : 0 }
      : it
    ));
  }

  function setCantDevolver(idx: number, val: number) {
    setItems(prev => prev.map((it, i) => i === idx
      ? { ...it, cant_devolver: Math.min(val, it.cantidad), seleccionado: val > 0 }
      : it
    ));
  }

  // Ítems que efectivamente se van a devolver
  const itemsSeleccionados = items.filter(it => it.seleccionado && it.cant_devolver > 0);

  const calcItem = (it: ItemAnulacion) => {
    const pct = it.cant_devolver / it.cantidad;
    const sub = Math.round(it.subtotal * pct * 100) / 100;
    const iva = Math.round(it.iva      * pct * 100) / 100;
    return { sub, iva, total: sub + iva };
  };

  const subtotalNC = itemsSeleccionados.reduce((s, it) => s + calcItem(it).sub, 0);
  const ivaNC      = itemsSeleccionados.reduce((s, it) => s + calcItem(it).iva, 0);
  const totalNC    = subtotalNC + ivaNC;

  // Detecta si la anulación es parcial (no todos los ítems / no cantidad completa)
  const esAnulacionTotal = items.length > 0 &&
    items.every(it => it.seleccionado && it.cant_devolver === it.cantidad);

  async function handleConfirmarAnulacion() {
    if (!factura) return;
    if (!motivo.trim()) { toast.error("Ingresa el motivo de la anulación."); return; }
    if (itemsSeleccionados.length === 0) { toast.error("Selecciona al menos un ítem."); return; }

    setProcesando(true);
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();

    // ── 1. Generar Nota de Crédito vía API ───────────────────
    const detallesNC = itemsSeleccionados.map(it => {
      const { sub, iva, total } = calcItem(it);
      return {
        producto_id:     it.producto_id ?? null,
        descripcion:     it.descripcion,
        cantidad:        it.cant_devolver,
        precio_unitario: it.precio_unitario,
        subtotal:        sub,
        iva,
        total,
      };
    });

    const ncPayload = {
      empresa_id:    factura.id ? undefined : "",   // se resolverá abajo
      tipo:          "credito",
      ref_factura_id: factura.id,
      cliente_id:    factura.cliente_id ?? null,
      fecha:         new Date().toISOString().split("T")[0],
      motivo:        motivo.trim(),
      estado:        "aplicada",
      detalles:      detallesNC,
    };

    // Obtener empresa_id desde la factura
    const { data: facDB } = await supabase
      .from("facturas").select("empresa_id").eq("id", factura.id).single();
    const empresaId = facDB?.empresa_id;
    if (!empresaId) { toast.error("No se pudo obtener la empresa."); setProcesando(false); return; }

    const r = await fetch("/api/notas-credito-debito", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...ncPayload, empresa_id: empresaId }),
    });

    if (!r.ok) {
      const err = await r.json();
      toast.error("Error al crear la nota de crédito: " + err.error);
      setProcesando(false);
      return;
    }
    const nc = await r.json();

    // ── 2. Restaurar stock para ítems devueltos (trigger lo hará
    //       cuando anulemos, pero para NC parcial lo hacemos manual) ──
    for (const it of itemsSeleccionados) {
      if (!it.producto_id || it.cant_devolver <= 0) continue;
      const { data: prod } = await supabase
        .from("productos").select("stock_actual, empresa_id").eq("id", it.producto_id).single();
      if (!prod) continue;
      await supabase.from("productos")
        .update({ stock_actual: Number(prod.stock_actual) + Number(it.cant_devolver), updated_at: new Date().toISOString() })
        .eq("id", it.producto_id);
      // Registrar movimiento de entrada (devolución)
      await supabase.from("movimientos_inventario").insert({
        empresa_id:  prod.empresa_id,
        producto_id: it.producto_id,
        tipo:        "entrada",
        cantidad:    it.cant_devolver,
        stock_antes: Number(prod.stock_actual),
        stock_despues: Number(prod.stock_actual) + Number(it.cant_devolver),
        costo_unitario: it.precio_unitario,
        referencia:  nc.numero_nota,
        notas:       `Devolución NC ${nc.numero_nota} — Factura ${factura.numero_factura}`,
      });
    }

    // ── 3. Si es anulación total → marcar factura como anulada ──
    if (esAnulacionTotal) {
      await supabase.from("facturas")
        .update({ estado: "anulada", notas: (factura.notas ? factura.notas + " | " : "") + `Anulada con ${nc.numero_nota}` })
        .eq("id", factura.id);
      toast.success(`Factura anulada. Nota de Crédito ${nc.numero_nota} generada.`);
      router.push("/dashboard/ventas");
    } else {
      // Anulación parcial → factura sigue emitida pero con NC parcial
      // Actualizar totales de la factura (restar lo devuelto)
      const nuevoSubtotal = Number(factura.subtotal) - subtotalNC;
      const nuevoIva      = Number(factura.iva_total) - ivaNC;
      const nuevoTotal    = nuevoSubtotal + nuevoIva;
      await supabase.from("facturas")
        .update({
          subtotal:  nuevoSubtotal,
          iva_total: nuevoIva,
          total:     nuevoTotal,
          notas:     (factura.notas ? factura.notas + " | " : "") + `NC parcial ${nc.numero_nota}`,
        })
        .eq("id", factura.id);
      toast.success(`Nota de Crédito parcial ${nc.numero_nota} generada por ${fmt(totalNC)}.`);
      setShowAnular(false);
      // Recargar factura actualizada
      const { data: fac } = await supabase
        .from("facturas")
        .select("*, cliente:clientes(nombre,ruc,cedula,direccion,telefono), detalles:detalle_facturas(*)")
        .eq("id", factura.id).single();
      if (fac) setFactura(fac as unknown as Factura);
    }
    setProcesando(false);
  }

  // ── Impresión A4 ──────────────────────────────────────────
  function handlePrint() {
    if (!factura || !empresa) return;
    const nombreCliente = factura.cliente?.nombre ?? factura.cliente_nombre ?? "Consumidor final";
    const filas = (factura.detalles ?? []).map((d, i) => `
      <tr style="background:${i % 2 === 0 ? "#f8fafc" : "#fff"}">
        <td style="padding:8px 12px;font-size:13px">${d.descripcion}</td>
        <td style="padding:8px 12px;font-size:13px;text-align:center">${d.cantidad}</td>
        <td style="padding:8px 12px;font-size:13px;text-align:right">${formatCurrency(d.precio_unitario)}</td>
        <td style="padding:8px 12px;font-size:13px;text-align:right">${d.descuento_pct > 0 ? d.descuento_pct + "%" : "—"}</td>
        <td style="padding:8px 12px;font-size:13px;text-align:right">${formatCurrency(d.iva)}</td>
        <td style="padding:8px 12px;font-size:13px;text-align:right;font-weight:700">${formatCurrency(d.total)}</td>
      </tr>`).join("");

    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"/><title>Factura ${factura.numero_factura}</title>
    <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;color:#1e293b;padding:32px}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px}
    .emp{font-size:22px;font-weight:800;color:#1e3a8a;margin-bottom:4px}.info{font-size:12px;color:#64748b;line-height:1.6}
    .num{font-size:28px;font-weight:800;color:#1d4ed8;text-align:right}.meta{font-size:12px;color:#64748b;text-align:right;line-height:1.8;margin-top:4px}
    hr{border:none;border-top:2.5px solid #1e3a8a;margin:20px 0}
    table{width:100%;border-collapse:collapse;margin:20px 0}thead tr{background:#1e3a8a}
    thead th{padding:9px 12px;font-size:11px;font-weight:600;color:#fff;text-align:left}
    thead th:not(:first-child){text-align:right}thead th:nth-child(2){text-align:center}
    .tot{display:flex;justify-content:flex-end;margin-top:8px}.tb{width:260px}
    .tr{display:flex;justify-content:space-between;font-size:13px;color:#475569;padding:4px 0}
    .tf{display:flex;justify-content:space-between;font-size:17px;font-weight:800;color:#1e3a8a;border-top:2.5px solid #1e3a8a;padding-top:8px;margin-top:4px}
    .pie{margin-top:32px;text-align:center;font-size:10px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:12px}
    @page{size:A4;margin:1.5cm}</style></head><body>
    <div class="header"><div><div class="emp">${empresa.nombre}</div>
    <div class="info">RUC: ${empresa.ruc}<br/>${empresa.direccion}<br/>${empresa.correo}${empresa.sitio_web ? "<br/>" + empresa.sitio_web : ""}</div></div>
    <div><div class="num">${factura.numero_factura}</div>
    <div class="meta">Fecha: ${formatDate(factura.fecha_emision)}<br/>Pago: ${factura.tipo_pago}</div></div></div>
    <hr/><div style="margin-bottom:20px"><p style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase">Facturar a</p>
    <p style="font-size:16px;font-weight:700">${nombreCliente}</p>
    ${factura.cliente?.ruc ? "<p style='font-size:12px;color:#64748b'>RUC: " + factura.cliente.ruc + "</p>" : ""}
    ${factura.cliente?.telefono ? "<p style='font-size:12px;color:#64748b'>Tel: " + factura.cliente.telefono + "</p>" : ""}</div>
    <table><thead><tr><th>Descripción</th><th style="text-align:center">Cant.</th><th>Precio</th><th>Desc.%</th><th>IVA</th><th>Total</th></tr></thead>
    <tbody>${filas}</tbody></table>
    <div class="tot"><div class="tb">
    <div class="tr"><span>Subtotal</span><span>${formatCurrency(factura.subtotal)}</span></div>
    ${Number(factura.descuento_total) > 0 ? `<div class="tr" style="color:#dc2626"><span>Descuento</span><span>- ${formatCurrency(factura.descuento_total)}</span></div>` : ""}
    <div class="tr"><span>IVA (15%)</span><span>${formatCurrency(factura.iva_total)}</span></div>
    <div class="tf"><span>TOTAL</span><span>${formatCurrency(factura.total)}</span></div></div></div>
    ${factura.notas ? `<div style="margin-top:20px;padding-top:16px;border-top:1px solid #e2e8f0"><p style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase">Notas</p><p style="font-size:12px;color:#475569;margin-top:4px">${factura.notas}</p></div>` : ""}
    <div class="pie">Documento generado por sara-app<br/>Nicaragua · RUC: ${empresa.ruc} · ${empresa.correo}</div>
    <script>window.onload=function(){window.print();window.onafterprint=function(){window.close();}}</script>
    </body></html>`;
    const w = window.open("", "_blank", "width=900,height=700");
    if (w) { w.document.write(html); w.document.close(); }
  }

  function handlePrintTicket(ancho: 58 | 80 = 80) {
    if (!factura || !empresa) return;
    const nombreCliente = factura.cliente?.nombre ?? factura.cliente_nombre ?? "Consumidor final";
    const anchoMM = ancho === 58 ? "56mm" : "78mm";
    const cw = ancho === 58 ? 28 : 38;
    const sep = (c = "-") => `<div style="text-align:center;font-size:11px;margin:3px 0">${c.repeat(cw)}</div>`;
    const items2 = (factura.detalles ?? []).map(d => {
      const desc = d.descripcion.length > cw ? d.descripcion.slice(0, cw - 2) + ".." : d.descripcion;
      return `<div style="font-size:12px;font-weight:bold;margin-top:3px">${desc}</div>
      <div style="display:flex;justify-content:space-between;font-size:12px;padding-left:8px">
        <span>${d.cantidad} x ${formatCurrency(d.precio_unitario)}</span><span><b>${formatCurrency(d.total)}</b></span></div>
      ${d.iva > 0 ? `<div style="font-size:10px;color:#444;padding-left:8px">IVA: ${formatCurrency(d.iva)}</div>` : ""}`;
    }).join(sep("·"));
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Ticket</title>
    <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:12px;width:${anchoMM};margin:0 auto;padding:4px 3px}
    @page{size:${ancho}mm auto;margin:2mm 3mm}</style></head><body>
    <div style="text-align:center;font-size:16px;font-weight:bold">${empresa.nombre}</div>
    <div style="text-align:center;font-size:12px">RUC: ${empresa.ruc}</div>
    ${sep("=")}
    <div style="text-align:center;font-size:16px;font-weight:bold">${factura.numero_factura}</div>
    <div style="text-align:center">${formatDate(factura.fecha_emision)} · ${factura.tipo_pago}</div>
    ${sep("=")}
    <div style="font-size:10px;font-weight:bold">CLIENTE</div>
    <div style="font-weight:bold">${nombreCliente}</div>
    ${sep()}
    <div style="display:flex;justify-content:space-between;font-weight:bold"><span>DESCRIPCION</span><span>TOTAL</span></div>
    ${sep()}${items2}${sep("=")}
    <div style="display:flex;justify-content:space-between"><span>Subtotal:</span><span>${formatCurrency(factura.subtotal)}</span></div>
    <div style="display:flex;justify-content:space-between"><span>IVA (15%):</span><span>${formatCurrency(factura.iva_total)}</span></div>
    ${sep("=")}
    <div style="font-size:18px;font-weight:bold;text-align:center">TOTAL: ${formatCurrency(factura.total)}</div>
    ${sep("=")}
    <div style="text-align:center;font-size:10px">¡Gracias por su compra!</div>
    <div style="text-align:center;font-size:10px">Generado por SARA · Nicaragua</div>
    <script>window.onload=function(){window.print();window.onafterprint=function(){window.close();}}</script>
    </body></html>`;
    const w = window.open("", "_blank", "width=420,height=700");
    if (w) { w.document.write(html); w.document.close(); }
  }

  // ── Render ────────────────────────────────────────────────
  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-700 rounded-full animate-spin" />
    </div>
  );

  if (!factura) return (
    <div className="text-center py-20 text-slate-500">
      <p className="text-lg font-medium">Factura no encontrada</p>
      <Link href="/dashboard/ventas" className="btn-primary inline-flex mt-4">Volver a ventas</Link>
    </div>
  );

  const nombreCliente = factura.cliente?.nombre ?? factura.cliente_nombre ?? "Consumidor final";
  const tieneDetalles = (factura.detalles?.length ?? 0) > 0;

  return (
    <>
      {/* Barra de acciones */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/ventas" className="btn-ghost p-2"><ArrowLeft className="w-5 h-5" /></Link>
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900">{factura.numero_factura}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className={BADGE[factura.estado] ?? "badge-gray"}>
                {factura.estado.charAt(0).toUpperCase() + factura.estado.slice(1)}
              </span>
              <span className="text-slate-400 text-sm">{formatDate(factura.fecha_emision)}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {factura.estado === "emitida" && (
            <button onClick={abrirModalAnular}
              className="btn-ghost text-red-500 hover:text-red-700 flex items-center gap-2 text-sm">
              <FileX className="w-4 h-4" /> Anular / NC
            </button>
          )}
          <button onClick={() => handlePrintTicket(58)} className="btn-secondary flex items-center gap-2 text-sm">
            <Printer className="w-4 h-4" /> Ticket 58mm
          </button>
          <button onClick={() => handlePrintTicket(80)} className="btn-secondary flex items-center gap-2 text-sm">
            <Printer className="w-4 h-4" /> Ticket 80mm
          </button>
          <button onClick={handlePrint} className="btn-primary flex items-center gap-2">
            <Printer className="w-4 h-4" /> Factura A4
          </button>
        </div>
      </div>

      {/* Vista previa de factura */}
      <div className="bg-white rounded-xl border border-slate-200 p-8 max-w-3xl mx-auto">
        <div className="flex justify-between items-start mb-8">
          <div>
            <h2 className="font-display text-2xl font-bold text-brand-800">{empresa?.nombre ?? "Mi Empresa"}</h2>
            {empresa?.ruc       && <p className="text-slate-500 text-sm mt-0.5">RUC: {empresa.ruc}</p>}
            {empresa?.direccion && <p className="text-slate-500 text-sm">{empresa.direccion}</p>}
            {empresa?.correo    && <p className="text-slate-500 text-sm">{empresa.correo}</p>}
            {empresa?.sitio_web && <p className="text-slate-500 text-sm">{empresa.sitio_web}</p>}
          </div>
          <div className="text-right">
            <p className="font-display text-3xl font-bold text-brand-700">{factura.numero_factura}</p>
            <p className="text-slate-500 text-sm mt-1">Fecha: {formatDate(factura.fecha_emision)}</p>
            {factura.fecha_vencimiento && <p className="text-slate-500 text-sm">Vence: {formatDate(factura.fecha_vencimiento)}</p>}
            <p className="text-slate-500 text-sm capitalize">Pago: {factura.tipo_pago}</p>
          </div>
        </div>

        <div className="border-t-2 border-brand-800 mb-6" />

        <div className="mb-8">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Facturar a</p>
          <p className="font-semibold text-slate-900 text-lg">{nombreCliente}</p>
          {factura.cliente?.ruc       && <p className="text-slate-500 text-sm">RUC: {factura.cliente.ruc}</p>}
          {factura.cliente?.cedula    && <p className="text-slate-500 text-sm">Cédula: {factura.cliente.cedula}</p>}
          {factura.cliente?.direccion && <p className="text-slate-500 text-sm">{factura.cliente.direccion}</p>}
          {factura.cliente?.telefono  && <p className="text-slate-500 text-sm">Tel: {factura.cliente.telefono}</p>}
        </div>

        <table className="w-full mb-8">
          <thead>
            <tr className="bg-brand-800 text-white">
              <th className="text-left px-3 py-2 text-xs font-semibold">Descripción</th>
              <th className="text-center px-3 py-2 text-xs font-semibold">Cant.</th>
              <th className="text-right px-3 py-2 text-xs font-semibold">Precio</th>
              <th className="text-right px-3 py-2 text-xs font-semibold">Desc.%</th>
              <th className="text-right px-3 py-2 text-xs font-semibold">IVA</th>
              <th className="text-right px-3 py-2 text-xs font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {factura.detalles?.map((d, i) => (
              <tr key={d.id} className={i % 2 === 0 ? "bg-slate-50" : "bg-white"}>
                <td className="px-3 py-2 text-sm text-slate-800">{d.descripcion}</td>
                <td className="px-3 py-2 text-sm text-center text-slate-600">{d.cantidad}</td>
                <td className="px-3 py-2 text-sm text-right text-slate-600">{formatCurrency(d.precio_unitario)}</td>
                <td className="px-3 py-2 text-sm text-right text-slate-600">{d.descuento_pct > 0 ? `${d.descuento_pct}%` : "—"}</td>
                <td className="px-3 py-2 text-sm text-right text-slate-600">{formatCurrency(d.iva)}</td>
                <td className="px-3 py-2 text-sm text-right font-semibold text-slate-900">{formatCurrency(d.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-end mb-8">
          <div className="w-64 space-y-1.5">
            <div className="flex justify-between text-sm text-slate-600"><span>Subtotal</span><span>{formatCurrency(factura.subtotal)}</span></div>
            {Number(factura.descuento_total) > 0 && (
              <div className="flex justify-between text-sm text-red-600"><span>Descuento</span><span>- {formatCurrency(factura.descuento_total)}</span></div>
            )}
            <div className="flex justify-between text-sm text-slate-600"><span>IVA (15%)</span><span>{formatCurrency(factura.iva_total)}</span></div>
            <div className="border-t-2 border-brand-800 pt-2 flex justify-between font-bold text-lg text-brand-800">
              <span>TOTAL</span><span>{formatCurrency(factura.total)}</span>
            </div>
          </div>
        </div>

        {factura.notas && (
          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Notas</p>
            <p className="text-slate-600 text-sm">{factura.notas}</p>
          </div>
        )}
        <div className="border-t border-slate-100 mt-6 pt-4 text-center text-xs text-slate-400">
          <p>Documento generado por sara-app</p>
          <p className="mt-0.5">Nicaragua · RUC: {empresa?.ruc} · {empresa?.correo}</p>
        </div>
      </div>

      {/* ── MODAL ANULACIÓN / NOTA DE CRÉDITO ─────────────── */}
      {showAnular && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">

            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="font-display text-lg font-bold text-slate-900 flex items-center gap-2">
                <FileX className="w-5 h-5 text-red-500" />
                Anular / Nota de Crédito — {factura.numero_factura}
              </h3>
              <p className="text-slate-400 text-xs mt-0.5">
                Se generará automáticamente una Nota de Crédito (NC) registrada en el módulo de Notas Crédito/Débito
              </p>
            </div>

            {/* Modo: total vs parcial (solo si tiene detalles) */}
            {tieneDetalles && (
              <div className="px-6 pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setModoAnular("total");
                    setItems(prev => prev.map(it => ({ ...it, seleccionado: true, cant_devolver: it.cantidad })));
                  }}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium border-2 transition-colors ${
                    modoAnular === "total"
                      ? "border-red-500 bg-red-50 text-red-700"
                      : "border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  🚫 Anulación total
                  <p className="text-xs font-normal mt-0.5 opacity-70">Devuelve todos los ítems</p>
                </button>
                <button
                  type="button"
                  onClick={() => setModoAnular("parcial")}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-medium border-2 transition-colors ${
                    modoAnular === "parcial"
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  ↩️ Devolución parcial
                  <p className="text-xs font-normal mt-0.5 opacity-70">Elige ítems y cantidades</p>
                </button>
              </div>
            )}

            {/* Cuerpo scrolleable */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

              {/* Selector de ítems */}
              {tieneDetalles ? (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  {/* Cabecera tabla */}
                  <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500">
                    <div className="col-span-1"></div>
                    <div className="col-span-5">Producto</div>
                    <div className="col-span-2 text-right">Cant. orig.</div>
                    <div className="col-span-2 text-center">
                      {modoAnular === "parcial" ? "A devolver" : "Devolver"}
                    </div>
                    <div className="col-span-2 text-right">Monto NC</div>
                  </div>

                  {items.map((it, idx) => {
                    const { sub } = calcItem(it);
                    return (
                      <div key={it.id}
                        className={`grid grid-cols-12 gap-2 px-3 py-2.5 items-center border-b border-slate-100 last:border-0 ${
                          it.seleccionado ? "bg-white" : "bg-slate-50 opacity-60"
                        }`}>
                        <div className="col-span-1">
                          <button type="button" onClick={() => toggleItem(idx)}
                            className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                              it.seleccionado ? "bg-blue-600 border-blue-600" : "border-slate-300"
                            }`}>
                            {it.seleccionado && <Check className="w-3 h-3 text-white" />}
                          </button>
                        </div>
                        <div className="col-span-5">
                          <p className="text-sm font-medium text-slate-800 leading-tight">{it.descripcion}</p>
                          <p className="text-xs text-slate-400">{fmt(it.precio_unitario)} c/u</p>
                        </div>
                        <div className="col-span-2 text-right text-sm text-slate-500">{it.cantidad}</div>
                        <div className="col-span-2 flex justify-center">
                          {modoAnular === "parcial" ? (
                            <input
                              type="number" min={0} max={it.cantidad} step={1}
                              value={it.cant_devolver}
                              onChange={e => setCantDevolver(idx, parseFloat(e.target.value) || 0)}
                              disabled={!it.seleccionado}
                              className={`w-16 text-center border rounded-lg px-2 py-1 text-sm ${
                                it.seleccionado ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-slate-50"
                              }`}
                            />
                          ) : (
                            <span className="text-sm font-medium text-slate-700">{it.cantidad}</span>
                          )}
                        </div>
                        <div className="col-span-2 text-right text-sm font-medium text-slate-700">
                          {it.seleccionado && it.cant_devolver > 0 ? fmt(sub) : "—"}
                        </div>
                      </div>
                    );
                  })}

                  {/* Totales NC */}
                  {itemsSeleccionados.length > 0 && (
                    <div className="bg-blue-50 border-t border-blue-200 px-3 py-3 space-y-1">
                      <div className="flex justify-between text-xs text-blue-700">
                        <span>Subtotal NC ({itemsSeleccionados.length} ítem{itemsSeleccionados.length !== 1 ? "s" : ""})</span>
                        <span>{fmt(subtotalNC)}</span>
                      </div>
                      <div className="flex justify-between text-xs text-blue-700">
                        <span>IVA 15%</span><span>{fmt(ivaNC)}</span>
                      </div>
                      <div className="flex justify-between text-sm font-bold text-blue-900 border-t border-blue-200 pt-1 mt-1">
                        <span>Total Nota de Crédito</span><span>{fmt(totalNC)}</span>
                      </div>
                    </div>
                  )}

                  {itemsSeleccionados.length === 0 && (
                    <div className="px-3 py-4 text-center text-sm text-slate-400">
                      <Package className="w-6 h-6 mx-auto mb-1 opacity-30" />
                      Selecciona al menos un ítem para continuar
                    </div>
                  )}
                </div>
              ) : (
                /* Sin detalles: aviso */
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-800">Esta factura no tiene ítems detallados</p>
                    <p className="text-xs text-amber-700 mt-1">
                      La NC se generará por el total de la factura ({fmt(factura.total)}).
                      Para devoluciones parciales, los ítems deben estar registrados en la factura.
                    </p>
                  </div>
                </div>
              )}

              {/* Aviso tipo de operación */}
              {esAnulacionTotal || !tieneDetalles ? (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700 flex gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  <span>La factura quedará en estado <strong>Anulada</strong> y el stock se restaurará completamente.</span>
                </div>
              ) : (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700 flex gap-2">
                  <Check className="w-4 h-4 flex-shrink-0" />
                  <span>Devolución parcial — la factura <strong>permanece emitida</strong> y se ajustan sus totales. Solo se restaura el stock de los ítems devueltos.</span>
                </div>
              )}

              {/* Motivo */}
              <div>
                <label className="label text-sm">Motivo <span className="text-red-500">*</span></label>
                <input
                  className="input"
                  placeholder="Ej: Producto defectuoso, error en pedido, devolución cliente..."
                  value={motivo}
                  onChange={e => setMotivo(e.target.value)}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
              <button
                type="button"
                disabled={procesando}
                onClick={handleConfirmarAnulacion}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors ${
                  esAnulacionTotal || !tieneDetalles
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-blue-600 hover:bg-blue-700"
                } disabled:opacity-50 flex items-center justify-center gap-2`}
              >
                {procesando
                  ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Procesando...</>
                  : esAnulacionTotal || !tieneDetalles
                    ? `Anular y generar NC por ${fmt(totalNC || factura.total)}`
                    : `Generar NC parcial por ${fmt(totalNC)}`
                }
              </button>
              <button
                type="button"
                onClick={() => setShowAnular(false)}
                disabled={procesando}
                className="px-5 btn-secondary"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
