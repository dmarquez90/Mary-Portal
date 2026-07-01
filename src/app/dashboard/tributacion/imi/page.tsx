'use client'
import { useState, useEffect } from 'react'
import { Building2, Plus, CheckCircle } from 'lucide-react'

interface DeclaracionIMI {
  id: string
  anio: number
  mes: number
  fecha_vencimiento: string
  ingresos_brutos_mes: number
  tasa: number
  monto_imi: number
  estado: 'pendiente' | 'declarado' | 'pagado' | 'exento'
  numero_boleta?: string
  municipio?: string
}

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const fmt = (n: number) => new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO' }).format(n ?? 0)

export default function IMIPage() {
  const [declaraciones, setDeclaraciones] = useState<DeclaracionIMI[]>([])
  const [loading, setLoading] = useState(true)
  const [empresaId, setEmpresaId] = useState('')
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [calculando, setCalculando] = useState(false)

  useEffect(() => {
    async function init() {
      // La empresa se resuelve por la sesión del usuario, no por localStorage
      // (esa llave nunca se guardaba, así que esta lista nunca cargaba datos).
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const [{ data: en }, { data: ej }] = await Promise.all([
        supabase.from('empresas_persona_natural').select('id').eq('user_id', user.id).maybeSingle(),
        supabase.from('empresas_juridicas').select('id').eq('user_id', user.id).maybeSingle(),
      ])
      const eid = en?.id ?? ej?.id ?? ''
      setEmpresaId(eid)
      if (eid) fetchDeclaraciones(eid, anio)
    }
    init()
  }, [])

  async function fetchDeclaraciones(eid: string, a: number) {
    setLoading(true)
    const r = await fetch(`/api/tributacion/imi?empresa_id=${eid}&anio=${a}`)
    const d = await r.json()
    setDeclaraciones(Array.isArray(d) ? d : [])
    setLoading(false)
  }

  async function calcularMesActual() {
    setCalculando(true)
    const ahora = new Date()
    const r = await fetch('/api/tributacion/imi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        empresa_id: empresaId,
        anio: ahora.getFullYear(),
        mes: ahora.getMonth() + 1,
        calcular_automatico: true,
      })
    })
    setCalculando(false)
    if (r.ok) fetchDeclaraciones(empresaId, anio)
    else alert('Error al calcular IMI')
  }

  async function marcarPagado(id: string) {
    const boleta = prompt('Número de boleta de pago (opcional):')
    const r = await fetch(`/api/tributacion/imi?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: 'pagado', numero_boleta: boleta || undefined })
    })
    if (r.ok) fetchDeclaraciones(empresaId, anio)
    else alert('Error al actualizar estado')
  }

  const totalPagado = declaraciones.filter(d => d.estado === 'pagado').reduce((s, d) => s + d.monto_imi, 0)
  const totalPendiente = declaraciones.filter(d => d.estado === 'pendiente' || d.estado === 'declarado').reduce((s, d) => s + d.monto_imi, 0)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">IMI Municipal</h1>
          <p className="text-sm text-gray-500 mt-1">Impuesto Municipal sobre Ingresos · 1% ingresos brutos · Plan Arbitrios Municipal · Vence día 15</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            className="border rounded-lg px-3 py-2 text-sm"
            value={anio}
            onChange={e => { setAnio(parseInt(e.target.value)); fetchDeclaraciones(empresaId, parseInt(e.target.value)) }}
          >
            {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button
            onClick={calcularMesActual}
            disabled={calculando}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            <Plus size={16} />
            {calculando ? 'Calculando...' : 'Calcular Mes Actual'}
          </button>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-green-50 rounded-xl p-4">
          <p className="text-sm text-gray-600">Total Pagado {anio}</p>
          <p className="text-2xl font-bold text-green-700">{fmt(totalPagado)}</p>
        </div>
        <div className="bg-amber-50 rounded-xl p-4">
          <p className="text-sm text-gray-600">Total Pendiente {anio}</p>
          <p className="text-2xl font-bold text-amber-700">{fmt(totalPendiente)}</p>
        </div>
      </div>

      {/* Info legal */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        <strong>Base legal:</strong> El IMI (Impuesto Municipal sobre Ingresos) se aplica a todas las actividades económicas realizadas dentro del municipio.
        Tasa: <strong>1%</strong> sobre ingresos brutos mensuales. Declaración y pago ante la Alcaldía Municipal, día 15 de cada mes.
        Para matrícula anual: 2% de promedio de ingresos mensuales (enero de cada año).
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="text-center py-8 text-gray-400">Cargando...</div>
      ) : declaraciones.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <Building2 size={40} className="mx-auto mb-2 opacity-30" />
          <p>No hay declaraciones IMI para {anio}</p>
          <p className="text-xs mt-1">Use "Calcular Mes Actual" para generar la declaración del mes en curso</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Mes','Ingresos Brutos','Tasa','IMI a Pagar','Vencimiento','Estado','Boleta','Acción'].map(h => (
                  <th key={h} className="px-3 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {declaraciones.map(d => {
                const vencida = d.estado === 'pendiente' && new Date(d.fecha_vencimiento) < new Date()
                return (
                  <tr key={d.id} className={`hover:bg-gray-50 ${vencida ? 'bg-red-50' : ''}`}>
                    <td className="px-3 py-3 font-medium">{MESES[(d.mes ?? 1) - 1]} {d.anio}</td>
                    <td className="px-3 py-3">{fmt(d.ingresos_brutos_mes)}</td>
                    <td className="px-3 py-3">{((d.tasa ?? 0.01) * 100).toFixed(0)}%</td>
                    <td className="px-3 py-3 font-bold">{fmt(d.monto_imi)}</td>
                    <td className="px-3 py-3">
                      <span className={vencida ? 'text-red-600 font-medium' : ''}>{d.fecha_vencimiento}</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        d.estado === 'pagado' ? 'bg-green-100 text-green-700' :
                        d.estado === 'declarado' ? 'bg-blue-100 text-blue-700' :
                        d.estado === 'exento' ? 'bg-gray-100 text-gray-600' :
                        vencida ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {d.estado === 'pendiente' && vencida ? 'VENCIDA' : d.estado.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-500">{d.numero_boleta || '—'}</td>
                    <td className="px-3 py-3">
                      {(d.estado === 'pendiente' || d.estado === 'declarado') && (
                        <button
                          onClick={() => marcarPagado(d.id)}
                          className="flex items-center gap-1 px-3 py-1 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700"
                        >
                          <CheckCircle size={12} /> Marcar Pagado
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
