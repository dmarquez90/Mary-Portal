'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { getEmpresaIdActual } from '@/lib/supabase/empresa-actual'
import { Plus, Eye, CheckCircle, FileSpreadsheet } from 'lucide-react'
import { formatearMes } from '@/lib/nomina/calculos'

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
}

const ESTADO_COLOR: Record<string, string> = {
  borrador:    'bg-gray-100 text-gray-600',
  calculada:   'bg-yellow-100 text-yellow-700',
  aprobada:    'bg-blue-100 text-blue-700',
  pagada:      'bg-green-100 text-green-700',
  declarada:   'bg-purple-100 text-purple-700',
}

const fmt = (n: number) => `C$ ${n.toLocaleString('es-NI', { minimumFractionDigits: 2 })}`

export default function PlanillaPage() {
  const [planillas, setPlanillas]   = useState<Planilla[]>([])
  const [loading, setLoading]       = useState(true)
  const [empresaId, setEmpresaId]   = useState<string | null>(null)

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
      .then(d => { setPlanillas(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [empresaId])

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Planilla Salarial</h1>
          <p className="text-sm text-gray-500">Historial de planillas mensuales</p>
        </div>
        <Link
          href="/dashboard/nomina/planilla/nueva"
          className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 text-sm font-medium"
        >
          <Plus size={16} /> Nueva planilla
        </Link>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Cargando…</div>
      ) : planillas.length === 0 ? (
        <div className="text-center py-12">
          <FileSpreadsheet size={48} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">No hay planillas registradas</p>
          <Link href="/dashboard/nomina/planilla/nueva"
            className="mt-4 inline-block bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm">
            Generar primera planilla
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {planillas.map(p => (
            <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm transition-shadow">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <h2 className="font-semibold text-gray-900">{formatearMes(p.periodo_mes, p.periodo_anio)}</h2>
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${ESTADO_COLOR[p.estado] || 'bg-gray-100 text-gray-600'}`}>
                    {p.estado.charAt(0).toUpperCase() + p.estado.slice(1)}
                  </span>
                  {p.estado === 'calculada' && (
                    <span className="text-xs text-amber-600 flex items-center gap-1">
                      ⚠ Pendiente de aprobar
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/dashboard/nomina/planilla/${p.id}`}
                    className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 border border-blue-200 px-3 py-1.5 rounded-lg"
                  >
                    <Eye size={14} /> Ver detalle
                  </Link>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                <div>
                  <p className="text-gray-500 text-xs">Salarios brutos</p>
                  <p className="font-semibold">{fmt(p.total_salarios_brutos)}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">INSS laboral (7%)</p>
                  <p className="font-semibold text-red-600">−{fmt(p.total_inss_laboral)}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">INSS patronal (22.5%)</p>
                  <p className="font-semibold text-orange-600">{fmt(p.total_inss_patronal)}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">INATEC (2%)</p>
                  <p className="font-semibold text-orange-500">{fmt(p.total_inatec)}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Neto a pagar</p>
                  <p className="font-semibold text-green-700">{fmt(p.total_neto_pagar)}</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 mt-2 pt-2 border-t border-gray-100 text-xs text-gray-500">
                <span>Prov. vacaciones: {fmt(p.total_prov_vacaciones)}</span>
                <span>Prov. aguinaldo: {fmt(p.total_prov_aguinaldo)}</span>
                <span>Prov. indem.: {fmt(p.total_prov_indemnizacion)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
