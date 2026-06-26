'use client'
import { useState, useEffect } from 'react'
import { DollarSign, Plus } from 'lucide-react'

interface Anticipo {
  id: string
  anio: number
  mes: number
  ingresos_brutos_mes: number
  monto_anticipo: number
  retenciones_recibidas: number
  monto_a_pagar: number
  fecha_vencimiento: string
  estado: string
  numero_boleta?: string
}

const MESES = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const fmt = (n: number) => new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO' }).format(n ?? 0)

export default function AnticiposIrPage() {
  const [anticipos, setAnticipos] = useState<Anticipo[]>([])
  const [loading, setLoading] = useState(true)
  const [empresaId, setEmpresaId] = useState('')
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [calculando, setCalculando] = useState(false)

  useEffect(() => {
    const eid = localStorage.getItem('empresa_id') || ''
    setEmpresaId(eid)
    if (eid) fetchAnticipos(eid, new Date().getFullYear())
  }, [])

  async function fetchAnticipos(eid: string, a: number) {
    setLoading(true)
    const r = await fetch(`/api/tributacion/anticipos-ir?empresa_id=${eid}&anio=${a}`)
    const d = await r.json()
    setAnticipos(Array.isArray(d) ? d : [])
    setLoading(false)
  }

  async function calcularMes(mes: number) {
    setCalculando(true)
    const r = await fetch('/api/tributacion/anticipos-ir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ empresa_id: empresaId, anio, mes })
    })
    setCalculando(false)
    if (r.ok) fetchAnticipos(empresaId, anio)
    else { const d = await r.json(); alert('Error: ' + d.error) }
  }

  async function marcarPagado(id: string, numeroBoleta: string) {
    await fetch('/api/tributacion/anticipos-ir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        empresa_id: empresaId,
        ...anticipos.find(a => a.id === id),
        estado: 'pagado',
        fecha_pago: new Date().toISOString().split('T')[0],
        numero_boleta: numeroBoleta
      })
    })
    fetchAnticipos(empresaId, anio)
  }

  const totalPagado = anticipos.filter(a => a.estado === 'pagado').reduce((s, a) => s + a.monto_a_pagar, 0)
  const totalPendiente = anticipos.filter(a => a.estado !== 'pagado').reduce((s, a) => s + a.monto_a_pagar, 0)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Anticipos Mensuales IR</h1>
          <p className="text-sm text-gray-500 mt-1">LCT Art. 63-64 · 1% sobre ingresos brutos · Vence día 5 de cada mes</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={anio} onChange={e => { setAnio(parseInt(e.target.value)); fetchAnticipos(empresaId, parseInt(e.target.value)) }}
            className="border rounded-lg px-3 py-2 text-sm">
            {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button
            onClick={() => calcularMes(new Date().getMonth() + 1)}
            disabled={calculando}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50"
          >
            <Plus size={16} />
            {calculando ? 'Calculando...' : 'Calcular Mes Actual'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-green-50 rounded-xl p-4">
          <p className="text-sm text-gray-600">Total Pagado {anio}</p>
          <p className="text-xl font-bold text-green-700">{fmt(totalPagado)}</p>
        </div>
        <div className="bg-amber-50 rounded-xl p-4">
          <p className="text-sm text-gray-600">Total Pendiente {anio}</p>
          <p className="text-xl font-bold text-amber-700">{fmt(totalPendiente)}</p>
        </div>
      </div>

      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 text-sm text-purple-800">
        <strong>Acreditación:</strong> Los anticipos pagados se acreditan contra el IR Anual del ejercicio.
        Si el total de anticipos supera el IR anual, el excedente se aplica al año siguiente o se solicita devolución.
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-400">Cargando...</div>
      ) : anticipos.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <DollarSign size={40} className="mx-auto mb-2 opacity-30" />
          <p>No hay anticipos para {anio}. Use <strong>Calcular Mes Actual</strong>.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Período','Ingresos Brutos','Anticipo 1%','Retenciones','A Pagar','Vencimiento','Estado'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {anticipos.map(a => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{MESES[a.mes]} {a.anio}</td>
                  <td className="px-4 py-3">{fmt(a.ingresos_brutos_mes)}</td>
                  <td className="px-4 py-3">{fmt(a.monto_anticipo)}</td>
                  <td className="px-4 py-3 text-green-600">- {fmt(a.retenciones_recibidas)}</td>
                  <td className="px-4 py-3 font-bold">{fmt(a.monto_a_pagar)}</td>
                  <td className={`px-4 py-3 font-mono text-xs ${new Date(a.fecha_vencimiento) < new Date() && a.estado === 'pendiente' ? 'text-red-600 font-bold' : 'text-gray-600'}`}>
                    {a.fecha_vencimiento}
                  </td>
                  <td className="px-4 py-3">
                    {a.estado === 'pendiente' ? (
                      <button
                        onClick={() => {
                          const boleta = prompt('Número de boleta VET DGI:')
                          if (boleta) marcarPagado(a.id, boleta)
                        }}
                        className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200"
                      >
                        Marcar pagado
                      </button>
                    ) : (
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        a.estado === 'pagado' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}>{a.estado}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
