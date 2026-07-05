'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle, Download, FileSpreadsheet } from 'lucide-react'
import { formatearMes } from '@/lib/nomina/calculos'
import { createClient } from '@/lib/supabase/client'
import { getEmpresaIdActual } from '@/lib/supabase/empresa-actual'
import * as XLSX from 'xlsx'

interface Detalle {
  id:             string
  salario_bruto:  number
  inss_laboral:   number
  inss_patronal:  number
  inatec:         number
  ir_laboral:     number
  adelantos:      number
  total_deducciones: number
  neto_pagar:     number
  dias_trabajados: number
  prov_vacaciones: number
  prov_aguinaldo:  number
  prov_indemnizacion: number
  empleado: {
    primer_nombre: string
    segundo_nombre?: string
    primer_apellido: string
    segundo_apellido?: string
    numero_inss?: string
    cedula?: string
    cargo?: { nombre: string }
  }
}

interface Planilla {
  id:                    string
  periodo_mes:           number
  periodo_anio:          number
  fecha_pago:            string
  estado:                string
  total_salarios_brutos: number
  total_inss_laboral:    number
  total_inss_patronal:   number
  total_inatec:          number
  total_ir_laboral:      number
  total_neto_pagar:      number
  total_prov_vacaciones: number
  total_prov_aguinaldo:  number
  total_prov_indemnizacion: number
  asiento_id?:           string
}

const fmt = (n: number) => `C$ ${n.toLocaleString('es-NI', { minimumFractionDigits: 2 })}`

export default function DetallePlanillaPage() {
  const { id }  = useParams<{ id: string }>()
  const router  = useRouter()
  const [data, setData]         = useState<{ planilla: Planilla; detalles: Detalle[] } | null>(null)
  const [loading, setLoading]   = useState(true)
  const [aprobando, setAprobando] = useState(false)
  const [empresaId, setEmpresaId] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      getEmpresaIdActual(supabase, user.id).then(eid => setEmpresaId(eid))
    })
  }, [])

  useEffect(() => {
    if (!id) return
    fetch(`/api/nomina/planillas/${id}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [id])

  async function aprobar() {
    if (!data || !empresaId) return
    setAprobando(true)
    await fetch(`/api/nomina/planillas/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accion:     'aprobar',
        empresa_id: empresaId,
        fecha_pago: data.planilla.fecha_pago,
      }),
    })
    // Recargar
    const res = await fetch(`/api/nomina/planillas/${id}`)
    setData(await res.json())
    setAprobando(false)
  }

  function exportarExcel() {
    if (!data) return
    const { planilla, detalles } = data
    const periodo = formatearMes(planilla.periodo_mes, planilla.periodo_anio)

    const filas = detalles.map((d, i) => ({
      'N°': i + 1,
      'Nombre Completo': [d.empleado.primer_nombre, d.empleado.segundo_nombre,
                          d.empleado.primer_apellido, d.empleado.segundo_apellido]
                          .filter(Boolean).join(' '),
      'Cédula': d.empleado.cedula || '',
      'Nº INSS': d.empleado.numero_inss || '',
      'Cargo': d.empleado.cargo?.nombre || '',
      'Días': d.dias_trabajados,
      'Salario Bruto': d.salario_bruto,
      'INSS Laboral (7%)': d.inss_laboral,
      'IR Laboral': d.ir_laboral,
      'Adelantos': d.adelantos,
      'Total Deducciones': d.total_deducciones,
      'Neto a Pagar': d.neto_pagar,
      'INSS Patronal (22.5%)': d.inss_patronal,
      'INATEC (2%)': d.inatec,
      'Prov. Vacaciones': d.prov_vacaciones,
      'Prov. Aguinaldo': d.prov_aguinaldo,
      'Prov. Indemnización': d.prov_indemnizacion,
    }))

    // Fila de totales
    filas.push({
      'N°': 0,
      'Nombre Completo': 'TOTALES',
      'Cédula': '',
      'Nº INSS': '',
      'Cargo': '',
      'Días': 0,
      'Salario Bruto': planilla.total_salarios_brutos,
      'INSS Laboral (7%)': planilla.total_inss_laboral,
      'IR Laboral': planilla.total_ir_laboral,
      'Adelantos': 0,
      'Total Deducciones': 0,
      'Neto a Pagar': planilla.total_neto_pagar,
      'INSS Patronal (22.5%)': planilla.total_inss_patronal,
      'INATEC (2%)': planilla.total_inatec,
      'Prov. Vacaciones': planilla.total_prov_vacaciones,
      'Prov. Aguinaldo': planilla.total_prov_aguinaldo,
      'Prov. Indemnización': planilla.total_prov_indemnizacion,
    })

    const ws = XLSX.utils.json_to_sheet(filas)
    ws['!cols'] = [
      {wch:5},{wch:30},{wch:16},{wch:14},{wch:20},{wch:6},
      {wch:14},{wch:16},{wch:12},{wch:12},{wch:16},{wch:14},
      {wch:20},{wch:12},{wch:16},{wch:14},{wch:18},
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, `Planilla ${periodo}`)
    XLSX.writeFile(wb, `Planilla_${planilla.periodo_anio}_${String(planilla.periodo_mes).padStart(2,'0')}.xlsx`)
  }

  if (loading) return <div className="p-6 text-center text-gray-400">Cargando…</div>
  if (!data) return <div className="p-6 text-center text-red-500">Planilla no encontrada</div>

  const { planilla, detalles } = data
  const esBorrador = ['borrador','calculada'].includes(planilla.estado)

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Planilla — {formatearMes(planilla.periodo_mes, planilla.periodo_anio)}
            </h1>
            <p className="text-sm text-gray-500 capitalize">Estado: {planilla.estado}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={exportarExcel}
            className="flex items-center gap-2 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm hover:bg-gray-50">
            <Download size={14} /> Exportar Excel
          </button>
          {esBorrador && (
            <button onClick={aprobar} disabled={aprobando}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              <CheckCircle size={14} /> {aprobando ? 'Aprobando…' : 'Aprobar y contabilizar'}
            </button>
          )}
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total salarios brutos', value: planilla.total_salarios_brutos, color: 'text-gray-900' },
          { label: 'INSS laboral (7%)', value: planilla.total_inss_laboral, color: 'text-red-600' },
          { label: 'INSS patronal (22.5%)', value: planilla.total_inss_patronal, color: 'text-orange-600' },
          { label: 'INATEC (2%)', value: planilla.total_inatec, color: 'text-orange-500' },
          { label: 'IR Laboral', value: planilla.total_ir_laboral, color: 'text-purple-600' },
          { label: 'Neto a pagar', value: planilla.total_neto_pagar, color: 'text-green-700' },
          { label: 'Prov. vacaciones', value: planilla.total_prov_vacaciones, color: 'text-blue-600' },
          { label: 'Prov. aguinaldo + indem.', value: planilla.total_prov_aguinaldo + planilla.total_prov_indemnizacion, color: 'text-blue-500' },
        ].map(r => (
          <div key={r.label} className="bg-white border rounded-lg p-3">
            <p className="text-xs text-gray-500">{r.label}</p>
            <p className={`font-bold text-base ${r.color}`}>{fmt(r.value)}</p>
          </div>
        ))}
      </div>

      {planilla.asiento_id && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-700 flex items-center gap-2">
          <CheckCircle size={16} /> Asiento contable generado automáticamente
        </div>
      )}

      {/* Tabla detalle */}
      <div className="overflow-x-auto bg-white rounded-xl border">
        <table className="min-w-max text-xs">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Empleado</th>
              <th className="px-3 py-2 text-center font-semibold">Días</th>
              <th className="px-3 py-2 text-right font-semibold">S. Bruto</th>
              <th className="px-3 py-2 text-right font-semibold text-red-600">INSS lab.</th>
              <th className="px-3 py-2 text-right font-semibold text-purple-600">IR</th>
              <th className="px-3 py-2 text-right font-semibold">Adelantos</th>
              <th className="px-3 py-2 text-right font-semibold">Total ded.</th>
              <th className="px-3 py-2 text-right font-semibold text-green-700">Neto</th>
              <th className="px-3 py-2 text-right font-semibold text-gray-400">INSS pat.</th>
              <th className="px-3 py-2 text-right font-semibold text-gray-400">INATEC</th>
              <th className="px-3 py-2 text-right font-semibold text-blue-500">Prov.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {detalles.map(d => {
              const nombre = [d.empleado.primer_nombre, d.empleado.primer_apellido].join(' ')
              return (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <p className="font-medium">{nombre}</p>
                    <p className="text-gray-400">{d.empleado.cargo?.nombre || ''}</p>
                  </td>
                  <td className="px-3 py-2 text-center">{d.dias_trabajados}</td>
                  <td className="px-3 py-2 text-right font-semibold">{fmt(d.salario_bruto)}</td>
                  <td className="px-3 py-2 text-right text-red-600">{fmt(d.inss_laboral)}</td>
                  <td className="px-3 py-2 text-right text-purple-600">{fmt(d.ir_laboral)}</td>
                  <td className="px-3 py-2 text-right">{fmt(d.adelantos)}</td>
                  <td className="px-3 py-2 text-right">{fmt(d.total_deducciones)}</td>
                  <td className="px-3 py-2 text-right font-bold text-green-700">{fmt(d.neto_pagar)}</td>
                  <td className="px-3 py-2 text-right text-gray-400">{fmt(d.inss_patronal)}</td>
                  <td className="px-3 py-2 text-right text-gray-400">{fmt(d.inatec)}</td>
                  <td className="px-3 py-2 text-right text-blue-500 text-xs">
                    V:{fmt(d.prov_vacaciones)} A:{fmt(d.prov_aguinaldo)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
