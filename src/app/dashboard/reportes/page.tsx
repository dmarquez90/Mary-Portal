"use client";
export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { formatCurrency, nombreMes } from "@/lib/utils";
import { BarChart3, Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface MesData {
  mes: number; anio: number;
  ventas: number; ivaVentas: number;
  compras: number; ivaCompras: number;
  totalFacturas: number; totalCompras: number;
}

export default function ReportesPage() {
  const [meses,   setMeses]   = useState<MesData[]>([]);
  const [loading, setLoading] = useState(true);
  const [mesSeleccionado, setMesSeleccionado] = useState(new Date().getMonth() + 1);
  const [anioSeleccionado, setAnioSeleccionado] = useState(new Date().getFullYear());
  const [descargando, setDescargando] = useState<string | null>(null);

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

  async function descargarReporte(tipo: string, label: string) {
    setDescargando(tipo);
    try {
      // 1. Obtener datos del servidor
      const res = await fetch(`/api/reportes/dgi?tipo=${tipo}&mes=${mesSeleccionado}&anio=${anioSeleccionado}`);
      if (!res.ok) throw new Error("Error al obtener datos");
      const datos = await res.json();

      // 2. Generar Excel en el cliente usando SheetJS
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();

      if (tipo === "ingresos" || tipo === "ventas") {
        // ── Planilla de Ingresos (formato VET) ──
        const wsData: (string | number)[][] = [
          // Encabezado fijo DGI
          ["Concepto", "1.- Valor de Ingresos mensuales"],
          ["Base Imponible para determinar el IVA", datos.ventas?.reduce((s: number, v: { subtotal: number }) => s + v.subtotal, 0) ?? 0],
          ["Ingresos gravados del mes (tasa 15%)", datos.ventas?.reduce((s: number, v: { subtotal: number }) => s + v.subtotal, 0) ?? 0],
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
          ["Base Imponible para determinar PMD o Anticipo", datos.ventas?.reduce((s: number, v: { total: number }) => s + v.total, 0) ?? 0],
          ["Ingresos brutos del mes", datos.ventas?.reduce((s: number, v: { total: number }) => s + v.total, 0) ?? 0],
          ["Total Ingreso por margen de comercialización", 0],
          ["Utilidades del mes", 0],
          ["Base Imponible para determinar impuesto Casino", 0],
          ["Total máquinas de juegos", 0],
          ["Cantidad de mesas de juego", 0],
          // Sucursales
          ["Sucursales", "Factura inicial", "Factura final", "Serie"],
        ];

        // Agregar rango de facturas
        if (datos.ventas?.length > 0) {
          const nums = datos.ventas.map((v: { numero_factura: string }) => v.numero_factura).sort();
          const serie = nums[0].includes("-") ? nums[0].split("-")[0] : "";
          wsData.push([datos.empresa.nombre, nums[0], nums[nums.length-1], serie]);
        }
        // 4 filas vacías (DGI pide 25 sucursales)
        for (let i = 0; i < 4; i++) wsData.push(["", "", "", ""]);

        const ws1 = XLSX.utils.aoa_to_sheet(wsData);
        ws1["!cols"] = [{wch:55},{wch:22},{wch:22},{wch:22}];
        XLSX.utils.book_append_sheet(wb, ws1, "Con 25 filas y Datos de Factura");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), "Hoja1");

      } else if (tipo === "credito") {
        // ── Crédito Fiscal IVA (Libro de Compras VET) ──
        const headers = ["Numero RUC","Nombre y Apellido o Razon Social","Numero Documento","Descripcion del Pago","Fecha de Emision de Documento","Ingreso sin IVA","Monto IVA Trasladado","Codigo Renglon"];
        const rows = (datos.compras ?? []).map((c: { proveedor_ruc: string; proveedor_nombre: string; numero_compra: string; fecha_compra: string; subtotal: number; iva_total: number }) => {
          const fp = c.fecha_compra?.split("-") ?? [];
          const fecha = fp.length === 3 ? `${fp[2]}/${fp[1]}/${fp[0].slice(2)}` : c.fecha_compra;
          return [c.proveedor_ruc, c.proveedor_nombre, c.numero_compra, "Compra de bienes y servicios", fecha, c.subtotal, c.iva_total, "105"];
        });
        const ws2 = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        ws2["!cols"] = [{wch:18},{wch:35},{wch:20},{wch:30},{wch:20},{wch:16},{wch:16},{wch:12}];
        XLSX.utils.book_append_sheet(wb, ws2, "CREDITO FISCAL IVA");

      } else if (tipo === "retenciones") {
        // ── Planilla de Retenciones ──
        const headers = ["No. RUC","NOMBRE Y APELLIDOS Ó RAZÓN SOCIAL","INGRESOS BRUTOS MENSUALES","VALOR COTIZACIÓN INSS","VALOR FONDO PENSIONES AHORRO","NÚMERO DE DOCUMENTO","FECHA DE DOCUMENTO","BASE IMPONIBLE","VALOR RETENIDO","ALÍCUOTA DE RETENCIÓN","CÓDIGO DE RETENCIÓN"];
        const rows = (datos.compras ?? [])
          .filter((c: { tipo_proveedor: string }) => c.tipo_proveedor === "natural")
          .map((c: { proveedor_ruc: string; proveedor_nombre: string; subtotal: number; numero_compra: string; fecha_compra: string }) => {
            const fp = c.fecha_compra?.split("-") ?? [];
            const fecha = fp.length === 3 ? `${fp[2]}/${fp[1]}/${fp[0].slice(2)}` : c.fecha_compra;
            return [c.proveedor_ruc, c.proveedor_nombre, c.subtotal, 0, 0, c.numero_compra, fecha, c.subtotal, +(c.subtotal * 0.02).toFixed(2), "2%", "22"];
          });
        const ws3 = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        ws3["!cols"] = [{wch:18},{wch:35},{wch:18},{wch:18},{wch:18},{wch:20},{wch:15},{wch:15},{wch:15},{wch:12},{wch:12}];
        XLSX.utils.book_append_sheet(wb, ws3, "Hoja1");

      } else if (tipo === "libro_ventas") {
        // ── Libro de Ventas (resumen para contador) ──
        const headers = ["Fecha","N° Factura","Cliente","RUC / Cédula","Valor Gravable","IVA 15%","Exento","Total Factura"];
        const rows = (datos.ventas ?? []).map((v: { fecha_emision: string; numero_factura: string; cliente_nombre: string; cliente_ruc: string; subtotal: number; iva_total: number; total: number }) => {
          const fp = v.fecha_emision?.split("-") ?? [];
          const fecha = fp.length === 3 ? `${fp[2]}/${fp[1]}/${fp[0]}` : v.fecha_emision;
          return [fecha, v.numero_factura, v.cliente_nombre, v.cliente_ruc, v.subtotal, v.iva_total, 0, v.total];
        });
        const ws4 = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        ws4["!cols"] = [{wch:12},{wch:14},{wch:32},{wch:18},{wch:16},{wch:14},{wch:12},{wch:16}];
        XLSX.utils.book_append_sheet(wb, ws4, "Libro de Ventas");

      } else if (tipo === "libro_compras") {
        // ── Libro de Compras (resumen para contador) ──
        const headers = ["Fecha","N° Comprobante","Proveedor","RUC Proveedor","Valor sin IVA","IVA Acreditable","Total Compra","IR Retenido 2%","Tipo Proveedor"];
        const rows = (datos.compras ?? []).map((c: { fecha_compra: string; numero_compra: string; proveedor_nombre: string; proveedor_ruc: string; subtotal: number; iva_total: number; total: number; tipo_proveedor: string }) => {
          const fp = c.fecha_compra?.split("-") ?? [];
          const fecha = fp.length === 3 ? `${fp[2]}/${fp[1]}/${fp[0]}` : c.fecha_compra;
          const ir = c.tipo_proveedor === "natural" ? +(c.subtotal * 0.02).toFixed(2) : 0;
          return [fecha, c.numero_compra, c.proveedor_nombre, c.proveedor_ruc, c.subtotal, c.iva_total, c.total, ir, c.tipo_proveedor === "natural" ? "Natural" : "Jurídica"];
        });
        const ws5 = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        ws5["!cols"] = [{wch:12},{wch:16},{wch:32},{wch:18},{wch:16},{wch:16},{wch:14},{wch:14},{wch:14}];
        XLSX.utils.book_append_sheet(wb, ws5, "Libro de Compras");
      }

      // 3. Descargar
      const nombreMesStr = nombreMes(mesSeleccionado);
      const filename = `SARA_${tipo.toUpperCase()}_${nombreMesStr}_${anioSeleccionado}.xlsx`;
      XLSX.writeFile(wb, filename);
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

  return (
    <div>
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
            {Array.from({length: 12}, (_, i) => i + 1).map(m => (
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
        <h2 className="font-display text-lg font-bold text-slate-900 mb-1">
          Archivos para subir al VET
        </h2>
        <p className="text-slate-500 text-xs mb-4">
          Formato exacto DMI v2.0 — Súbelos directamente en dgienlinea.dgi.gob.ni
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { tipo: "ingresos",    label: "Planilla de Ingresos",         desc: "DMI-V2.0 · Ventas gravadas 15% · Ingresos brutos",   color: "bg-blue-700",   icon: "📊" },
            { tipo: "credito",     label: "Crédito Fiscal IVA",           desc: "Compras con IVA acreditable · Renglón 105",           color: "bg-purple-700", icon: "🧾" },
            { tipo: "retenciones", label: "Retenciones en la Fuente",     desc: "IR 2% sobre compras a personas naturales · Cód. 22",  color: "bg-amber-700",  icon: "📋" },
          ].map(r => (
            <div key={r.tipo} className="card border-2 hover:border-brand-400 transition-colors">
              <div className="text-2xl mb-3">{r.icon}</div>
              <h3 className="font-semibold text-slate-900 mb-1">{r.label}</h3>
              <p className="text-slate-400 text-xs mb-4">{r.desc}</p>
              <button
                onClick={() => descargarReporte(r.tipo, r.label)}
                disabled={descargando === r.tipo}
                className={`${r.color} text-white w-full py-2 px-4 rounded-lg text-sm font-medium flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50`}
              >
                {descargando === r.tipo
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Generando...</>
                  : <><Download className="w-4 h-4" /> Descargar Excel</>
                }
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Libros contables */}
      <div className="mb-8">
        <h2 className="font-display text-lg font-bold text-slate-900 mb-1">
          Libros Contables
        </h2>
        <p className="text-slate-500 text-xs mb-4">
          Para tu contador y archivos internos
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { tipo: "libro_ventas",   label: "Libro de Ventas",   desc: "Detalle completo de facturas emitidas del período",  color: "bg-green-700",  icon: "📗" },
            { tipo: "libro_compras",  label: "Libro de Compras",  desc: "Detalle completo de compras recibidas del período",  color: "bg-teal-700",   icon: "📘" },
          ].map(r => (
            <div key={r.tipo} className="card border-2 hover:border-brand-400 transition-colors">
              <div className="text-2xl mb-3">{r.icon}</div>
              <h3 className="font-semibold text-slate-900 mb-1">{r.label}</h3>
              <p className="text-slate-400 text-xs mb-4">{r.desc}</p>
              <button
                onClick={() => descargarReporte(r.tipo, r.label)}
                disabled={descargando === r.tipo}
                className={`${r.color} text-white w-full py-2 px-4 rounded-lg text-sm font-medium flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50`}
              >
                {descargando === r.tipo
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Generando...</>
                  : <><FileSpreadsheet className="w-4 h-4" /> Descargar Excel</>
                }
              </button>
            </div>
          ))}
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
                  <th className="table-header">Período</th>
                  <th className="table-header">Facturas</th>
                  <th className="table-header">Total Ventas</th>
                  <th className="table-header">IVA Débito</th>
                  <th className="table-header">Compras</th>
                  <th className="table-header">Total Compras</th>
                  <th className="table-header">IVA Crédito</th>
                  <th className="table-header">IVA Neto</th>
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
              <li>Descarga la <strong>Planilla de Ingresos</strong> y el <strong>Crédito Fiscal IVA</strong></li>
              <li>Si tienes compras a personas naturales, descarga también las <strong>Retenciones</strong></li>
              <li>Ingresa al VET en <strong>dgienlinea.dgi.gob.ni</strong></li>
              <li>En Declaración Mensual → sube cada archivo en su sección correspondiente</li>
              <li>La declaración debe presentarse los primeros <strong>15 días del mes siguiente</strong></li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
