"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Printer, Trash2, Pencil } from "lucide-react";
import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { getCodigoRetencion } from "@/lib/tributacion/retenciones-catalogo";
import EditarDatosProveedorModal from "@/components/compras/EditarDatosProveedorModal";

interface DetalleCompra {
  id: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  subtotal?: number;
  iva: number;
  total: number;
  producto?: { unidad_medida?: string } | null;
}

interface Compra {
  id: string;
  empresa_id: string;
  numero_compra: string;
  numero_factura_proveedor?: string | null;
  fecha_compra: string;
  fecha_vencimiento?: string;
  tipo_pago: string;
  estado: string;
  subtotal: number;
  iva_total: number;
  total: number;
  retencion_ir?: number;
  retencion_codigo?: string | null;
  isc_total?: number;
  total_a_pagar?: number;
  notas?: string;
  proveedor_id?: string | null;
  proveedor?: { nombre: string; ruc?: string; direccion?: string; telefono?: string } | null;
  detalles?: DetalleCompra[];
}

const BADGE: Record<string, string> = {
  registrada: "badge-info", pagada: "badge-success", borrador: "badge-gray", anulada: "badge-danger",
};

const TIPO_PAGO_LABEL: Record<string, string> = {
  contado: "Contado", credito: "Crédito", transferencia: "Transferencia", cheque: "Cheque", tarjeta: "Tarjeta",
};

export default function CompraDetallePage() {
  const params = useParams();
  const router = useRouter();

  const [compra,     setCompra]     = useState<Compra | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [confirmDel, setConfirmDel] = useState(false);
  const [editandoProv, setEditandoProv] = useState(false);

  useEffect(() => {
    async function load() {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Este documento representa lo que se le compró al PROVEEDOR, no una
      // factura emitida por la empresa — por eso no se consulta ni se
      // muestran los datos de la propia empresa aquí.
      const { data } = await supabase
        .from("compras")
        .select("*, proveedor:proveedores(nombre, ruc, direccion, telefono), detalles:detalle_compras(*, producto:productos(unidad_medida))")
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

    // Si estaba registrada, revertir stock
    if (compra?.estado === "registrada") {
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
    toast.success("Compra anulada" + (compra?.estado === "registrada" ? " — stock revertido" : ""));
    setConfirmDel(false);
    router.push("/dashboard/compras");
  }

  // ── Impresión A4 ──────────────────────────────────────────────────────────
  function handlePrint() {
    if (!compra) return;

    const tieneRetencion = Number(compra.retencion_ir) > 0;
    const codRetencion = getCodigoRetencion(compra.retencion_codigo);
    const totalFinal = tieneRetencion
      ? Number(compra.total_a_pagar ?? compra.total - Number(compra.retencion_ir ?? 0))
      : compra.total;

    const filas = (compra.detalles ?? []).map((d, i) => `
      <tr style="background:${i % 2 === 0 ? "#f8fafc" : "#fff"}">
        <td style="padding:8px 12px;font-size:13px">${d.descripcion}</td>
        <td style="padding:8px 12px;font-size:13px;text-align:center">${d.producto?.unidad_medida ?? "—"}</td>
        <td style="padding:8px 12px;font-size:13px;text-align:center">${d.cantidad}</td>
        <td style="padding:8px 12px;font-size:13px;text-align:right">${formatCurrency(d.precio_unitario)}</td>
        <td style="padding:8px 12px;font-size:13px;text-align:right;font-weight:700">${formatCurrency(d.subtotal ?? d.cantidad * d.precio_unitario)}</td>
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
  .num{font-size:24px;font-weight:800;color:#7c3aed;text-align:right}
  .doc-int{font-size:11px;color:#94a3b8;text-align:right;margin-top:2px}
  .meta{font-size:12px;color:#64748b;text-align:right;line-height:1.8;margin-top:4px}
  .divider{border:none;border-top:2.5px solid #7c3aed;margin:20px 0}
  .lbl{font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.1em;margin-bottom:6px}
  table{width:100%;border-collapse:collapse;margin:20px 0}
  thead tr{background:#7c3aed}
  thead th{padding:9px 12px;font-size:11px;font-weight:600;color:#fff;text-align:left}
  thead th:not(:first-child){text-align:right}
  thead th:nth-child(2),thead th:nth-child(3){text-align:center}
  .totales{display:flex;justify-content:flex-end;margin-top:8px}
  .tbox{width:260px}
  .trow{display:flex;justify-content:space-between;font-size:13px;color:#475569;padding:3px 0}
  .tfinal{display:flex;justify-content:space-between;font-size:17px;font-weight:800;color:#7c3aed;border-top:2.5px solid #7c3aed;padding-top:8px;margin-top:4px}
  .pie{margin-top:32px;text-align:center;font-size:10px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:12px}
  .badge{display:inline-block;padding:2px 10px;border-radius:9999px;font-size:11px;font-weight:600;background:#ede9fe;color:#7c3aed}
  @page{size:A4;margin:1.5cm}
</style></head><body>
<div class="header">
  <div>
    <div class="lbl">Proveedor</div>
    <div class="emp-nombre">${compra.proveedor?.nombre ?? "Proveedor no especificado"}</div>
    <div class="emp-info">
      ${compra.proveedor?.ruc       ? `RUC: ${compra.proveedor.ruc}<br/>` : ""}
      ${compra.proveedor?.direccion ? `${compra.proveedor.direccion}<br/>` : ""}
      ${compra.proveedor?.telefono  ? `Tel: ${compra.proveedor.telefono}` : ""}
    </div>
  </div>
  <div>
    <div class="lbl" style="text-align:right">No. Factura del proveedor</div>
    <div class="num">${compra.numero_factura_proveedor || "—"}</div>
    <div class="doc-int">Doc. interno: ${compra.numero_compra}</div>
    <div class="meta">
      Fecha: ${formatDate(compra.fecha_compra)}<br/>
      Pago: ${TIPO_PAGO_LABEL[compra.tipo_pago] ?? compra.tipo_pago}<br/>
      <span class="badge">${compra.estado.charAt(0).toUpperCase() + compra.estado.slice(1)}</span>
    </div>
  </div>
</div>
<hr class="divider"/>
<table>
  <thead><tr>
    <th style="text-align:left">Descripción</th>
    <th style="text-align:center">Unidad</th>
    <th style="text-align:center">Cant.</th>
    <th style="text-align:right">Precio Unit.</th>
    <th style="text-align:right">Subtotal</th>
  </tr></thead>
  <tbody>${filas}</tbody>
</table>
<div class="totales">
  <div class="tbox">
    <div class="trow"><span>Subtotal</span><span>${formatCurrency(compra.subtotal)}</span></div>
    <div class="trow"><span>IVA (15%)</span><span>${formatCurrency(compra.iva_total)}</span></div>
    ${tieneRetencion ? `
    <div class="trow" style="color:#b45309;background:#fffbeb;padding:4px 6px;border-radius:6px">
      <span>IR retenido ${codRetencion ? `${Math.round(codRetencion.alicuota * 1000) / 10}% (Cód. ${codRetencion.codigo})` : ""}</span>
      <span>- ${formatCurrency(Number(compra.retencion_ir))}</span>
    </div>` : ""}
    <div class="tfinal"><span>TOTAL</span><span>${formatCurrency(totalFinal)}</span></div>
  </div>
</div>
${compra.notas ? `<div style="margin-top:20px;padding-top:16px;border-top:1px solid #e2e8f0"><div class="lbl">Notas</div><p style="font-size:12px;color:#475569">${compra.notas}</p></div>` : ""}
<div class="pie">Comprobante interno de compra — Documento generado por Siconic</div>
<script>window.onload=function(){window.print();window.onafterprint=function(){window.close();};};</script>
</body></html>`;

    const v = window.open("", "_blank", "width=900,height=700");
    if (v) { v.document.write(html); v.document.close(); }
  }

  // ── Ticket térmico ────────────────────────────────────────────────────────
  function handlePrintTicket(ancho: 58 | 80 = 80) {
    if (!compra) return;

    const tieneRetencionTk = Number(compra.retencion_ir) > 0;
    const codRetencionTk = getCodigoRetencion(compra.retencion_codigo);
    const totalFinalTk = tieneRetencionTk
      ? Number(compra.total_a_pagar ?? compra.total - Number(compra.retencion_ir ?? 0))
      : compra.total;

    const anchoMM  = ancho === 58 ? "56mm" : "78mm";
    const charWidth = ancho === 58 ? 28 : 38;

    const sep  = (c = "-") => `<div class="sep">${c.repeat(charWidth)}</div>`;
    const cols = (izq: string, der: string) =>
      `<div class="row"><span>${izq}</span><span>${der}</span></div>`;
    const cortar = (txt: string, max: number) =>
      txt.length > max ? txt.slice(0, max - 2) + ".." : txt;

    const items = (compra.detalles ?? []).map(d => {
      const desc = cortar(d.descripcion, charWidth);
      const unidad = d.producto?.unidad_medida ? ` ${d.producto.unidad_medida}` : "";
      return `
        <div class="item-desc">${desc}</div>
        <div class="item-row">
          <span>${d.cantidad}${unidad} x ${formatCurrency(d.precio_unitario)}</span>
          <span class="b">${formatCurrency(d.subtotal ?? d.cantidad * d.precio_unitario)}</span>
        </div>`;
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
  .bloque{margin:4px 0}
  .lbl{font-size:10px;font-weight:bold;letter-spacing:.05em}
  @page{size:${ancho}mm auto;margin:2mm 3mm}
  @media print{body{width:100%}}
</style></head><body>

<div class="bloque">
  <div class="lbl c">PROVEEDOR</div>
  <div class="lg">${compra.proveedor?.nombre ?? "Proveedor no especificado"}</div>
  ${compra.proveedor?.ruc      ? `<div class="md">RUC: ${compra.proveedor.ruc}</div>` : ""}
  ${compra.proveedor?.telefono  ? `<div class="md">Tel: ${compra.proveedor.telefono}</div>` : ""}
</div>

${sep("=")}

<div class="bloque">
  <div class="md">No. Factura proveedor:</div>
  <div class="xl">${compra.numero_factura_proveedor || "—"}</div>
  <div class="sm">Doc. interno: ${compra.numero_compra}</div>
  <div class="md">${formatDate(compra.fecha_compra)}</div>
  <div class="md">Pago: ${TIPO_PAGO_LABEL[compra.tipo_pago] ?? compra.tipo_pago}</div>
</div>

${sep("=")}

<div class="bloque">
  <div class="row b"><span>DESCRIPCION</span><span>SUBTOTAL</span></div>
  ${sep()}
  ${items}
</div>

${sep("=")}

<div class="bloque">
  ${cols("Subtotal:", formatCurrency(compra.subtotal))}
  ${cols("IVA (15%):", formatCurrency(compra.iva_total))}
  ${tieneRetencionTk ? cols(`IR retenido${codRetencionTk ? ` (${codRetencionTk.codigo})` : ""}:`, `-${formatCurrency(Number(compra.retencion_ir))}`) : ""}
</div>

${sep("=")}
<div class="total-box">TOTAL: ${formatCurrency(totalFinalTk)}</div>
${sep("=")}

${compra.notas ? `<div class="bloque"><div class="lbl">NOTA:</div><div>${compra.notas}</div></div>${sep()}` : ""}

<div class="bloque">
  <div class="sm">Comprobante interno de compra</div>
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

  const tieneRetencion = Number(compra.retencion_ir) > 0;
  const totalFinalPantalla = tieneRetencion
    ? Number(compra.total_a_pagar ?? compra.total - Number(compra.retencion_ir ?? 0))
    : compra.total;

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
            <>
              <button onClick={() => setEditandoProv(true)} className="btn-ghost text-amber-600 hover:text-amber-800 flex items-center gap-2 text-sm">
                <Pencil className="w-4 h-4" /> Editar proveedor/factura
              </button>
              <button onClick={() => setConfirmDel(true)} className="btn-ghost text-red-500 hover:text-red-700 flex items-center gap-2 text-sm">
                <Trash2 className="w-4 h-4" /> Anular
              </button>
            </>
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
        {/* Encabezado: datos del PROVEEDOR (esto no es una factura nuestra) */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Proveedor</p>
            <h2 className="font-display text-2xl font-bold text-brand-800">{compra.proveedor?.nombre ?? "Proveedor no especificado"}</h2>
            {compra.proveedor?.ruc       && <p className="text-slate-500 text-sm mt-0.5">RUC: {compra.proveedor.ruc}</p>}
            {compra.proveedor?.direccion && <p className="text-slate-500 text-sm">{compra.proveedor.direccion}</p>}
            {compra.proveedor?.telefono  && <p className="text-slate-500 text-sm">Tel: {compra.proveedor.telefono}</p>}
          </div>
          <div className="text-right">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">No. Factura del proveedor</p>
            <p className="font-display text-2xl font-bold text-purple-700">{compra.numero_factura_proveedor || "—"}</p>
            <p className="text-slate-400 text-xs mt-0.5">Doc. interno: {compra.numero_compra}</p>
            <p className="text-slate-500 text-sm mt-1">Fecha: {formatDate(compra.fecha_compra)}</p>
            <p className="text-slate-500 text-sm">Pago: {TIPO_PAGO_LABEL[compra.tipo_pago] ?? compra.tipo_pago}</p>
          </div>
        </div>

        <div className="border-t-2 border-purple-700 mb-6" />

        {/* Tabla artículos */}
        <table className="w-full mb-8">
          <thead>
            <tr className="bg-purple-700 text-white">
              <th className="text-left px-3 py-2 text-xs font-semibold">Descripción</th>
              <th className="text-center px-3 py-2 text-xs font-semibold">Unidad</th>
              <th className="text-center px-3 py-2 text-xs font-semibold">Cant.</th>
              <th className="text-right px-3 py-2 text-xs font-semibold">Precio Unit.</th>
              <th className="text-right px-3 py-2 text-xs font-semibold">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {compra.detalles?.map((d, i) => (
              <tr key={d.id} className={i % 2 === 0 ? "bg-slate-50" : "bg-white"}>
                <td className="px-3 py-2 text-sm text-slate-800">{d.descripcion}</td>
                <td className="px-3 py-2 text-sm text-center text-slate-500">{d.producto?.unidad_medida ?? "—"}</td>
                <td className="px-3 py-2 text-sm text-center text-slate-600">{d.cantidad}</td>
                <td className="px-3 py-2 text-sm text-right text-slate-600">{formatCurrency(d.precio_unitario)}</td>
                <td className="px-3 py-2 text-sm text-right font-semibold text-slate-900">{formatCurrency(d.subtotal ?? d.cantidad * d.precio_unitario)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totales: Subtotal → IVA → IR (si aplica) → Total */}
        <div className="flex justify-end mb-8">
          <div className="w-72 space-y-1.5">
            <div className="flex justify-between text-sm text-slate-600"><span>Subtotal</span><span>{formatCurrency(compra.subtotal)}</span></div>
            <div className="flex justify-between text-sm text-slate-600"><span>IVA (15%)</span><span>{formatCurrency(compra.iva_total)}</span></div>
            {tieneRetencion && (
              <div className="flex justify-between text-sm text-amber-700 bg-amber-50 rounded-lg px-2 py-1.5">
                <span>
                  IR retenido {(() => { const c = getCodigoRetencion(compra.retencion_codigo); return c ? `${Math.round(c.alicuota * 1000) / 10}% (Cód. ${c.codigo})` : ""; })()}
                </span>
                <span>- {formatCurrency(Number(compra.retencion_ir))}</span>
              </div>
            )}
            <div className="border-t-2 border-purple-700 pt-2 flex justify-between font-bold text-lg text-purple-700">
              <span>TOTAL</span><span>{formatCurrency(totalFinalPantalla)}</span>
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
          <p>Comprobante interno de compra — Documento generado por Siconic</p>
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
            {compra.estado === "registrada" && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-800 text-xs mb-4">
                ⚠️ Esta compra fue registrada. Al anularla se <strong>revertirá el stock</strong> del inventario.
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={handleAnular} className="btn-danger flex-1">Sí, anular</button>
              <button onClick={() => setConfirmDel(false)} className="btn-secondary flex-1">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Editar proveedor / N° factura sin tocar montos ni contabilidad */}
      {editandoProv && (
        <EditarDatosProveedorModal
          compraId={compra.id}
          empresaId={compra.empresa_id}
          proveedorIdInicial={compra.proveedor_id ?? null}
          proveedorNombreInicial={compra.proveedor?.nombre ?? null}
          numeroFacturaInicial={compra.numero_factura_proveedor ?? null}
          onClose={() => setEditandoProv(false)}
          onSaved={(datos) => {
            setCompra(prev => prev ? {
              ...prev,
              proveedor_id: datos.proveedor_id,
              proveedor: datos.proveedor_nombre
                ? { ...(prev.proveedor ?? {}), nombre: datos.proveedor_nombre }
                : null,
              numero_factura_proveedor: datos.numero_factura_proveedor,
            } : prev);
            setEditandoProv(false);
          }}
        />
      )}
    </>
  );
}
