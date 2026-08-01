"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Printer, Trash2 } from "lucide-react";
import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/utils";
import { toast } from "sonner";

interface DetalleCompra {
  id: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  iva: number;
  total: number;
}

interface Compra {
  id: string;
  numero_compra: string;
  fecha_compra: string;
  fecha_vencimiento?: string;
  tipo_pago: string;
  estado: string;
  subtotal: number;
  iva_total: number;
  total: number;
  notas?: string;
  proveedor?: { nombre: string; ruc?: string; direccion?: string; telefono?: string; correo?: string } | null;
  detalles?: DetalleCompra[];
}

interface Empresa {
  nombre: string;
  ruc: string;
  direccion: string;
  correo: string;
  sitio_web?: string;
}

const BADGE: Record<string, string> = {
  recibida: "badge-info", pagada: "badge-success", borrador: "badge-gray", anulada: "badge-danger",
};

export default function CompraDetallePage() {
  const params = useParams();
  const router = useRouter();

  const [compra,     setCompra]     = useState<Compra | null>(null);
  const [empresa,    setEmpresa]    = useState<Empresa | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => {
    async function load() {
      const { createClient } = await import("@/lib/supabase/client");
      const { getEmpresaIdActual } = await import("@/lib/supabase/empresa-actual");
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const empresaIdActual = await getEmpresaIdActual(supabase, user.id);
      const [{ data: en }, { data: ej }] = empresaIdActual ? await Promise.all([
        supabase.from("empresas_persona_natural").select("nombre_completo, numero_ruc, direccion, correo_electronico, sitio_web").eq("id", empresaIdActual).maybeSingle(),
        supabase.from("empresas_juridicas").select("nombre_empresa, numero_ruc, direccion_legal, correo_electronico, sitio_web").eq("id", empresaIdActual).maybeSingle(),
      ]) : [{ data: null }, { data: null }];

      if (en) setEmpresa({ nombre: en.nombre_completo, ruc: en.numero_ruc, direccion: en.direccion, correo: en.correo_electronico, sitio_web: en.sitio_web });
      if (ej) setEmpresa({ nombre: ej.nombre_empresa, ruc: ej.numero_ruc, direccion: ej.direccion_legal, correo: ej.correo_electronico, sitio_web: ej.sitio_web });

      const { data } = await supabase
        .from("compras")
        .select("*, proveedor:proveedores(nombre, ruc, direccion, telefono, correo), detalles:detalle_compras(*)")
        .eq("id", params.id as string)
        .single();

      if (data) setCompra(data as unknown as Compra);
      setLoading(false);
    }
    load();
  }, [params.id]);

  async function handleAnular() {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();

    // Si estaba recibida, revertir stock
    if (compra?.estado === "recibida") {
      const { data: detalles } = await supabase
        .from("detalle_compras").select("producto_id, cantidad")
        .eq("compra_id", compra.id);

      for (const d of detalles ?? []) {
        if (!d.producto_id) continue;
        const { data: prod } = await supabase.from("productos").select("stock_actual").eq("id", d.producto_id).single();
        const stockNuevo = Math.max(0, Number(prod?.stock_actual ?? 0) - Number(d.cantidad));
        await supabase.from("productos").update({ stock_actual: stockNuevo }).eq("id", d.producto_id);
        await supabase.from("lotes_inventario").delete().eq("compra_id", compra.id).eq("producto_id", d.producto_id);
      }
    }

    await supabase.from("compras").update({ estado: "anulada" }).eq("id", compra!.id);
    toast.success("Compra anulada" + (compra?.estado === "recibida" ? " — stock revertido" : ""));
    setConfirmDel(false);
    router.push("/dashboard/compras");
  }

  // ── Impresión A4 ──────────────────────────────────────────────────────────
  function handlePrint() {
    if (!compra || !empresa) return;

    const filas = (compra.detalles ?? []).map((d, i) => `
      <tr style="background:${i % 2 === 0 ? "#f8fafc" : "#fff"}">
        <td style="padding:8px 12px;font-size:13px">${d.descripcion}</td>
        <td style="padding:8px 12px;font-size:13px;text-align:center">${d.cantidad}</td>
        <td style="padding:8px 12px;font-size:13px;text-align:right">${formatCurrency(d.precio_unitario)}</td>
        <td style="padding:8px 12px;font-size:13px;text-align:right">${formatCurrency(d.iva)}</td>
        <td style="padding:8px 12px;font-size:13px;text-align:right;font-weight:700">${formatCurrency(d.total)}</td>
      </tr>`).join("");

    const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"/>
<title>Compra ${compra.numero_compra}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;color:#1e293b;padding:32px;font-size:13px}
  .header{display:flex;justify-content:space-between;margin-bottom:24px}
  .emp-nombre{font-size:22px;font-weight:800;color:#1e3a8a;margin-bottom:4px}
  .emp-info{font-size:12px;color:#64748b;line-height:1.7}
  .num{font-size:28px;font-weight:800;color:#7c3aed;text-align:right}
  .meta{font-size:12px;color:#64748b;text-align:right;line-height:1.8;margin-top:4px}
  .divider{border:none;border-top:2.5px solid #7c3aed;margin:20px 0}
  .lbl{font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px}
  table{width:100%;border-collapse:collapse;margin:20px 0}
  thead tr{background:#7c3aed}
  thead th{padding:9px 12px;font-size:11px;font-weight:600;color:#fff;text-align:left}
  thead th:not(:first-child){text-align:right}
  thead th:nth-child(2){text-align:center}
  .totales{display:flex;justify-content:flex-end;margin-top:8px}
  .tbox{width:240px}
  .trow{display:flex;justify-content:space-between;font-size:13px;color:#475569;padding:3px 0}
  .tfinal{display:flex;justify-content:space-between;font-size:17px;font-weight:800;color:#7c3aed;border-top:2.5px solid #7c3aed;padding-top:8px;margin-top:4px}
  .pie{margin-top:32px;text-align:center;font-size:10px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:12px}
  .badge{display:inline-block;padding:2px 10px;border-radius:9999px;font-size:11px;font-weight:600;background:#ede9fe;color:#7c3aed}
  @page{size:A4;margin:1.5cm}
</style></head><body>
<div class="header">
  <div>
    <div class="emp-nombre">${empresa.nombre}</div>
    <div class="emp-info">
      RUC: ${empresa.ruc}<br/>
      ${empresa.direccion}<br/>
      ${empresa.correo}
    </div>
  </div>
  <div>
    <div class="num">${compra.numero_compra}</div>
    <div class="meta">
      Fecha: ${formatDate(compra.fecha_compra)}<br/>
      Pago: ${compra.tipo_pago.charAt(0).toUpperCase() + compra.tipo_pago.slice(1)}<br/>
      <span class="badge">${compra.estado.charAt(0).toUpperCase() + compra.estado.slice(1)}</span>
    </div>
  </div>
</div>
<hr class="divider"/>
<div style="margin-bottom:20px">
  <div class="lbl">Proveedor</div>
  <div style="font-size:16px;font-weight:700">${compra.proveedor?.nombre ?? "Sin proveedor"}</div>
  ${compra.proveedor?.ruc      ? `<div style="font-size:12px;color:#64748b">RUC: ${compra.proveedor.ruc}</div>` : ""}
  ${compra.proveedor?.direccion ? `<div style="font-size:12px;color:#64748b">${compra.proveedor.direccion}</div>` : ""}
  ${compra.proveedor?.telefono  ? `<div style="font-size:12px;color:#64748b">Tel: ${compra.proveedor.telefono}</div>` : ""}
  ${compra.proveedor?.correo    ? `<div style="font-size:12px;color:#64748b">${compra.proveedor.correo}</div>` : ""}
</div>
<table>
  <thead><tr>
    <th style="text-align:left">Descripción</th>
    <th style="text-align:center">Cant.</th>
    <th style="text-align:right">Precio Unit.</th>
    <th style="text-align:right">IVA</th>
    <th style="text-align:right">Total</th>
  </tr></thead>
  <tbody>${filas}</tbody>
</table>
<div class="totales">
  <div class="tbox">
    <div class="trow"><span>Subtotal</span><span>${formatCurrency(compra.subtotal)}</span></div>
    <div class="trow"><span>IVA (15%)</span><span>${formatCurrency(compra.iva_total)}</span></div>
    <div class="tfinal"><span>TOTAL</span><span>${formatCurrency(compra.total)}</span></div>
  </div>
</div>
${compra.notas ? `<div style="margin-top:20px;padding-top:16px;border-top:1px solid #e2e8f0"><div class="lbl">Notas</div><p style="font-size:12px;color:#475569">${compra.notas}</p></div>` : ""}
<div class="pie">
  Documento generado por Siconic<br/>
  Nicaragua · RUC: ${empresa.ruc} · ${empresa.correo}
</div>
<script>window.onload=function(){window.print();window.onafterprint=function(){window.close();};};</script>
</body></html>`;

    const v = window.open("", "_blank", "width=900,height=700");
    if (v) { v.document.write(html); v.document.close(); }
  }

  // ── Ticket térmico ────────────────────────────────────────────────────────
  function handlePrintTicket(ancho: 58 | 80 = 80) {
    if (!compra || !empresa) return;

    const anchoMM  = ancho === 58 ? "56mm" : "78mm";
    const charWidth = ancho === 58 ? 28 : 38;

    const sep  = (c = "-") => `<div class="sep">${c.repeat(charWidth)}</div>`;
    const cols = (izq: string, der: string) =>
      `<div class="row"><span>${izq}</span><span>${der}</span></div>`;
    const cortar = (txt: string, max: number) =>
      txt.length > max ? txt.slice(0, max - 2) + ".." : txt;

    const items = (compra.detalles ?? []).map(d => {
      const desc = cortar(d.descripcion, charWidth);
      const iva  = d.iva > 0 ? `<div class="iva">IVA: ${formatCurrency(d.iva)}</div>` : "";
      return `
        <div class="item-desc">${desc}</div>
        <div class="item-row">
          <span>${d.cantidad} x ${formatCurrency(d.precio_unitario)}</span>
          <span class="b">${formatCurrency(d.total)}</span>
        </div>${iva}`;
    }).join(`<div class="sep-punt">${"· ".repeat(Math.floor(charWidth / 2))}</div>`);

    const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"/>
<title>Ticket Compra ${compra.numero_compra}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Courier New',Courier,monospace;font-size:12px;line-height:1.5;color:#000;background:#fff;width:${anchoMM};margin:0 auto;padding:4px 3px}
  .c{text-align:center} .b{font-weight:bold}
  .xl{font-size:16px;font-weight:bold;text-align:center}
  .lg{font-size:14px;font-weight:bold;text-align:center}
  .md{font-size:12px;text-align:center}
  .sm{font-size:10px;text-align:center}
  .total-box{font-size:18px;font-weight:bold;text-align:center;margin:4px 0}
  .sep{text-align:center;font-size:11px;margin:3px 0;overflow:hidden}
  .sep-punt{text-align:center;font-size:10px;margin:2px 0;color:#555}
  .row{display:flex;justify-content:space-between;font-size:12px;margin:1px 0}
  .item-desc{font-size:12px;font-weight:bold;margin-top:3px}
  .item-row{display:flex;justify-content:space-between;font-size:12px;padding-left:8px}
  .iva{font-size:10px;color:#444;padding-left:8px}
  .bloque{margin:4px 0}
  .lbl{font-size:10px;font-weight:bold;letter-spacing:.05em}
  @page{size:${ancho}mm auto;margin:2mm 3mm}
  @media print{body{width:100%}}
</style></head><body>

<div class="bloque">
  <div class="xl">${empresa.nombre}</div>
  <div class="md">RUC: ${empresa.ruc}</div>
  ${empresa.direccion ? `<div class="md">${empresa.direccion}</div>` : ""}
  <div class="md">${empresa.correo}</div>
</div>

${sep("=")}

<div class="bloque">
  <div class="lg">ORDEN DE COMPRA</div>
  <div class="xl">${compra.numero_compra}</div>
  <div class="md">${formatDate(compra.fecha_compra)}</div>
  <div class="md">Pago: ${compra.tipo_pago.charAt(0).toUpperCase() + compra.tipo_pago.slice(1)}</div>
</div>

${sep("=")}

<div class="bloque">
  <div class="lbl">PROVEEDOR</div>
  <div class="b">${compra.proveedor?.nombre ?? "Sin proveedor"}</div>
  ${compra.proveedor?.ruc      ? `<div>RUC: ${compra.proveedor.ruc}</div>` : ""}
  ${compra.proveedor?.telefono  ? `<div>Tel: ${compra.proveedor.telefono}</div>` : ""}
</div>

${sep()}

<div class="bloque">
  <div class="row b"><span>DESCRIPCION</span><span>TOTAL</span></div>
  ${sep()}
  ${items}
</div>

${sep("=")}

<div class="bloque">
  ${cols("Subtotal:", formatCurrency(compra.subtotal))}
  ${cols("IVA (15%):", formatCurrency(compra.iva_total))}
</div>

${sep("=")}
<div class="total-box">TOTAL: ${formatCurrency(compra.total)}</div>
${sep("=")}

${compra.notas ? `<div class="bloque"><div class="lbl">NOTA:</div><div>${compra.notas}</div></div>${sep()}` : ""}

<div class="bloque">
  <div class="sm">Generado por SARA · Nicaragua</div>
</div>

<script>window.onload=function(){window.print();window.onafterprint=function(){window.close();};};</script>
</body></html>`;

    const v = window.open("", "_blank", "width=420,height=700");
    if (v) { v.document.write(html); v.document.close(); }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-brand-200 border-t-brand-700 rounded-full animate-spin" />
    </div>
  );

  if (!compra) return (
    <div className="text-center py-20 text-slate-500">
      <p className="text-lg font-medium">Compra no encontrada</p>
      <Link href="/dashboard/compras" className="btn-primary inline-flex mt-4">Volver a compras</Link>
    </div>
  );

  return (
    <>
      {/* Barra de acciones */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/compras" className="btn-ghost p-2"><ArrowLeft className="w-5 h-5" /></Link>
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900">{compra.numero_compra}</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className={BADGE[compra.estado] ?? "badge-gray"}>
                {compra.estado.charAt(0).toUpperCase() + compra.estado.slice(1)}
              </span>
              <span className="text-slate-400 text-sm">{formatDate(compra.fecha_compra)}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {compra.estado !== "anulada" && (
            <button onClick={() => setConfirmDel(true)} className="btn-ghost text-red-500 hover:text-red-700 flex items-center gap-2 text-sm">
              <Trash2 className="w-4 h-4" /> Anular
            </button>
          )}
          <button onClick={() => handlePrintTicket(58)} className="btn-secondary flex items-center gap-2 text-sm">
            <Printer className="w-4 h-4" /> Ticket 58mm
          </button>
          <button onClick={() => handlePrintTicket(80)} className="btn-secondary flex items-center gap-2 text-sm">
            <Printer className="w-4 h-4" /> Ticket 80mm
          </button>
          <button onClick={handlePrint} className="btn-primary flex items-center gap-2">
            <Printer className="w-4 h-4" /> Imprimir A4
          </button>
        </div>
      </div>

      {/* Vista previa */}
      <div className="bg-white rounded-xl border border-slate-200 p-8 max-w-3xl mx-auto">
        {/* Encabezado */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <h2 className="font-display text-2xl font-bold text-brand-800">{empresa?.nombre}</h2>
            {empresa?.ruc       && <p className="text-slate-500 text-sm mt-0.5">RUC: {empresa.ruc}</p>}
            {empresa?.direccion && <p className="text-slate-500 text-sm">{empresa.direccion}</p>}
            {empresa?.correo    && <p className="text-slate-500 text-sm">{empresa.correo}</p>}
          </div>
          <div className="text-right">
            <p className="font-display text-3xl font-bold text-purple-700">{compra.numero_compra}</p>
            <p className="text-slate-500 text-sm mt-1">Fecha: {formatDate(compra.fecha_compra)}</p>
            <p className="text-slate-500 text-sm capitalize">Pago: {compra.tipo_pago}</p>
          </div>
        </div>

        <div className="border-t-2 border-purple-700 mb-6" />

        {/* Proveedor */}
        <div className="mb-8">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Proveedor</p>
          <p className="font-semibold text-slate-900 text-lg">{compra.proveedor?.nombre ?? "Sin proveedor"}</p>
          {compra.proveedor?.ruc       && <p className="text-slate-500 text-sm">RUC: {compra.proveedor.ruc}</p>}
          {compra.proveedor?.direccion && <p className="text-slate-500 text-sm">{compra.proveedor.direccion}</p>}
          {compra.proveedor?.telefono  && <p className="text-slate-500 text-sm">Tel: {compra.proveedor.telefono}</p>}
          {compra.proveedor?.correo    && <p className="text-slate-500 text-sm">{compra.proveedor.correo}</p>}
        </div>

        {/* Tabla artículos */}
        <table className="w-full mb-8">
          <thead>
            <tr className="bg-purple-700 text-white">
              <th className="text-left px-3 py-2 text-xs font-semibold">Descripción</th>
              <th className="text-center px-3 py-2 text-xs font-semibold">Cant.</th>
              <th className="text-right px-3 py-2 text-xs font-semibold">Precio Unit.</th>
              <th className="text-right px-3 py-2 text-xs font-semibold">IVA</th>
              <th className="text-right px-3 py-2 text-xs font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {compra.detalles?.map((d, i) => (
              <tr key={d.id} className={i % 2 === 0 ? "bg-slate-50" : "bg-white"}>
                <td className="px-3 py-2 text-sm text-slate-800">{d.descripcion}</td>
                <td className="px-3 py-2 text-sm text-center text-slate-600">{d.cantidad}</td>
                <td className="px-3 py-2 text-sm text-right text-slate-600">{formatCurrency(d.precio_unitario)}</td>
                <td className="px-3 py-2 text-sm text-right text-slate-600">{formatCurrency(d.iva)}</td>
                <td className="px-3 py-2 text-sm text-right font-semibold text-slate-900">{formatCurrency(d.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totales */}
        <div className="flex justify-end mb-8">
          <div className="w-60 space-y-1.5">
            <div className="flex justify-between text-sm text-slate-600"><span>Subtotal</span><span>{formatCurrency(compra.subtotal)}</span></div>
            <div className="flex justify-between text-sm text-slate-600"><span>IVA (15%)</span><span>{formatCurrency(compra.iva_total)}</span></div>
            <div className="border-t-2 border-purple-700 pt-2 flex justify-between font-bold text-lg text-purple-700">
              <span>TOTAL</span><span>{formatCurrency(compra.total)}</span>
            </div>
          </div>
        </div>

        {compra.notas && (
          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Notas</p>
            <p className="text-slate-600 text-sm">{compra.notas}</p>
          </div>
        )}

        <div className="border-t border-slate-100 mt-6 pt-4 text-center text-xs text-slate-400">
          <p>Documento generado por Siconic</p>
          <p className="mt-0.5">Nicaragua · RUC: {empresa?.ruc} · {empresa?.correo}</p>
        </div>
      </div>

      {/* Modal anulación */}
      {confirmDel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-modal w-full max-w-sm p-6 text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="font-display font-bold text-slate-900 mb-2">¿Anular compra?</h3>
            <p className="text-slate-500 text-sm mb-2">{compra.numero_compra}</p>
            {compra.estado === "recibida" && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800 text-xs mb-4">
                ⚠️ Esta compra fue recibida. Al anularla se <strong>revertirá el stock</strong> del inventario.
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={handleAnular} className="btn-danger flex-1">Sí, anular</button>
              <button onClick={() => setConfirmDel(false)} className="btn-secondary flex-1">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
