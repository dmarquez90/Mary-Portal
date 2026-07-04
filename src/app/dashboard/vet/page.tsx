"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { usePermissionsSARA } from "@/hooks/usePermissionsSARA";
import { toast } from "sonner";
import {
  ChevronDown,
  Download,
  FileText,
  Loader2,
  AlertCircle,
  CheckCircle,
  Clock,
} from "lucide-react";
import type {
  ReporteVET,
  AuditoriaExportacionVET,
  Empresa,
  RespuestaPlanillaIngresos,
  RespuestaValidacionVET,
} from "@/types/vet";

// Único código soportado hoy por POST /api/vet/[empresa_id]/planilla-ingresos.
// El resto de reportes VET solo tienen validación implementada (ver route.ts).
const CODIGO_CON_GENERADOR = "PLANILLA_INGRESOS";

function periodoActual() {
  const hoy = new Date();
  const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { periodo_desde: iso(primerDia), periodo_hasta: iso(hoy) };
}

export default function VETPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const empresaIdUrl = searchParams.get("empresa_id") ?? undefined;

  const { loading: permisosLoading, isSuperAdmin, empresaId: empresaSesionId } =
    usePermissionsSARA(empresaIdUrl);

  const [userId, setUserId] = useState<string | null>(null);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [empresaSeleccionada, setEmpresaSeleccionada] = useState<Empresa | null>(null);
  const [reportesVET, setReportesVET] = useState<ReporteVET[]>([]);
  const [auditorias, setAuditorias] = useState<AuditoriaExportacionVET[]>([]);
  const [loading, setLoading] = useState(true);
  const [generandoReporte, setGenerandoReporte] = useState<string | null>(null);
  const [validandoReporte, setValidandoReporte] = useState<string | null>(null);
  const [mostrarSelectEmpresa, setMostrarSelectEmpresa] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    if (permisosLoading) return;

    async function cargarEmpresaDeSesion(id: string) {
      const supabase = createClient();
      const [{ data: ej }, { data: en }] = await Promise.all([
        supabase
          .from("empresas_juridicas")
          .select("id, nombre_empresa, regimen_tributario_id, regimen:regimenes_tributarios(nombre)")
          .eq("id", id)
          .maybeSingle(),
        supabase
          .from("empresas_persona_natural")
          .select("id, nombre_completo, regimen_tributario_id, regimen:regimenes_tributarios(nombre)")
          .eq("id", id)
          .maybeSingle(),
      ]);
      const empresa = (ej ?? en) as unknown as Empresa | null;
      setEmpresaSeleccionada(empresa);
      if (!empresa) setLoading(false);
    }

    async function cargarListaEmpresas() {
      const supabase = createClient();
      const [{ data: juridicas }, { data: naturales }] = await Promise.all([
        supabase
          .from("empresas_juridicas")
          .select("id, nombre_empresa, regimen_tributario_id, regimen:regimenes_tributarios(nombre)")
          .eq("activa", true)
          .eq("suspendida", false),
        supabase
          .from("empresas_persona_natural")
          .select("id, nombre_completo, regimen_tributario_id, regimen:regimenes_tributarios(nombre)")
          .eq("activa", true)
          .eq("suspendida", false),
      ]);
      const lista = [...(juridicas ?? []), ...(naturales ?? [])] as unknown as Empresa[];
      setEmpresas(lista);

      const preseleccion = lista.find((e) => e.id === empresaIdUrl) ?? lista[0] ?? null;
      setEmpresaSeleccionada(preseleccion);
      if (!preseleccion) setLoading(false);
    }

    if (isSuperAdmin) {
      cargarListaEmpresas();
    } else if (empresaSesionId) {
      cargarEmpresaDeSesion(empresaSesionId);
    } else {
      setLoading(false);
    }
    // empresaIdUrl solo se usa como preselección inicial, no como disparador de recarga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permisosLoading, isSuperAdmin, empresaSesionId]);

  const cargarReportesYAuditoria = useCallback(async (empresaActivaId: string) => {
    setLoading(true);
    try {
      const resReportes = await fetch(`/api/vet/${empresaActivaId}/reportes`);
      const dataReportes = (await resReportes.json()) as { reportes?: ReporteVET[]; error?: string };
      if (!resReportes.ok) {
        toast.error(dataReportes.error ?? "Error cargando los reportes VET");
        setReportesVET([]);
      } else {
        setReportesVET((dataReportes.reportes ?? []).filter((r) => r.estado === "activo"));
      }

      const supabase = createClient();
      const { data: auditoriasData, error: errorAuditorias } = await supabase
        .from("auditoría_exportaciones_vet")
        .select("*, reporte:reportes_vet(codigo, nombre_oficial)")
        .eq("empresa_id", empresaActivaId)
        .order("exportado_en", { ascending: false })
        .limit(20);
      if (errorAuditorias) {
        toast.error("Error cargando el historial de auditoría");
        setAuditorias([]);
      } else {
        setAuditorias((auditoriasData ?? []) as AuditoriaExportacionVET[]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (empresaSeleccionada) {
      cargarReportesYAuditoria(empresaSeleccionada.id);
    }
  }, [empresaSeleccionada, cargarReportesYAuditoria]);

  function seleccionarEmpresa(emp: Empresa) {
    setEmpresaSeleccionada(emp);
    setMostrarSelectEmpresa(false);
    router.replace(`/dashboard/vet?empresa_id=${emp.id}`);
  }

  async function handleGenerar(reporte: ReporteVET) {
    if (!empresaSeleccionada || !userId) return;
    setGenerandoReporte(reporte.codigo);
    try {
      const { periodo_desde, periodo_hasta } = periodoActual();
      const res = await fetch(`/api/vet/${empresaSeleccionada.id}/planilla-ingresos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodo_desde, periodo_hasta, usuario_id: userId }),
      });
      const data = (await res.json()) as RespuestaPlanillaIngresos & { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Error generando el reporte");
        return;
      }
      if (data.validacion.resumen.es_valido) {
        toast.success(`Reporte generado: ${data.resumen.cantidad_facturas} factura(s) incluida(s)`);
      } else {
        toast.warning(`Reporte generado con ${data.validacion.resumen.errores} error(es) de validación`);
      }
      await cargarReportesYAuditoria(empresaSeleccionada.id);
    } catch {
      toast.error("Error de red al generar el reporte");
    } finally {
      setGenerandoReporte(null);
    }
  }

  async function handleValidar(reporte: ReporteVET) {
    if (!empresaSeleccionada || !userId) return;
    setValidandoReporte(reporte.codigo);
    try {
      const { periodo_desde, periodo_hasta } = periodoActual();
      const res = await fetch(`/api/vet/${empresaSeleccionada.id}/validacion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodo_desde,
          periodo_hasta,
          reportes_a_validar: [reporte.codigo],
          usuario_id: userId,
        }),
      });
      const data = (await res.json()) as RespuestaValidacionVET & { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Error validando el reporte");
        return;
      }
      const resultado = data.resultados[0];
      if (!resultado?.ejecutado) {
        toast.info(resultado?.mensaje ?? "Esta validación no está disponible todavía");
        return;
      }
      if (data.resumen.es_valido) {
        toast.success("Validación exitosa: sin errores");
      } else {
        toast.error(
          `Validación con ${data.resumen.errores} error(es) y ${data.resumen.advertencias} advertencia(s)`
        );
      }
    } catch {
      toast.error("Error de red al validar el reporte");
    } finally {
      setValidandoReporte(null);
    }
  }

  const cargandoInicial = permisosLoading || loading;
  const nombreEmpresa = (emp: Empresa) => emp.nombre_empresa ?? emp.nombre_completo ?? "Empresa sin nombre";

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="flex items-start gap-3">
          <FileText className="w-7 h-7 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Cumplimiento VET</h1>
            <p className="text-sm text-gray-500 mt-1">
              Gestión de reportes de Validación, Evaluación y Trazabilidad
            </p>
            {empresaSeleccionada && (
              <p className="text-xs text-gray-500 mt-1">
                Régimen tributario:{" "}
                <span className="font-medium text-gray-700">
                  {empresaSeleccionada.regimen?.nombre ?? "Sin régimen asignado"}
                </span>
              </p>
            )}
          </div>
        </div>

        {isSuperAdmin && (
          <div className="relative self-start">
            <button
              onClick={() => setMostrarSelectEmpresa((v) => !v)}
              className="flex items-center gap-2 border rounded-lg px-3 py-2 text-sm bg-white hover:bg-gray-50"
            >
              <span className="font-medium text-gray-800">
                {empresaSeleccionada ? nombreEmpresa(empresaSeleccionada) : "Selecciona una empresa"}
              </span>
              <ChevronDown className="w-4 h-4 text-gray-500" />
            </button>
            {mostrarSelectEmpresa && (
              <div className="absolute right-0 mt-2 w-72 max-h-80 overflow-y-auto rounded-lg border bg-white shadow-lg z-10">
                {empresas.length === 0 ? (
                  <p className="p-3 text-sm text-gray-400">No hay empresas activas</p>
                ) : (
                  empresas.map((emp) => (
                    <button
                      key={emp.id}
                      onClick={() => seleccionarEmpresa(emp)}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${
                        empresaSeleccionada?.id === emp.id ? "bg-blue-50 text-blue-700" : "text-gray-700"
                      }`}
                    >
                      {nombreEmpresa(emp)}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {cargandoInicial ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        </div>
      ) : !empresaSeleccionada ? (
        <div className="text-center py-16 text-gray-400 border rounded-lg">
          <Clock className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p>Selecciona una empresa para continuar</p>
        </div>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-800">Reportes VET disponibles</h2>
            {reportesVET.length === 0 ? (
              <div className="text-center py-10 text-gray-400 border rounded-lg">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p>No hay reportes VET para este régimen</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {reportesVET.map((reporte) => (
                  <div key={reporte.id} className="border rounded-xl p-4 space-y-2 bg-white">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs px-2 py-1 rounded bg-gray-100 text-gray-700">
                        {reporte.codigo}
                      </span>
                      {reporte.es_obligatorio && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">
                          OBLIGATORIO
                        </span>
                      )}
                    </div>
                    <p className="font-semibold text-sm text-gray-900">{reporte.nombre_oficial}</p>
                    {reporte.descripcion && (
                      <p className="text-xs text-gray-500">{reporte.descripcion}</p>
                    )}
                    {reporte.frecuencia && (
                      <p className="text-xs text-gray-400">Frecuencia: {reporte.frecuencia}</p>
                    )}
                    <div className="flex items-center gap-2 pt-2">
                      <button
                        onClick={() => handleValidar(reporte)}
                        disabled={validandoReporte === reporte.codigo}
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-blue-600 text-blue-600 hover:bg-blue-50 disabled:opacity-50"
                      >
                        {validandoReporte === reporte.codigo ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <CheckCircle className="w-3.5 h-3.5" />
                        )}
                        Validar
                      </button>
                      <button
                        onClick={() => handleGenerar(reporte)}
                        disabled={
                          reporte.codigo !== CODIGO_CON_GENERADOR || generandoReporte === reporte.codigo
                        }
                        title={
                          reporte.codigo !== CODIGO_CON_GENERADOR
                            ? "Generación aún no disponible para este reporte"
                            : undefined
                        }
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {generandoReporte === reporte.codigo && (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        )}
                        Generar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-800">Historial de auditoría</h2>
            {auditorias.length === 0 ? (
              <div className="text-center py-10 text-gray-400 border rounded-lg">
                <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p>Aún no se han generado reportes</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      {["Reporte", "Período", "Registros", "Estado", "Generado", "Acciones"].map((h) => (
                        <th
                          key={h}
                          className="px-4 py-3 text-left font-semibold text-gray-600 whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {auditorias.map((a) => {
                      const exitoso = a.estado === "completado";
                      const advertencias = a.advertencias?.length ?? 0;
                      return (
                        <tr key={a.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-800">
                              {a.reporte?.nombre_oficial ?? "—"}
                            </p>
                            {a.reporte?.codigo && (
                              <p className="font-mono text-xs text-gray-400">{a.reporte.codigo}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                            {a.período_desde ?? "—"} → {a.período_hasta ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-gray-700">{a.cantidad_registros ?? 0}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              {exitoso ? (
                                <CheckCircle className="w-4 h-4 text-green-600" />
                              ) : (
                                <AlertCircle className="w-4 h-4 text-red-600" />
                              )}
                              <span className={exitoso ? "text-green-700" : "text-red-700"}>
                                {exitoso ? "Exitoso" : "Con errores"}
                              </span>
                            </div>
                            {advertencias > 0 && (
                              <span className="text-[11px] text-orange-600">
                                {advertencias} advertencia(s)
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                            {a.exportado_en ? new Date(a.exportado_en).toLocaleString("es-NI") : "—"}
                          </td>
                          <td className="px-4 py-3">
                            {a.archivo_url && (
                              <a
                                href={`/api/vet/${empresaSeleccionada.id}/descargar?ruta=${encodeURIComponent(
                                  a.archivo_url
                                )}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 text-xs"
                              >
                                <Download className="w-4 h-4" />
                              </a>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
