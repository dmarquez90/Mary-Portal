'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getEmpresaIdActual } from '@/lib/supabase/empresa-actual'
import { Download, FileSpreadsheet, AlertCircle } from 'lucide-react'
import * as XLSX from 'xlsx'

interface Planilla {
  id: string
  periodo_mes: number
  periodo_anio: number
  estado: string
}

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

type TipoReporte = 'inss' | 'inatec' | 'ir_laboral'

export default function NominaReportesPage() {
  const [planillas, setPlanillas]     = useState<Planilla[]>([])
  const [planillaId, setPlanillaId]   = useState('')
  const [tipo, setTipo]               = useState<TipoReporte>('inss')
  const [empresaId, setEmpresaId]     = useState<string | null>(null)
  const [reporteData, setReporteData] = useState<any>(null)
  const [cargando, setCargando]       = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      getEmpresaIdActual(supabase, user.id).then(eid => setEmpresaId(eid))
    })
  }, [])

  useEffect(() => {
    if (!empresaId) return
    fetch(`/api/nomina/planillas?empresa_id=${empresaId}`)
      .then(r => r.json())
      .then(d => {
        const aprobadas = (Array.isArray(d) ? d : []).filter((p: Planilla) =>
          ['aprobada','pagada','declarada'].includes(p.estado))
        setPlanillas(aprobadas)
        if (aprobadas.length > 0) setPlanillaId(aprobadas[0].id)
      })
  }, [empresaId])

  async function cargarReporte() {
    if (!empresaId || !planillaId) return
    setCargando(true)
    setReporteData(null)
    const res = await fetch(`/api/nomina/reportes/${tipo}?empresa_id=${empresaId}&planilla_id=${planillaId}`)
    const d   = await res.json()
    setReporteData(d)
    setCargando(false)
  }

  function exportarINSS(data: any) {
    const filas = data.filas.map((f: any) => ({
      'N°':           f.numero_orden,
      'Nº INSS':      f.numero_inss,
      'Cédula':       f.cedula,
      'Nombre Completo': f.nombre_completo,
      'Días':         f.dias_cotizados,
      'Salario Bruto': f.salario_bruto,
      'INSS Laboral (7%)': f.inss_laboral,
      'INSS Patronal (22.5%)': f.inss_patronal,
      'Total Cotización': f.total_cotizacion,
      'Estado':       f.estado,
      'Régimen':      f.regimen,
    }))

    const ws = XLSX.utils.json_to_sheet(filas)
    ws['!cols'] = [{wch:5},{wch:14},{wch:16},{wch:30},{wch:6},
                   {wch:14},{wch:16},{wch:18},{wch:16},{wch:8},{wch:8}]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Autodeterminación INSS')
    XLSX.writeFile(wb, `AutodetINSS_${data.resumen.periodo.replace('/','-')}.xlsx`)
  }

  function exportarIR(data: any) {
    const filas = (data.filas || []).map((f: any) => ({
      'N°':                f.numero,
      'Nombre Completo':   f.nombre_completo,
      'Cédula':            f.cedula,
      'Salario Bruto':     f.salario_bruto,
      'INSS Laboral':      f.inss_laboral,
      'Renta Gravable':    f.renta_gravable,
      'IR Retenido':       f.ir_retenido,
    }))
    const ws = XLSX.utils.json_to_sheet(filas)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'IR Laboral')
    XLSX.writeFile(wb, `IR_Laboral_${data.periodo?.replace(' ','_')}.xlsx`)
  }

  function exportarInatec(data: any) {
    const filas = [{
      'Empresa':            data.empresa_nombre,
      'RUC':                data.empresa_ruc,
      'Período':            data.periodo,
      'Total Planilla':     data.total_planilla,
      'Tasa INATEC':        '2%',
      'Monto INATEC':       data.monto_inatec,
      'Fecha Límite Pago':  data.fecha_limite,
      'Base Legal':         data.base_legal,
    }]
    const ws = XLSX.utils.json_to_sheet(filas)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Factura INATEC')
    XLSX.writeFile(wb, `INATEC_${data.periodo?.replace(' ','_')}.xlsx`)
  }

  const planillaActual = planillas.find(p => p.id === planillaId)

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reportes INSS · INATEC · IR Laboral</h1>
        <p className="text-sm text-gray-500">Vence día 17 de cada mes</p>
      </div>

      {/* Selector */}
      <div className="bg-white rounded-xl border p-4 flex gap-4 flex-wrap items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de reporte</label>
          <select value={tipo} onChange={e => { setTipo(e.target.value as TipoReporte); setReporteData(null) }}
            className="border rounded-lg px-3 py-2 text-sm">
            <option value="inss">Autodeterminación INSS (SIE)</option>
            <option value="inatec">Factura INATEC (2%)</option>
            <option value="ir_laboral">IR Laboral — VET DGI</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Período (planilla aprobada)</label>
          <select value={planillaId} onChange={e => { setPlanillaId(e.target.value); setReporteData(null) }}
            className="border rounded-lg px-3 py-2 text-sm min-w-48">
            {planillas.length === 0
              ? <option value="">Sin planillas aprobadas</option>
              : planillas.map(p => (
                  <option key={p.id} value={p.id}>
                    {MESES[p.periodo_mes - 1]} {p.periodo_anio} — {p.estado}
                  </option>
                ))
            }
          </select>
        </div>
        <button onClick={cargarReporte} disabled={!planillaId || cargando}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40">
          <FileSpreadsheet size={16} /> {cargando ? 'Cargando…' : 'Ver reporte'}
        </button>
      </div>

      {planillas.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex gap-3 text-sm text-yellow-800">
          <AlertCircle size={18} className="mt-0.5 flex-shrink-0" />
          <p>No hay planillas aprobadas. Aprueba una planilla antes de generar los reportes.</p>
        </div>
      )}

      {/* Vista INSS */}
      {tipo === 'inss' && reporteData && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border p-4">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="font-bold text-gray-900">Autodeterminación INSS</h2>
                <p className="text-sm text-gray-500">
                  Empresa: {reporteData.resumen.empresa_nombre} · RUC: {reporteData.resumen.empresa_ruc}
                </p>
                <p className="text-sm text-gray-500">
                  Período: {reporteData.resumen.periodo} · Fecha límite: {reporteData.resumen.fecha_limite_pago}
                </p>
              </div>
              <button onClick={() => exportarINSS(reporteData)}
                className="flex items-center gap-2 border border-green-600 text-green-700 px-3 py-1.5 rounded-lg text-sm hover:bg-green-50">
                <Download size={14} /> Exportar xlsx (SIE)
              </button>
            </div>

            <div className="grid grid-cols-4 gap-3 mb-4 text-sm">
              <div className="bg-gray-50 rounded p-3">
                <p className="text-xs text-gray-500">Empleados</p>
                <p className="font-bold">{reporteData.resumen.total_empleados}</p>
              </div>
              <div className="bg-gray-50 rounded p-3">
                <p className="text-xs text-gray-500">Total salarios</p>
                <p className="font-bold">C$ {reporteData.resumen.total_salarios?.toLocaleString('es-NI', { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="bg-red-50 rounded p-3">
                <p className="text-xs text-gray-500">INSS Laboral (7%)</p>
                <p className="font-bold text-red-700">C$ {reporteData.resumen.total_inss_laboral?.toLocaleString('es-NI', { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="bg-orange-50 rounded p-3">
                <p className="text-xs text-gray-500">INSS Patronal (22.5%)</p>
                <p className="font-bold text-orange-700">C$ {reporteData.resumen.total_inss_patronal?.toLocaleString('es-NI', { minimumFractionDigits: 2 })}</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-xs border">
                <thead className="bg-gray-100">
                  <tr>
                    {['N°','Nº INSS','Cédula','Nombre Completo','Días','Salario Bruto',
                      'INSS Lab (7%)','INSS Pat (22.5%)','Total Cot.','Est.','Régimen']
                      .map(h => <th key={h} className="px-2 py-1.5 text-left font-semibold border-b">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {reporteData.filas?.map((f: any) => (
                    <tr key={f.numero_orden} className="border-b hover:bg-gray-50">
                      <td className="px-2 py-1.5">{f.numero_orden}</td>
                      <td className="px-2 py-1.5 font-mono">{f.numero_inss || '—'}</td>
                      <td className="px-2 py-1.5">{f.cedula || '—'}</td>
                      <td className="px-2 py-1.5 font-medium">{f.nombre_completo}</td>
                      <td className="px-2 py-1.5 text-center">{f.dias_cotizados}</td>
                      <td className="px-2 py-1.5 text-right">C$ {f.salario_bruto?.toLocaleString('es-NI', { minimumFractionDigits: 2 })}</td>
                      <td className="px-2 py-1.5 text-right text-red-600">C$ {f.inss_laboral?.toLocaleString('es-NI', { minimumFractionDigits: 2 })}</td>
                      <td className="px-2 py-1.5 text-right text-orange-600">C$ {f.inss_patronal?.toLocaleString('es-NI', { minimumFractionDigits: 2 })}</td>
                      <td className="px-2 py-1.5 text-right font-bold">C$ {f.total_cotizacion?.toLocaleString('es-NI', { minimumFractionDigits: 2 })}</td>
                      <td className="px-2 py-1.5 text-center">
                        <span className={`px-1.5 py-0.5 rounded text-xs ${f.estado === 'A' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {f.estado}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-center">{f.regimen}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Vista INATEC */}
      {tipo === 'inatec' && reporteData && (
        <div className="bg-white rounded-xl border p-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="font-bold text-gray-900 text-lg">Factura INATEC</h2>
              <p className="text-sm text-gray-500">{reporteData.descripcion}</p>
            </div>
            <button onClick={() => exportarInatec(reporteData)}
              className="flex items-center gap-2 border border-green-600 text-green-700 px-3 py-1.5 rounded-lg text-sm hover:bg-green-50">
              <Download size={14} /> Exportar xlsx
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><span className="text-gray-500">Empresa:</span> <strong>{reporteData.empresa_nombre}</strong></div>
            <div><span className="text-gray-500">RUC:</span> <strong>{reporteData.empresa_ruc}</strong></div>
            <div><span className="text-gray-500">Período:</span> <strong>{reporteData.periodo}</strong></div>
            <div><span className="text-gray-500">Fecha límite pago:</span> <strong className="text-red-600">{reporteData.fecha_limite}</strong></div>
            <div><span className="text-gray-500">Total planilla:</span> <strong>C$ {reporteData.total_planilla?.toLocaleString('es-NI', { minimumFractionDigits: 2 })}</strong></div>
            <div><span className="text-gray-500">Tasa INATEC:</span> <strong>2%</strong></div>
          </div>
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-4 text-center">
            <p className="text-sm text-amber-700">Monto a pagar INATEC</p>
            <p className="text-3xl font-bold text-amber-800 mt-1">
              C$ {reporteData.monto_inatec?.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-amber-600 mt-1">{reporteData.base_legal}</p>
          </div>
        </div>
      )}

      {/* Vista IR Laboral */}
      {tipo === 'ir_laboral' && reporteData && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border p-4">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="font-bold text-gray-900">IR Laboral — Declaración VET DGI</h2>
                <p className="text-sm text-gray-500">
                  {reporteData.empresa_nombre} · {reporteData.periodo} · {reporteData.base_legal}
                </p>
              </div>
              <button onClick={() => exportarIR(reporteData)}
                className="flex items-center gap-2 border border-green-600 text-green-700 px-3 py-1.5 rounded-lg text-sm hover:bg-green-50">
                <Download size={14} /> Exportar xlsx
              </button>
            </div>

            <div className="bg-purple-50 rounded-lg p-3 mb-4 text-sm">
              <p className="text-purple-700">
                Total IR Laboral retenido en el período:
                <strong className="text-xl ml-2">
                  C$ {reporteData.total_ir_retenido?.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                </strong>
              </p>
              <p className="text-xs text-purple-500 mt-1">
                Reportar en Declaración Mensual de Retenciones (VET DGI) — Formulario 124 sección IR rentas del trabajo
              </p>
            </div>

            {reporteData.filas?.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs border">
                  <thead className="bg-gray-100">
                    <tr>
                      {['N°','Nombre Completo','Cédula','Salario Bruto','INSS Laboral','Renta Gravable','IR Retenido']
                        .map(h => <th key={h} className="px-2 py-1.5 text-left font-semibold border-b">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {reporteData.filas.map((f: any) => (
                      <tr key={f.numero} className="border-b hover:bg-gray-50">
                        <td className="px-2 py-1.5">{f.numero}</td>
                        <td className="px-2 py-1.5 font-medium">{f.nombre_completo}</td>
                        <td className="px-2 py-1.5">{f.cedula || '—'}</td>
                        <td className="px-2 py-1.5 text-right">C$ {f.salario_bruto?.toLocaleString('es-NI', { minimumFractionDigits: 2 })}</td>
                        <td className="px-2 py-1.5 text-right text-red-600">C$ {f.inss_laboral?.toLocaleString('es-NI', { minimumFractionDigits: 2 })}</td>
                        <td className="px-2 py-1.5 text-right">C$ {f.renta_gravable?.toLocaleString('es-NI', { minimumFractionDigits: 2 })}</td>
                        <td className="px-2 py-1.5 text-right font-bold text-purple-700">C$ {f.ir_retenido?.toLocaleString('es-NI', { minimumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-gray-400 text-center py-4">
                Ningún empleado supera el mínimo exento de C$ 100,000/año en este período.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
