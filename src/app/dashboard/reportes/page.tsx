"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { formatCurrency, nombreMes } from "@/lib/utils";
import { BarChart3, Download, Eye, FileSpreadsheet, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { alicuotaLabel } from "@/lib/tributacion/retenciones-catalogo";

/* ─── tipos ──────────────────────────────────────────────── */
interface MesData {
  mes: number; anio: number;
  ventas: number; ivaVentas: number;
  compras: number; ivaCompras: number;
  totalFacturas: number; totalCompras: number;
}

interface VentaRow { numero_factura: string; fecha_emision: string; cliente_nombre: string; cliente_ruc: string; subtotal: number; iva_total: number; total: number; }
interface CompraRow { numero_compra: string; numero_factura_proveedor?: string | null; fecha_compra: string; proveedor_nombre: string; proveedor_ruc: string; subtotal: number; iva_total: number; total: number; tipo_proveedor: string; retencion_ir: number; retencion_codigo: string | null; isc_total: number; }
interface DatosReporte { ventas?: VentaRow[]; compras?: CompraRow[]; empresa: { nombre: string; ruc: string }; mes: number; anio: number; }

/* ─── estilos xlsx-js-style ──────────────────────────────── */
const THIN = { style: "thin", color: { rgb: "CBD5E0" } };
const BORDER = { top: THIN, bottom: THIN, left: THIN, right: THIN };
const S_HDR = { font: { bold: true, color: { rgb: "FFFFFF" }, sz: 10, name: "Calibri" }, fill: { patternType: "solid", fgColor: { rgb: "1B3A5C" } }, alignment: { horizontal: "center", vertical: "center" }, border: BORDER };
const S_EVEN = { font: { sz: 9, name: "Calibri" }, fill: { patternType: "solid", fgColor: { rgb: "EBF5FB" } }, alignment: { vertical: "center" }, border: BORDER };
const S_ODD  = { font: { sz: 9, name: "Calibri" }, fill: { patternType: "solid", fgColor: { rgb: "FFFFFF" } }, alignment: { vertical: "center" }, border: BORDER };
const S_TOT  = { font: { bold: true, sz: 9, name: "Calibri" }, fill: { patternType: "solid", fgColor: { rgb: "D4E6F1" } }, alignment: { horizontal: "right", vertical: "center" }, border: BORDER };
const S_TITL = { font: { bold: true, sz: 13, name: "Calibri", color: { rgb: "1B3A5C" } }, alignment: { horizontal: "center", vertical: "center" } };
const S_SUB  = { font: { sz: 10, name: "Calibri", color: { rgb: "555555" } }, alignment: { horizontal: "center", vertical: "center" } };

function styleSheet(ws: Record<string, unknown>, totalRows: number, totalCols: number, headerRow = 0) {
  for (let R = 0; R <= totalRows; R++) {
    for (let C = 0; C < totalCols; C++) {
      const addr = `${String.fromCharCode(65 + C)}${R + 1}`;
      if (!(ws as Record<string, unknown>)[addr] || typeof (ws as Record<string, unknown>)[addr] !== "object") continue;
      const cell = (ws as Record<string, Record<string, unknown>>)[addr];
      if (R === headerRow) cell.s = S_HDR;
      else if (R % 2 === 0) cell.s = S_EVEN;
      else cell.s = S_ODD;
    }
  }
}

/* ─── Preview: contenido según tipo ─────────────────────── */
function PreviewContent({ tipo, datos }: { tipo: string; datos: DatosReporte }) {
  const ventas = datos.ventas ?? [];
  const compras = datos.compras ?? [];

  if (tipo === "ingresos" || tipo === "ventas") {
    // Mismos criterios que el Excel: sin IVA = exenta; bases SIN impuesto
    const gravadas = ventas.filter(v => v.iva_total > 0).reduce((s, v) => s + v.subtotal, 0);
    const exentas  = ventas.filter(v => v.iva_total === 0).reduce((s, v) => s + v.subtotal, 0);
    const resumen = [
      ["Ingresos gravados del mes (15%)",   gravadas],
      ["Ingresos del mes exentos",          exentas],
      ["Base Imponible PMD / Anticipo",     gravadas + exentas],
      ["Ingresos brutos del mes",           gravadas + exentas],
    ];
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          {resumen.map(([label, val]) => (
            <div key={String(label)} className="bg-slate-50 rounded-lg p-3 flex justify-between items-center gap-4">
              <span className="text-xs text-slate-600">{String(label)}</span>
              <span className="font-semibold text-slate-900 text-sm whitespace-nowrap">{formatCurrency(Number(val))}</span>
            </div>
          ))}
        </div>
        <div>
          <h4 className="font-semibold text-slate-800 mb-2 text-sm">Facturas del período ({ventas.length})</h4>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-xs">
              <thead><tr className="bg-blue-800 text-white">
                {["N° Factura","Fecha","Cliente","Subtotal","IVA","Total"].map(h => <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}
              </tr></thead>
              <tbody>
                {ventas.length === 0
                  ? <tr><td colSpan={6} className="text-center py-6 text-slate-400">Sin facturas en este período</td></tr>
                  : ventas.map((v, i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-blue-50" : "bg-white"}>
                      <td className="px-3 py-1.5 font-mono">{v.numero_factura}</td>
                      <td className="px-3 py-1.5">{v.fecha_emision}</td>
                      <td className="px-3 py-1.5 max-w-[160px] truncate">{v.cliente_nombre}</td>
                      <td className="px-3 py-1.5 text-right">{formatCurrency(v.subtotal)}</td>
                      <td className="px-3 py-1.5 text-right text-blue-700">{formatCurrency(v.iva_total)}</td>
                      <td className="px-3 py-1.5 text-right font-medium">{formatCurrency(v.total)}</td>
                    </tr>
                  ))}
                {ventas.length > 0 && (
                  <tr className="bg-blue-100 font-semibold">
                    <td colSpan={3} className="px-3 py-2 text-right text-xs text-slate-600">TOTALES</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(ventas.reduce((s,v)=>s+v.subtotal,0))}</td>
                    <td className="px-3 py-2 text-right text-blue-700">{formatCurrency(ventas.reduce((s,v)=>s+v.iva_total,0))}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(ventas.reduce((s,v)=>s+v.total,0))}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  if (tipo === "credito") {
    // Igual que el Excel: solo compras con IVA acreditable
    const conIVA = compras.filter(c => c.iva_total > 0);
    return (
      <div>
        <p className="text-xs text-slate-500 mb-3">Crédito Fiscal IVA — Renglón 105 · Solo compras con IVA</p>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-xs">
            <thead><tr className="bg-purple-800 text-white">
              {["RUC","Nombre / Razón Social","N° Documento","Fecha","Sin IVA","IVA","Renglón"].map(h => <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}
            </tr></thead>
            <tbody>
              {conIVA.length === 0
                ? <tr><td colSpan={7} className="text-center py-6 text-slate-400">Sin compras con IVA en este período</td></tr>
                : conIVA.map((c, i) => {
                    const fp = c.fecha_compra?.split("-") ?? [];
                    const fecha = fp.length === 3 ? `${fp[2]}/${fp[1]}/${fp[0]}` : c.fecha_compra;
                    return (
                      <tr key={i} className={i % 2 === 0 ? "bg-purple-50" : "bg-white"}>
                        <td className="px-3 py-1.5 font-mono">{c.proveedor_ruc}</td>
                        <td className="px-3 py-1.5 max-w-[160px] truncate">{c.proveedor_nombre}</td>
                        <td className="px-3 py-1.5 font-mono">{c.numero_factura_proveedor ?? c.numero_compra}</td>
                        <td className="px-3 py-1.5">{fecha}</td>
                        <td className="px-3 py-1.5 text-right">{formatCurrency(c.subtotal)}</td>
                        <td className="px-3 py-1.5 text-right text-purple-700">{formatCurrency(c.iva_total)}</td>
                        <td className="px-3 py-1.5 text-center">105</td>
                      </tr>
                    );
                  })}
              {conIVA.length > 0 && (
                <tr className="bg-purple-100 font-semibold">
                  <td colSpan={4} className="px-3 py-2 text-right text-xs text-slate-600">TOTALES</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(conIVA.reduce((s,c)=>s+c.subtotal,0))}</td>
                  <td className="px-3 py-2 text-right text-purple-700">{formatCurrency(conIVA.reduce((s,c)=>s+c.iva_total,0))}</td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (tipo === "retenciones") {
    const conRetencion = compras.filter(c => c.retencion_ir > 0);
    return (
      <div>
        <p className="text-xs text-slate-500 mb-3">Retenciones en la Fuente IR — según código de retención de cada compra</p>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-xs">
            <thead><tr className="bg-amber-700 text-white">
              {["RUC","Nombre","N° Documento","Fecha","Base Imponible","IR Retenido","Alícuota","Cód"].map(h => <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}
            </tr></thead>
            <tbody>
              {conRetencion.length === 0
                ? <tr><td colSpan={8} className="text-center py-6 text-slate-400">Sin compras con retención en este período</td></tr>
                : conRetencion.map((c, i) => {
                    const fp = c.fecha_compra?.split("-") ?? [];
                    const fecha = fp.length === 3 ? `${fp[2]}/${fp[1]}/${fp[0]}` : c.fecha_compra;
                    const codigo = c.retencion_codigo ?? "22";
                    return (
                      <tr key={i} className={i % 2 === 0 ? "bg-amber-50" : "bg-white"}>
                        <td className="px-3 py-1.5 font-mono">{c.proveedor_ruc}</td>
                        <td className="px-3 py-1.5 max-w-[160px] truncate">{c.proveedor_nombre}</td>
                        <td className="px-3 py-1.5 font-mono">{c.numero_factura_proveedor ?? c.numero_compra}</td>
                        <td className="px-3 py-1.5">{fecha}</td>
                        <td className="px-3 py-1.5 text-right">{formatCurrency(c.subtotal)}</td>
                        <td className="px-3 py-1.5 text-right text-amber-700 font-medium">{formatCurrency(c.retencion_ir)}</td>
                        <td className="px-3 py-1.5 text-center">{alicuotaLabel(codigo)}</td>
                        <td className="px-3 py-1.5 text-center">{codigo}</td>
                      </tr>
                    );
                  })}
              {conRetencion.length > 0 && (
                <tr className="bg-amber-100 font-semibold">
                  <td colSpan={4} className="px-3 py-2 text-right text-xs text-slate-600">TOTALES</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(conRetencion.reduce((s,c)=>s+c.subtotal,0))}</td>
                  <td className="px-3 py-2 text-right text-amber-700">{formatCurrency(conRetencion.reduce((s,c)=>s+c.retencion_ir,0))}</td>
                  <td colSpan={2} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (tipo === "credito_isc") {
    const conIsc = compras.filter(c => c.isc_total > 0);
    return (
      <div>
        <p className="text-xs text-slate-500 mb-3">Crédito Fiscal ISC — compras con ISC desglosado en la factura</p>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-xs">
            <thead><tr className="bg-rose-800 text-white">
              {["RUC","Nombre","N° Documento","Fecha","Sin Impuesto","ISC","Renglón"].map(h => <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}
            </tr></thead>
            <tbody>
              {conIsc.length === 0
                ? <tr><td colSpan={7} className="text-center py-6 text-slate-400">Sin compras con ISC registrado en este período. Ingresa el ISC desglosado al registrar la compra.</td></tr>
                : conIsc.map((c, i) => {
                    const fp = c.fecha_compra?.split("-") ?? [];
                    const fecha = fp.length === 3 ? `${fp[2]}/${fp[1]}/${fp[0]}` : c.fecha_compra;
                    return (
                      <tr key={i} className={i % 2 === 0 ? "bg-rose-50" : "bg-white"}>
                        <td className="px-3 py-1.5 font-mono">{c.proveedor_ruc}</td>
                        <td className="px-3 py-1.5 max-w-[160px] truncate">{c.proveedor_nombre}</td>
                        <td className="px-3 py-1.5 font-mono">{c.numero_factura_proveedor ?? c.numero_compra}</td>
                        <td className="px-3 py-1.5">{fecha}</td>
                        <td className="px-3 py-1.5 text-right">{formatCurrency(c.subtotal)}</td>
                        <td className="px-3 py-1.5 text-right text-rose-700 font-medium">{formatCurrency(c.isc_total)}</td>
                        <td className="px-3 py-1.5 text-center">124</td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (tipo === "libro_ventas") {
    return (
      <div>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-xs">
            <thead><tr className="bg-green-800 text-white">
              {["Fecha","N° Factura","Cliente","RUC / Cédula","Subtotal","IVA 15%","Exento","Total"].map(h => <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}
            </tr></thead>
            <tbody>
              {ventas.length === 0
                ? <tr><td colSpan={8} className="text-center py-6 text-slate-400">Sin facturas en este período</td></tr>
                : ventas.map((v, i) => {
                    const fp = v.fecha_emision?.split("-") ?? [];
                    const fecha = fp.length === 3 ? `${fp[2]}/${fp[1]}/${fp[0]}` : v.fecha_emision;
                    return (
                      <tr key={i} className={i % 2 === 0 ? "bg-green-50" : "bg-white"}>
                        <td className="px-3 py-1.5">{fecha}</td>
                        <td className="px-3 py-1.5 font-mono">{v.numero_factura}</td>
                        <td className="px-3 py-1.5 max-w-[140px] truncate">{v.cliente_nombre}</td>
                        <td className="px-3 py-1.5 font-mono text-xs">{v.cliente_ruc}</td>
                        <td className="px-3 py-1.5 text-right">{formatCurrency(v.iva_total > 0 ? v.subtotal : 0)}</td>
                        <td className="px-3 py-1.5 text-right text-green-700">{formatCurrency(v.iva_total)}</td>
                        <td className="px-3 py-1.5 text-right">{formatCurrency(v.iva_total > 0 ? 0 : v.subtotal)}</td>
                        <td className="px-3 py-1.5 text-right font-medium">{formatCurrency(v.total)}</td>
                      </tr>
                    );
                  })}
              {ventas.length > 0 && (
                <tr className="bg-green-100 font-semibold">
                  <td colSpan={4} className="px-3 py-2 text-right text-xs text-slate-600">TOTALES</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(ventas.reduce((s,v)=>s+(v.iva_total > 0 ? v.subtotal : 0),0))}</td>
                  <td className="px-3 py-2 text-right text-green-700">{formatCurrency(ventas.reduce((s,v)=>s+v.iva_total,0))}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(ventas.reduce((s,v)=>s+(v.iva_total > 0 ? 0 : v.subtotal),0))}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(ventas.reduce((s,v)=>s+v.total,0))}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (tipo === "libro_compras") {
    return (
      <div>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-xs">
            <thead><tr className="bg-teal-800 text-white">
              {["Fecha","N° Comprobante","Proveedor","RUC","Sin IVA","IVA","Total","IR Ret.","Tipo"].map(h => <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}
            </tr></thead>
            <tbody>
              {compras.length === 0
                ? <tr><td colSpan={9} className="text-center py-6 text-slate-400">Sin compras en este período</td></tr>
                : compras.map((c, i) => {
                    const fp = c.fecha_compra?.split("-") ?? [];
                    const fecha = fp.length === 3 ? `${fp[2]}/${fp[1]}/${fp[0]}` : c.fecha_compra;
                    const ir = c.retencion_ir;
                    return (
                      <tr key={i} className={i % 2 === 0 ? "bg-teal-50" : "bg-white"}>
                        <td className="px-3 py-1.5">{fecha}</td>
                        <td className="px-3 py-1.5 font-mono">{c.numero_factura_proveedor ?? c.numero_compra}</td>
                        <td className="px-3 py-1.5 max-w-[140px] truncate">{c.proveedor_nombre}</td>
                        <td className="px-3 py-1.5 font-mono text-xs">{c.proveedor_ruc}</td>
                        <td className="px-3 py-1.5 text-right">{formatCurrency(c.subtotal)}</td>
                        <td className="px-3 py-1.5 text-right text-teal-700">{formatCurrency(c.iva_total)}</td>
                        <td className="px-3 py-1.5 text-right font-medium">{formatCurrency(c.total)}</td>
                        <td className="px-3 py-1.5 text-right text-amber-700">{ir > 0 ? formatCurrency(ir) : "—"}</td>
                        <td className="px-3 py-1.5">{c.tipo_proveedor === "natural" ? "Natural" : "Jurídica"}</td>
                      </tr>
                    );
                  })}
              {compras.length > 0 && (
                <tr className="bg-teal-100 font-semibold">
                  <td colSpan={4} className="px-3 py-2 text-right text-xs text-slate-600">TOTALES</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(compras.reduce((s,c)=>s+c.subtotal,0))}</td>
                  <td className="px-3 py-2 text-right text-teal-700">{formatCurrency(compras.reduce((s,c)=>s+c.iva_total,0))}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(compras.reduce((s,c)=>s+c.total,0))}</td>
                  <td className="px-3 py-2 text-right text-amber-700">{formatCurrency(compras.reduce((s,c)=>s+c.retencion_ir,0))}</td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return null;
}

/* ─── Página Principal ───────────────────────────────────── */
export default function ReportesPage() {
  const [meses,   setMeses]   = useState<MesData[]>([]);
  const [loading, setLoading] = useState(true);
  const [mesSeleccionado, setMesSeleccionado] = useState(new Date().getMonth() + 1);
  const [anioSeleccionado, setAnioSeleccionado] = useState(new Date().getFullYear());
  const [descargando,     setDescargando]     = useState<string | null>(null);
  const [loadingPreview,  setLoadingPreview]  = useState<string | null>(null);
  const [preview,         setPreview]         = useState<{ tipo: string; label: string; datos: DatosReporte } | null>(null);

  useEffect(() => {
    async function load() {
      const { createClient } = await import("@/lib/supabase/client");
      const { getEmpresaIdActual } = await import("@/lib/supabase/empresa-actual");
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const empresaId = await getEmpresaIdActual(supabase, user.id);
      const ids = empresaId ? [empresaId] : [];

      const now = new Date();
      const promises = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const mes = d.getMonth() + 1;
        const anio = d.getFullYear();
        const firstDay = `${anio}-${String(mes).padStart(2,"0")}-01`;
        const lastDay  = new Date(anio, mes, 0).toISOString().split("T")[0];
        if (!ids.length) return Promise.resolve({ mes, anio, ventas:0, ivaVentas:0, compras:0, ivaCompras:0, totalFacturas:0, totalCompras:0 });

        return Promise.all([
          supabase.from("facturas").select("total, iva_total").in("empresa_id", ids).gte("fecha_emision", firstDay).lte("fecha_emision", lastDay).in("estado",["emitida","pagada"]),
          supabase.from("compras").select("total, iva_total").in("empresa_id", ids).gte("fecha_compra", firstDay).lte("fecha_compra", lastDay).eq("estado","recibida"),
        ]).then(([{ data: fac }, { data: com }]) => ({
          mes, anio,
          ventas:        fac?.reduce((s,f) => s + Number(f.total), 0) ?? 0,
          ivaVentas:     fac?.reduce((s,f) => s + Number(f.iva_total), 0) ?? 0,
          compras:       com?.reduce((s,c) => s + Number(c.total), 0) ?? 0,
          ivaCompras:    com?.reduce((s,c) => s + Number(c.iva_total), 0) ?? 0,
          totalFacturas: fac?.length ?? 0,
          totalCompras:  com?.length ?? 0,
        }));
      });

      setMeses(await Promise.all(promises));
      setLoading(false);
    }
    load();
  }, []);

  async function fetchDatos(tipo: string): Promise<DatosReporte> {
    const res = await fetch(`/api/reportes/dgi?tipo=${tipo}&mes=${mesSeleccionado}&anio=${anioSeleccionado}`);
    if (!res.ok) throw new Error("Error al obtener datos");
    return res.json();
  }

  async function previsualizarReporte(tipo: string, label: string) {
    setLoadingPreview(tipo);
    try {
      const datos = await fetchDatos(tipo);
      setPreview({ tipo, label, datos });
    } catch {
      toast.error("Error al cargar la previsualización");
    } finally {
      setLoadingPreview(null);
    }
  }

  async function descargarReporte(tipo: string, label: string, datosExternos?: DatosReporte) {
    setDescargando(tipo);
    try {
      const datos = datosExternos ?? await fetchDatos(tipo);
      const XLSX = await import("xlsx-js-style" as string) as typeof import("xlsx");
      let wb = XLSX.utils.book_new();
      const mesNombre = nombreMes(datos.mes ?? mesSeleccionado);
      const empresa = datos.empresa?.nombre ?? "Siconic ERP";

      /* ─ Helper: estilizar worksheet ─ */
      function applyStyles(ws: Record<string, unknown>, hdrRow: number, numCols: number) {
        const ref = (ws["!ref"] as string) ?? "A1";
        const range = XLSX.utils.decode_range(ref);
        for (let R = range.s.r; R <= range.e.r; R++) {
          for (let C = range.s.c; C <= range.e.c; C++) {
            const addr = XLSX.utils.encode_cell({ r: R, c: C });
            const cell = (ws as Record<string, Record<string, unknown>>)[addr];
            if (!cell || typeof cell !== "object") continue;
            if (R === hdrRow) cell.s = S_HDR;
            else if (R === hdrRow - 1) cell.s = S_TITL;
            else if (R === hdrRow - 2) cell.s = S_SUB;
            else if (R === range.e.r) cell.s = S_TOT;
            else cell.s = R % 2 === 0 ? S_EVEN : S_ODD;
            void numCols;
          }
        }
        ws["!rows"] = [{ hpt: 20 }, { hpt: 16 }, { hpt: 22 }];
      }

      if (tipo === "ingresos" || tipo === "ventas") {
        const ventas = datos.ventas ?? [];
        // Clasificación fiscal: una factura sin IVA es venta exenta; la base
        // del PMD/Anticipo son los ingresos brutos SIN IVA (art. 63 LCT) —
        // nunca el total facturado con impuesto.
        const gravadas = ventas.filter(v => v.iva_total > 0).reduce((s,v) => s + v.subtotal, 0);
        const exentas  = ventas.filter(v => v.iva_total === 0).reduce((s,v) => s + v.subtotal, 0);
        const brutosSinIVA = gravadas + exentas;

        // Se parte de la plantilla OFICIAL de la DGI (copiada sin modificar
        // desde dgi.gob.ni a public/plantillas-vet) y solo se llenan las
        // celdas de valores: los textos, hojas y estructura quedan idénticos
        // a lo que la VET espera, incluidos sus espacios internos.
        const respPlantilla = await fetch("/plantillas-vet/dgi-planilla-ingresos-dmi-v2.xlsx");
        if (!respPlantilla.ok) throw new Error("No se encontró la plantilla oficial en /plantillas-vet");
        wb = XLSX.read(await respPlantilla.arrayBuffer(), { type: "array", cellStyles: true });
        const ws1 = wb.Sheets["Con 25 filas y Datos de Factura"];
        if (!ws1) throw new Error("La plantilla oficial no tiene la hoja esperada");

        // Valores de la columna B (filas 2-25 de la plantilla oficial)
        const valores: Record<string, number> = {
          B2:  gravadas,      // Base Imponible para determinar el IVA
          B3:  gravadas,      // Ingresos gravados del mes (tasa 15%)
          B4:  0,             // Energía eléctrica subsidiada (tasa 7%)
          B5:  0,             // Exportación de bienes tangibles
          B6:  0,             // Exportación de bienes intangibles
          B7:  exentas,       // Ingresos del mes exentos
          B8:  0,             // Ingresos del mes exonerados
          B9:  0,             // Base Imponible para determinar ISC
          B10: 0, B11: 0, B12: 0, B13: 0, B14: 0, B15: 0, B16: 0, B17: 0, B18: 0,
          B19: brutosSinIVA,  // Base Imponible para determinar PMD o Anticipo
          B20: brutosSinIVA,  // Ingresos brutos del mes
          B21: 0,             // Margen de comercialización
          B22: 0,             // Utilidades del mes
          B23: 0,             // Base impuesto Casino
          B24: 0,             // Total máquinas de juegos
          B25: 0,             // Cantidad de mesas de juego
        };
        for (const [celda, valor] of Object.entries(valores)) {
          XLSX.utils.sheet_add_aoa(ws1, [[valor]], { origin: celda });
        }

        // Rango de facturas por serie (desde la fila 27, bajo el encabezado
        // "Sucursales" de la fila 26): el número puede venir como "F-000123";
        // agrupar por prefijo de serie y tomar min/max numérico, no
        // lexicográfico (evita que "F-000010" quede antes que "F-000009").
        if (ventas.length > 0) {
          const porSerie = new Map<string, { min: string; max: string; minN: number; maxN: number }>();
          for (const v of ventas) {
            const num = v.numero_factura ?? "";
            const serie = num.includes("-") ? num.split("-")[0] : "";
            const n = parseInt(num.replace(/\D/g, ""), 10) || 0;
            const actual = porSerie.get(serie);
            if (!actual) porSerie.set(serie, { min: num, max: num, minN: n, maxN: n });
            else {
              if (n < actual.minN) { actual.min = num; actual.minN = n; }
              if (n > actual.maxN) { actual.max = num; actual.maxN = n; }
            }
          }
          let fila = 27;
          for (const [serie, r] of porSerie) {
            XLSX.utils.sheet_add_aoa(ws1, [[empresa, r.min, r.max, serie]], { origin: `A${fila}` });
            fila++;
          }
        }

      } else if (tipo === "credito") {
        // Plantilla oficial de Crédito Fiscal IVA: se llena la plantilla real
        // de la DGI (mismo criterio que Planilla de Ingresos e ISC) en vez de
        // reconstruir la hoja desde cero, para preservar estructura y metadatos.
        const compras = (datos.compras ?? []).filter(c => c.iva_total > 0);
        const respIva = await fetch("/plantillas-vet/dgi-credito-fiscal-iva.xlsx");
        if (!respIva.ok) throw new Error("No se encontró la plantilla oficial en /plantillas-vet");
        wb = XLSX.read(await respIva.arrayBuffer(), { type: "array", cellStyles: true });
        const wsIva = wb.Sheets["CREDITO FISCAL IVA"];
        if (!wsIva) throw new Error("La plantilla oficial no tiene la hoja esperada");

        let filaIva = 2; // los datos inician bajo el encabezado de la fila 1
        for (const c of compras) {
          const fp = c.fecha_compra?.split("-") ?? [];
          const fecha = fp.length === 3 ? `${fp[2]}/${fp[1]}/${fp[0]}` : c.fecha_compra;
          XLSX.utils.sheet_add_aoa(wsIva, [[
            c.proveedor_ruc,
            c.proveedor_nombre,
            c.numero_factura_proveedor ?? c.numero_compra,
            "Compra de bienes y servicios",
            fecha,
            c.subtotal,
            c.iva_total,
            "105",
          ]], { origin: `A${filaIva}` });
          filaIva++;
        }

      } else if (tipo === "retenciones") {
        // Plantilla oficial de Retenciones en la Fuente: mismo criterio —
        // se llena el archivo real de la DGI fila por fila.
        const compras = (datos.compras ?? []).filter(c => c.retencion_ir > 0);
        const respRet = await fetch("/plantillas-vet/dgi-retenciones-fuente.xlsx");
        if (!respRet.ok) throw new Error("No se encontró la plantilla oficial en /plantillas-vet");
        wb = XLSX.read(await respRet.arrayBuffer(), { type: "array", cellStyles: true });
        const wsRet = wb.Sheets["Hoja1"];
        if (!wsRet) throw new Error("La plantilla oficial no tiene la hoja esperada");

        let filaRet = 2; // los datos inician bajo el encabezado de la fila 1
        for (const c of compras) {
          const fp = c.fecha_compra?.split("-") ?? [];
          const fecha = fp.length === 3 ? `${fp[2]}/${fp[1]}/${fp[0]}` : c.fecha_compra;
          const codigo = c.retencion_codigo ?? "22";
          XLSX.utils.sheet_add_aoa(wsRet, [[
            c.proveedor_ruc,
            c.proveedor_nombre,
            c.subtotal,   // Ingresos Brutos Mensuales
            0,             // Valor Cotización INSS — no aplica a retención sobre compras
            0,             // Valor Fondo Pensiones Ahorro — no aplica a retención sobre compras
            c.numero_factura_proveedor ?? c.numero_compra,
            fecha,
            c.subtotal,    // Base Imponible
            c.retencion_ir,
            alicuotaLabel(codigo),
            codigo,
          ]], { origin: `A${filaRet}` });
          filaRet++;
        }

      } else if (tipo === "credito_isc") {
        // Planilla oficial de Crédito Fiscal ISC: se llena la plantilla de la
        // DGI con las compras que registraron ISC desglosado en la factura.
        const compras = (datos.compras ?? []).filter(c => c.isc_total > 0);
        const respIsc = await fetch("/plantillas-vet/dgi-credito-fiscal-isc.xlsx");
        if (!respIsc.ok) throw new Error("No se encontró la plantilla oficial en /plantillas-vet");
        wb = XLSX.read(await respIsc.arrayBuffer(), { type: "array", cellStyles: true });
        const wsIsc = wb.Sheets["CREDITO FISCAL ISC"];
        if (!wsIsc) throw new Error("La plantilla oficial no tiene la hoja esperada");

        let filaIsc = 2; // los datos inician bajo el encabezado de la fila 1
        for (const c of compras) {
          const fp = c.fecha_compra?.split("-") ?? [];
          const fecha = fp.length === 3 ? `${fp[2]}/${fp[1]}/${fp[0]}` : c.fecha_compra;
          XLSX.utils.sheet_add_aoa(wsIsc, [[
            c.proveedor_ruc,
            c.proveedor_nombre,
            c.numero_factura_proveedor ?? c.numero_compra,
            "Compra con ISC",
            fecha,
            c.subtotal,
            c.isc_total,
            "", // Código Impuesto: según catálogo del producto fiscal (completar si aplica)
            "124",
          ]], { origin: `A${filaIsc}` });
          filaIsc++;
        }

      } else if (tipo === "libro_ventas") {
        const ventas = datos.ventas ?? [];
        const headers = ["Fecha","N° Factura","Cliente","RUC / Cédula","Valor Gravable","IVA 15%","Exento","Total Factura"];
        const titleRow = [`Libro de Ventas — ${empresa}`, "", "", "", "", "", "", ""];
        const subtitleRow = [`Período: ${mesNombre} ${datos.anio ?? anioSeleccionado}`, "", "", "", "", "", "", ""];
        // Facturas sin IVA se reportan en la columna Exento, no como gravables
        const rows = ventas.map(v => {
          const fp = v.fecha_emision?.split("-") ?? [];
          const fecha = fp.length === 3 ? `${fp[2]}/${fp[1]}/${fp[0]}` : v.fecha_emision;
          const gravable = v.iva_total > 0 ? v.subtotal : 0;
          const exento   = v.iva_total > 0 ? 0 : v.subtotal;
          return [fecha, v.numero_factura, v.cliente_nombre, v.cliente_ruc, gravable, v.iva_total, exento, v.total];
        });
        const totalRow = ["", "", "", "TOTAL",
          ventas.reduce((s,v)=>s+(v.iva_total > 0 ? v.subtotal : 0),0),
          ventas.reduce((s,v)=>s+v.iva_total,0),
          ventas.reduce((s,v)=>s+(v.iva_total > 0 ? 0 : v.subtotal),0),
          ventas.reduce((s,v)=>s+v.total,0)];
        const ws4 = XLSX.utils.aoa_to_sheet([titleRow, subtitleRow, headers, ...rows, totalRow]);
        ws4["!cols"] = [{ wch: 12 },{ wch: 14 },{ wch: 32 },{ wch: 18 },{ wch: 16 },{ wch: 14 },{ wch: 12 },{ wch: 16 }];
        ws4["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 7 } }];
        applyStyles(ws4 as Record<string, unknown>, 2, 8);
        XLSX.utils.book_append_sheet(wb, ws4, "Libro de Ventas");

      } else if (tipo === "libro_compras") {
        const compras = datos.compras ?? [];
        const headers = ["Fecha","N° Comprobante","Proveedor","RUC Proveedor","Valor sin IVA","IVA Acreditable","Total Compra","IR Retenido","Tipo Proveedor"];
        const titleRow = [`Libro de Compras — ${empresa}`, "", "", "", "", "", "", "", ""];
        const subtitleRow = [`Período: ${mesNombre} ${datos.anio ?? anioSeleccionado}`, "", "", "", "", "", "", "", ""];
        // IR retenido real de cada compra (según su código de retención)
        const rows = compras.map(c => {
          const fp = c.fecha_compra?.split("-") ?? [];
          const fecha = fp.length === 3 ? `${fp[2]}/${fp[1]}/${fp[0]}` : c.fecha_compra;
          return [fecha, c.numero_factura_proveedor ?? c.numero_compra, c.proveedor_nombre, c.proveedor_ruc, c.subtotal, c.iva_total, c.total, c.retencion_ir, c.tipo_proveedor === "natural" ? "Natural" : "Jurídica"];
        });
        const totalRow = ["", "", "", "TOTAL", compras.reduce((s,c)=>s+c.subtotal,0), compras.reduce((s,c)=>s+c.iva_total,0), compras.reduce((s,c)=>s+c.total,0), compras.reduce((s,c)=>s+c.retencion_ir,0), ""];
        const ws5 = XLSX.utils.aoa_to_sheet([titleRow, subtitleRow, headers, ...rows, totalRow]);
        ws5["!cols"] = [{ wch: 12 },{ wch: 16 },{ wch: 32 },{ wch: 18 },{ wch: 16 },{ wch: 16 },{ wch: 14 },{ wch: 14 },{ wch: 14 }];
        ws5["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } }];
        applyStyles(ws5 as Record<string, unknown>, 2, 9);
        XLSX.utils.book_append_sheet(wb, ws5, "Libro de Compras");
      }

      const nombreMesStr = nombreMes(mesSeleccionado);
      XLSX.writeFile(wb, `Siconic_${tipo.toUpperCase()}_${nombreMesStr}_${anioSeleccionado}.xlsx`);
      toast.success(`${label} descargado exitosamente`);

    } catch (err) {
      console.error(err);
      toast.error("Error al generar el reporte");
    } finally {
      setDescargando(null);
    }
  }

  const mesActual = meses[0];
  const ivaPagar  = (mesActual?.ivaVentas ?? 0) - (mesActual?.ivaCompras ?? 0);
  const anios = [new Date().getFullYear(), new Date().getFullYear() - 1];

  const VET_REPORTES = [
    { tipo: "ingresos",    label: "Planilla de Ingresos",     desc: "DMI v2.1 · Gravadas 15%, exentas y rangos de factura por serie",  hdr: "bg-blue-700",   icon: "📊" },
    { tipo: "credito",     label: "Crédito Fiscal IVA",       desc: "Compras con IVA acreditable · Renglón 105",          hdr: "bg-purple-700", icon: "🧾" },
    { tipo: "retenciones", label: "Retenciones en la Fuente", desc: "IR según código de cada compra (22 general 2%, 27 profesionales 10%...)", hdr: "bg-amber-700",  icon: "📋" },
    { tipo: "credito_isc", label: "Crédito Fiscal ISC",       desc: "Compras con ISC desglosado · Plantilla oficial DGI",  hdr: "bg-rose-800",   icon: "⛽" },
  ];

  const LIBROS = [
    { tipo: "libro_ventas",  label: "Libro de Ventas",  desc: "Detalle completo de facturas emitidas del período", hdr: "bg-green-700", icon: "📗" },
    { tipo: "libro_compras", label: "Libro de Compras", desc: "Detalle completo de compras recibidas del período", hdr: "bg-teal-700",  icon: "📘" },
  ];

  function ReporteCard({ tipo, label, desc, hdr, icon }: { tipo: string; label: string; desc: string; hdr: string; icon: string }) {
    const isDownloading = descargando === tipo;
    const isPreviewing  = loadingPreview === tipo;
    return (
      <div className="card border-2 hover:border-brand-400 transition-colors">
        <div className="text-2xl mb-3">{icon}</div>
        <h3 className="font-semibold text-slate-900 mb-1">{label}</h3>
        <p className="text-slate-400 text-xs mb-4">{desc}</p>
        <div className="flex gap-2">
          <button
            onClick={() => previsualizarReporte(tipo, label)}
            disabled={isPreviewing || isDownloading}
            className="flex-1 border border-slate-300 text-slate-700 py-2 px-3 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            {isPreviewing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
            Preview
          </button>
          <button
            onClick={() => descargarReporte(tipo, label)}
            disabled={isDownloading || isPreviewing}
            className={`flex-1 ${hdr} text-white py-2 px-3 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity disabled:opacity-50`}
          >
            {isDownloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            Excel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Modal Preview */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.55)" }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            {/* Header modal */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <div>
                <h2 className="font-display font-bold text-slate-900">{preview.label}</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {preview.datos.empresa?.nombre} · {nombreMes(mesSeleccionado)} {anioSeleccionado}
                </p>
              </div>
              <button onClick={() => setPreview(null)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* Body scrollable */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              <PreviewContent tipo={preview.tipo} datos={preview.datos} />
            </div>
            {/* Footer modal */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100">
              <button onClick={() => setPreview(null)} className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">
                Cerrar
              </button>
              <button
                onClick={() => { descargarReporte(preview.tipo, preview.label, preview.datos); setPreview(null); }}
                disabled={descargando === preview.tipo}
                className="px-4 py-2 text-sm font-medium bg-blue-700 text-white rounded-lg hover:bg-blue-800 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {descargando === preview.tipo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Descargar Excel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-8">
        <h1 className="font-display text-2xl font-bold text-slate-900">Reportes DGI</h1>
        <p className="text-slate-500 text-sm mt-1">
          Reportes compatibles con la Ventanilla Electrónica Tributaria (VET) — DMI v2.1
        </p>
      </div>

      {/* Selector de período */}
      <div className="card mb-6 flex items-center gap-4 flex-wrap">
        <div>
          <label className="label">Mes</label>
          <select className="input w-40" value={mesSeleccionado} onChange={e => setMesSeleccionado(Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
              <option key={m} value={m}>{nombreMes(m)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Año</label>
          <select className="input w-28" value={anioSeleccionado} onChange={e => setAnioSeleccionado(Number(e.target.value))}>
            {anios.map(a => <option key={a}>{a}</option>)}
          </select>
        </div>
        <div className="pt-5 text-slate-500 text-sm">
          Período seleccionado: <strong>{nombreMes(mesSeleccionado)} {anioSeleccionado}</strong>
        </div>
      </div>

      {/* Reportes VET */}
      <div className="mb-8">
        <h2 className="font-display text-lg font-bold text-slate-900 mb-1">Archivos para subir al VET</h2>
        <p className="text-slate-500 text-xs mb-4">
          Formato de carga DMI v2.1 — Verifica el primer archivo contra tu plantilla oficial de la VET antes de declararlo en dgienlinea.dgi.gob.ni
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {VET_REPORTES.map(r => <ReporteCard key={r.tipo} {...r} />)}
        </div>
      </div>

      {/* Libros contables */}
      <div className="mb-8">
        <h2 className="font-display text-lg font-bold text-slate-900 mb-1">Libros Contables</h2>
        <p className="text-slate-500 text-xs mb-4">Para tu contador y archivos internos</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {LIBROS.map(r => <ReporteCard key={r.tipo} {...r} />)}
        </div>
      </div>

      {/* Resumen IVA mensual */}
      <div className="card p-0 overflow-hidden">
        <div className="p-5 border-b border-slate-100">
          <h2 className="font-display text-lg font-bold text-slate-900">Resumen IVA — Últimos 6 meses</h2>
          <p className="text-slate-500 text-xs mt-1">Base para la declaración mensual DMI</p>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-7 h-7 border-4 border-brand-200 border-t-brand-700 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  {["Período","Facturas","Total Ventas","IVA Débito","Compras","Total Compras","IVA Crédito","IVA Neto"].map(h => (
                    <th key={h} className="table-header">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {meses.map(m => {
                  const neto = m.ivaVentas - m.ivaCompras;
                  return (
                    <tr key={`${m.anio}-${m.mes}`} className="hover:bg-slate-50">
                      <td className="table-cell font-medium">{nombreMes(m.mes)} {m.anio}</td>
                      <td className="table-cell text-center">{m.totalFacturas}</td>
                      <td className="table-cell">{formatCurrency(m.ventas)}</td>
                      <td className="table-cell text-blue-700 font-medium">{formatCurrency(m.ivaVentas)}</td>
                      <td className="table-cell text-center">{m.totalCompras}</td>
                      <td className="table-cell">{formatCurrency(m.compras)}</td>
                      <td className="table-cell text-purple-700 font-medium">{formatCurrency(m.ivaCompras)}</td>
                      <td className={`table-cell font-bold ${neto >= 0 ? "text-red-700" : "text-green-700"}`}>
                        {neto >= 0 ? "Por pagar: " : "Saldo a favor: "}{formatCurrency(Math.abs(neto))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Nota informativa */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <BarChart3 className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-800">
            <p className="font-semibold mb-2">Instrucciones para presentar en la DGI</p>
            <ol className="space-y-1 text-xs list-decimal list-inside">
              <li>Selecciona el mes y año del período a declarar</li>
              <li>Usa <strong>Preview</strong> para revisar los datos antes de descargar</li>
              <li>Descarga la <strong>Planilla de Ingresos</strong> y el <strong>Crédito Fiscal IVA</strong></li>
              <li>Si tienes compras a personas naturales, descarga también las <strong>Retenciones</strong></li>
              <li>Ingresa al VET en <strong>dgienlinea.dgi.gob.ni</strong></li>
              <li>En Declaración Mensual → sube cada archivo en su sección correspondiente</li>
              <li>La declaración debe presentarse los primeros <strong>15 días del mes siguiente</strong></li>
            </ol>
          </div>
        </div>
      </div>

      {/* Nota xlsl-js-style */}
      <p className="text-[10px] text-slate-300 mt-4 text-right">
        Requiere <code>xlsx-js-style</code> — ejecuta <code>npm install xlsx-js-style</code> si el Excel no descarga
      </p>
    </div>
  );
}
