"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { formatCurrency, nombreMes } from "@/lib/utils";
import { BarChart3, Download, Eye, FileSpreadsheet, Loader2, X } from "lucide-react";
import { toast } from "sonner";

/* ─── tipos ──────────────────────────────────────────────── */
interface MesData {
  mes: number; anio: number;
  ventas: number; ivaVentas: number;
  compras: number; ivaCompras: number;
  totalFacturas: number; totalCompras: number;
}

interface VentaRow { numero_factura: string; fecha_emision: string; cliente_nombre: string; cliente_ruc: string; subtotal: number; iva_total: number; total: number; }
interface CompraRow { numero_compra: string; fecha_compra: string; proveedor_nombre: string; proveedor_ruc: string; subtotal: number; iva_total: number; total: number; tipo_proveedor: string; }
interface DatosReporte { ventas?: VentaRow[]; compras?: CompraRow[]; empresa: { nombre: string; ruc: string }; mes: number; anio: number; }

/* ─── estilos xlsx-js-style ──────────────────────────────── */
const THIN = { style: "thin", color: { rgb: "CBD5E0" } };
const BORDER = { top: THIN, bottom: THIN, left: THIN, right: THIN };
const S_HDR = { font: { bold: true, color: { rgb: "FFFFFF" }, sz: 10, name: "Calibri" }, fill: { patternType: "solid", fgColor: { rgb: "1B3A5C" } }, alignment: { horizontal: "center", vertical: "center" }, border: BORDER };
const S_SUBHDR = { font: { bold: true, sz: 10, name: "Calibri" }, fill: { patternType: "solid", fgColor: { rgb: "2E6DA4" }, }, alignment: { horizontal: "left", vertical: "center" }, border: BORDER };
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
    const baseIVA   = ventas.reduce((s, v) => s + v.subtotal, 0);
    const totalBruto = ventas.reduce((s, v) => s + v.total, 0);
    const resumen = [
      ["Base Imponible para IVA",           baseIVA],
      ["Ingresos gravados del mes (15%)",   baseIVA],
      ["Base Imponible PMD / Anticipo",     totalBruto],
      ["Ingresos brutos del mes",           totalBruto],
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
    return (
      <div>
        <p className="text-xs text-slate-500 mb-3">Crédito Fiscal IVA — Renglón 105</p>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-xs">
            <thead><tr className="bg-purple-800 text-white">
              {["RUC","Nombre / Razón Social","N° Documento","Fecha","Sin IVA","IVA","Renglón"].map(h => <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}
            </tr></thead>
            <tbody>
              {compras.length === 0
                ? <tr><td colSpan={7} className="text-center py-6 text-slate-400">Sin compras con IVA en este período</td></tr>
                : compras.map((c, i) => {
                    const fp = c.fecha_compra?.split("-") ?? [];
                    const fecha = fp.length === 3 ? `${fp[2]}/${fp[1]}/${fp[0].slice(2)}` : c.fecha_compra;
                    return (
                      <tr key={i} className={i % 2 === 0 ? "bg-purple-50" : "bg-white"}>
                        <td className="px-3 py-1.5 font-mono">{c.proveedor_ruc}</td>
                        <td className="px-3 py-1.5 max-w-[160px] truncate">{c.proveedor_nombre}</td>
                        <td className="px-3 py-1.5 font-mono">{c.numero_compra}</td>
                        <td className="px-3 py-1.5">{fecha}</td>
                        <td className="px-3 py-1.5 text-right">{formatCurrency(c.subtotal)}</td>
                        <td className="px-3 py-1.5 text-right text-purple-700">{formatCurrency(c.iva_total)}</td>
                        <td className="px-3 py-1.5 text-center">105</td>
                      </tr>
                    );
                  })}
              {compras.length > 0 && (
                <tr className="bg-purple-100 font-semibold">
                  <td colSpan={4} className="px-3 py-2 text-right text-xs text-slate-600">TOTALES</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(compras.reduce((s,c)=>s+c.subtotal,0))}</td>
                  <td className="px-3 py-2 text-right text-purple-700">{formatCurrency(compras.reduce((s,c)=>s+c.iva_total,0))}</td>
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
    const naturales = compras.filter(c => c.tipo_proveedor === "natural");
    return (
      <div>
        <p className="text-xs text-slate-500 mb-3">Retenciones en la Fuente IR 2% — Código 22 · Personas naturales</p>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-xs">
            <thead><tr className="bg-amber-700 text-white">
              {["RUC","Nombre","N° Documento","Fecha","Base Imponible","IR 2%","Cód"].map(h => <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}
            </tr></thead>
            <tbody>
              {naturales.length === 0
                ? <tr><td colSpan={7} className="text-center py-6 text-slate-400">Sin compras a personas naturales en este período</td></tr>
                : naturales.map((c, i) => {
                    const fp = c.fecha_compra?.split("-") ?? [];
                    const fecha = fp.length === 3 ? `${fp[2]}/${fp[1]}/${fp[0].slice(2)}` : c.fecha_compra;
                    const ir = +(c.subtotal * 0.02).toFixed(2);
                    return (
                      <tr key={i} className={i % 2 === 0 ? "bg-amber-50" : "bg-white"}>
                        <td className="px-3 py-1.5 font-mono">{c.proveedor_ruc}</td>
                        <td className="px-3 py-1.5 max-w-[160px] truncate">{c.proveedor_nombre}</td>
                        <td className="px-3 py-1.5 font-mono">{c.numero_compra}</td>
                        <td className="px-3 py-1.5">{fecha}</td>
                        <td className="px-3 py-1.5 text-right">{formatCurrency(c.subtotal)}</td>
                        <td className="px-3 py-1.5 text-right text-amber-700 font-medium">{formatCurrency(ir)}</td>
                        <td className="px-3 py-1.5 text-center">22</td>
                      </tr>
                    );
                  })}
              {naturales.length > 0 && (
                <tr className="bg-amber-100 font-semibold">
                  <td colSpan={4} className="px-3 py-2 text-right text-xs text-slate-600">TOTALES</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(naturales.reduce((s,c)=>s+c.subtotal,0))}</td>
                  <td className="px-3 py-2 text-right text-amber-700">{formatCurrency(naturales.reduce((s,c)=>s+(c.subtotal*0.02),0))}</td>
                  <td />
                </tr>
              )}
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
                        <td className="px-3 py-1.5 text-right">{formatCurrency(v.subtotal)}</td>
                        <td className="px-3 py-1.5 text-right text-green-700">{formatCurrency(v.iva_total)}</td>
                        <td className="px-3 py-1.5 text-right">C$0.00</td>
                        <td className="px-3 py-1.5 text-right font-medium">{formatCurrency(v.total)}</td>
                      </tr>
                    );
                  })}
              {ventas.length > 0 && (
                <tr className="bg-green-100 font-semibold">
                  <td colSpan={4} className="px-3 py-2 text-right text-xs text-slate-600">TOTALES</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(ventas.reduce((s,v)=>s+v.subtotal,0))}</td>
                  <td className="px-3 py-2 text-right text-green-700">{formatCurrency(ventas.reduce((s,v)=>s+v.iva_total,0))}</td>
                  <td className="px-3 py-2 text-right">C$0.00</td>
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
              {["Fecha","N° Comprobante","Proveedor","RUC","Sin IVA","IVA","Total","IR 2%","Tipo"].map(h => <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}
            </tr></thead>
            <tbody>
              {compras.length === 0
                ? <tr><td colSpan={9} className="text-center py-6 text-slate-400">Sin compras en este período</td></tr>
                : compras.map((c, i) => {
                    const fp = c.fecha_compra?.split("-") ?? [];
                    const fecha = fp.length === 3 ? `${fp[2]}/${fp[1]}/${fp[0]}` : c.fecha_compra;
                    const ir = c.tipo_proveedor === "natural" ? +(c.subtotal * 0.02).toFixed(2) : 0;
                    return (
                      <tr key={i} className={i % 2 === 0 ? "bg-teal-50" : "bg-white"}>
                        <td className="px-3 py-1.5">{fecha}</td>
                        <td className="px-3 py-1.5 font-mono">{c.numero_compra}</td>
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
                  <td className="px-3 py-2 text-right text-amber-700">{formatCurrency(compras.filter(c=>c.tipo_proveedor==="natural").reduce((s,c)=>s+(c.subtotal*0.02),0))}</td>
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
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [{ data: en }, { data: ej }] = await Promise.all([
        supabase.from("empresas_persona_natural").select("id").eq("user_id", user.id).maybeSingle(),
        supabase.from("empresas_juridicas").select("id").eq("user_id", user.id).maybeSingle(),
      ]);
      const ids = [en?.id, ej?.id].filter(Boolean) as string[];

      const now = new Date();
      const promises = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const mes = d.getMonth() + 1;
        const anio = d.getFullYear();
        const firstDay = `${anio}-${String(mes).padStart(2,"0")}-01`;
        const lastDay  = new Date(anio, mes, 0).toISOString().split("T")[0];
        if (!ids.length) return Promise.resolve({ mes, anio, ventas:0, ivaVentas:0, compras:0, ivaCompras:0, totalFacturas:0, totalCompras:0 });

        return Promise.all([
          supabase.from("facturas").select("total, iva_total").in("empresa_id", ids).gte("fecha_emision", firstDay).lte("fecha_emision", lastDay).eq("estado","emitida"),
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
      const wb = XLSX.utils.book_new();
      const mesNombre = nombreMes(datos.mes ?? mesSeleccionado);
      const empresa = datos.empresa?.nombre ?? "SARA ERP";

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
        const subtotal = ventas.reduce((s,v) => s + v.subtotal, 0);
        const total    = ventas.reduce((s,v) => s + v.total, 0);

        const wsData: (string | number)[][] = [
          ["Concepto", "1.- Valor de Ingresos mensuales"],
          ["Base Imponible para determinar el IVA", subtotal],
          ["Ingresos gravados del mes (tasa 15%)", subtotal],
          ["Ingresos del mes por distribución de energía eléctrica subsidiada (tasa 7%)", 0],
          ["Ingresos por exportación de bienes tangibles", 0],
          ["Ingresos por exportación de bienes intangibles", 0],
          ["Ingresos del mes exentos", 0],
          ["Ingresos del mes exonerados", 0],
          ["Base Imponible para determinar ISC", 0],
          ["Ingresos por enajenación de productos derivados del petróleo", 0],
          ["Ingresos por enajenación de azúcar", 0],
          ["Ingreso por enajenación de bienes de la Industria Fiscal", 0],
          ["Ingresos por enajenación de otros bienes de Fabricación Nacional", 0],
          ["Ingresos por enajenación de bienes importados de la Industria Fiscal", 0],
          ["Ingresos por exportación de bienes gravados con tasa 0%", 0],
          ["Base gravable de ISC-IMI para empresas generadoras de energía eléctrica", 0],
          ["Base Gravable de ISC-IMI para empresas distribuidoras de energía eléctrica", 0],
          ["Ingresos por operaciones exoneradas", 0],
          ["Base Imponible para determinar PMD o Anticipo", total],
          ["Ingresos brutos del mes", total],
          ["Total Ingreso por margen de comercialización", 0],
          ["Utilidades del mes", 0],
          ["Base Imponible para determinar impuesto Casino", 0],
          ["Total máquinas de juegos", 0],
          ["Cantidad de mesas de juego", 0],
          ["Sucursales", "Factura inicial", "Factura final", "Serie"],
        ];

        if (ventas.length > 0) {
          const nums = ventas.map(v => v.numero_factura).sort();
          const serie = nums[0].includes("-") ? nums[0].split("-")[0] : "";
          wsData.push([empresa, nums[0], nums[nums.length - 1], serie]);
        }
        for (let i = 0; i < 4; i++) wsData.push(["", "", "", ""]);

        const ws1 = XLSX.utils.aoa_to_sheet(wsData);
        ws1["!cols"] = [{ wch: 55 }, { wch: 22 }, { wch: 22 }, { wch: 22 }];
        // Style header rows (row 0 = "Concepto", row 25 = "Sucursales")
        const hdrStyle = S_HDR;
        const subHdr = S_SUBHDR;
        const range1 = XLSX.utils.decode_range(ws1["!ref"] as string);
        for (let R = range1.s.r; R <= range1.e.r; R++) {
          for (let C = range1.s.c; C <= range1.e.c; C++) {
            const addr = XLSX.utils.encode_cell({ r: R, c: C });
            const cell = (ws1 as Record<string, Record<string, unknown>>)[addr];
            if (!cell) continue;
            if (R === 0 || R === 25) cell.s = hdrStyle;
            else if (R === 26) cell.s = subHdr;
            else cell.s = R % 2 === 0 ? S_ODD : S_EVEN;
          }
        }
        XLSX.utils.book_append_sheet(wb, ws1, "Con 25 filas y Datos de Factura");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), "Hoja1");

      } else if (tipo === "credito") {
        const compras = datos.compras ?? [];
        const headers = ["Numero RUC","Nombre y Apellido o Razon Social","Numero Documento","Descripcion del Pago","Fecha de Emision de Documento","Ingreso sin IVA","Monto IVA Trasladado","Codigo Renglon"];
        const rows = compras.map(c => {
          const fp = c.fecha_compra?.split("-") ?? [];
          const fecha = fp.length === 3 ? `${fp[2]}/${fp[1]}/${fp[0].slice(2)}` : c.fecha_compra;
          return [c.proveedor_ruc, c.proveedor_nombre, c.numero_compra, "Compra de bienes y servicios", fecha, c.subtotal, c.iva_total, "105"];
        });
        const totalRow = ["", "TOTAL", "", "", "", compras.reduce((s,c)=>s+c.subtotal,0), compras.reduce((s,c)=>s+c.iva_total,0), ""];
        const ws2 = XLSX.utils.aoa_to_sheet([headers, ...rows, totalRow]);
        ws2["!cols"] = [{ wch: 18 },{ wch: 35 },{ wch: 20 },{ wch: 30 },{ wch: 20 },{ wch: 16 },{ wch: 16 },{ wch: 12 }];
        applyStyles(ws2 as Record<string, unknown>, 0, 8);
        XLSX.utils.book_append_sheet(wb, ws2, "CREDITO FISCAL IVA");

      } else if (tipo === "retenciones") {
        const compras = datos.compras ?? [];
        const headers = ["No. RUC","NOMBRE Y APELLIDOS Ó RAZÓN SOCIAL","INGRESOS BRUTOS MENSUALES","VALOR COTIZACIÓN INSS","VALOR FONDO PENSIONES AHORRO","NÚMERO DE DOCUMENTO","FECHA DE DOCUMENTO","BASE IMPONIBLE","VALOR RETENIDO","ALÍCUOTA DE RETENCIÓN","CÓDIGO DE RETENCIÓN"];
        const rows = compras.filter(c => c.tipo_proveedor === "natural").map(c => {
          const fp = c.fecha_compra?.split("-") ?? [];
          const fecha = fp.length === 3 ? `${fp[2]}/${fp[1]}/${fp[0].slice(2)}` : c.fecha_compra;
          return [c.proveedor_ruc, c.proveedor_nombre, c.subtotal, 0, 0, c.numero_compra, fecha, c.subtotal, +(c.subtotal * 0.02).toFixed(2), "2%", "22"];
        });
        const ws3 = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        ws3["!cols"] = [{ wch: 18 },{ wch: 35 },{ wch: 18 },{ wch: 18 },{ wch: 18 },{ wch: 20 },{ wch: 15 },{ wch: 15 },{ wch: 15 },{ wch: 12 },{ wch: 12 }];
        applyStyles(ws3 as Record<string, unknown>, 0, 11);
        XLSX.utils.book_append_sheet(wb, ws3, "Hoja1");

      } else if (tipo === "libro_ventas") {
        const ventas = datos.ventas ?? [];
        const headers = ["Fecha","N° Factura","Cliente","RUC / Cédula","Valor Gravable","IVA 15%","Exento","Total Factura"];
        const titleRow = [`Libro de Ventas — ${empresa}`, "", "", "", "", "", "", ""];
        const subtitleRow = [`Período: ${mesNombre} ${datos.anio ?? anioSeleccionado}`, "", "", "", "", "", "", ""];
        const rows = ventas.map(v => {
          const fp = v.fecha_emision?.split("-") ?? [];
          const fecha = fp.length === 3 ? `${fp[2]}/${fp[1]}/${fp[0]}` : v.fecha_emision;
          return [fecha, v.numero_factura, v.cliente_nombre, v.cliente_ruc, v.subtotal, v.iva_total, 0, v.total];
        });
        const totalRow = ["", "", "", "TOTAL", ventas.reduce((s,v)=>s+v.subtotal,0), ventas.reduce((s,v)=>s+v.iva_total,0), 0, ventas.reduce((s,v)=>s+v.total,0)];
        const ws4 = XLSX.utils.aoa_to_sheet([titleRow, subtitleRow, headers, ...rows, totalRow]);
        ws4["!cols"] = [{ wch: 12 },{ wch: 14 },{ wch: 32 },{ wch: 18 },{ wch: 16 },{ wch: 14 },{ wch: 12 },{ wch: 16 }];
        ws4["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 7 } }];
        applyStyles(ws4 as Record<string, unknown>, 2, 8);
        XLSX.utils.book_append_sheet(wb, ws4, "Libro de Ventas");

      } else if (tipo === "libro_compras") {
        const compras = datos.compras ?? [];
        const headers = ["Fecha","N° Comprobante","Proveedor","RUC Proveedor","Valor sin IVA","IVA Acreditable","Total Compra","IR Retenido 2%","Tipo Proveedor"];
        const titleRow = [`Libro de Compras — ${empresa}`, "", "", "", "", "", "", "", ""];
        const subtitleRow = [`Período: ${mesNombre} ${datos.anio ?? anioSeleccionado}`, "", "", "", "", "", "", "", ""];
        const rows = compras.map(c => {
          const fp = c.fecha_compra?.split("-") ?? [];
          const fecha = fp.length === 3 ? `${fp[2]}/${fp[1]}/${fp[0]}` : c.fecha_compra;
          const ir = c.tipo_proveedor === "natural" ? +(c.subtotal * 0.02).toFixed(2) : 0;
          return [fecha, c.numero_compra, c.proveedor_nombre, c.proveedor_ruc, c.subtotal, c.iva_total, c.total, ir, c.tipo_proveedor === "natural" ? "Natural" : "Jurídica"];
        });
        const totalRow = ["", "", "", "TOTAL", compras.reduce((s,c)=>s+c.subtotal,0), compras.reduce((s,c)=>s+c.iva_total,0), compras.reduce((s,c)=>s+c.total,0), compras.filter(c=>c.tipo_proveedor==="natural").reduce((s,c)=>s+(c.subtotal*0.02),0), ""];
        const ws5 = XLSX.utils.aoa_to_sheet([titleRow, subtitleRow, headers, ...rows, totalRow]);
        ws5["!cols"] = [{ wch: 12 },{ wch: 16 },{ wch: 32 },{ wch: 18 },{ wch: 16 },{ wch: 16 },{ wch: 14 },{ wch: 14 },{ wch: 14 }];
        ws5["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } }];
        applyStyles(ws5 as Record<string, unknown>, 2, 9);
        XLSX.utils.book_append_sheet(wb, ws5, "Libro de Compras");
      }

      const nombreMesStr = nombreMes(mesSeleccionado);
      XLSX.writeFile(wb, `SARA_${tipo.toUpperCase()}_${nombreMesStr}_${anioSeleccionado}.xlsx`);
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
    { tipo: "ingresos",    label: "Planilla de Ingresos",     desc: "DMI-V2.0 · Ventas gravadas 15% · Ingresos brutos",  hdr: "bg-blue-700",   icon: "📊" },
    { tipo: "credito",     label: "Crédito Fiscal IVA",       desc: "Compras con IVA acreditable · Renglón 105",          hdr: "bg-purple-700", icon: "🧾" },
    { tipo: "retenciones", label: "Retenciones en la Fuente", desc: "IR 2% sobre compras a personas naturales · Cód. 22", hdr: "bg-amber-700",  icon: "📋" },
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
          Reportes compatibles con la Ventanilla Electrónica Tributaria (VET) — DMI v2.0
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
        <p className="text-slate-500 text-xs mb-4">Formato exacto DMI v2.0 — Súbelos directamente en dgienlinea.dgi.gob.ni</p>
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
