'use client'
import { useState, useEffect } from 'react'
import { Calendar, FileText, DollarSign, Building2, AlertTriangle, CheckCircle, Clock } from 'lucide-react'

interface ObligacionCalendario {
  id: string
  tipo_obligacion: string
  descripcion: string
  fecha_vencimiento: string
  estado: string
  monto_estimado?: number
}

const TIPO_LABEL: Record<string, string> = {
  iva_mensual: 'IVA Mensual',
  anticipo_ir: 'Anticipo IR',
  inss: 'INSS',
  inatec: 'INATEC',
  imi: 'IMI',
  ir_anual: 'IR Anual',
  matricula_alcaldia: 'Matrícula Alcaldía',
  isc: 'ISC',
  retencion_definitiva: 'Retención Definitiva',
  otro: 'Otro'
}

const TIPO_COLOR: Record<string, string> = {
  iva_mensual: 'bg-blue-100 text-blue-700',
  anticipo_ir: 'bg-purple-100 text-purple-700',
  inss: 'bg-green-100 text-green-700',
  inatec: 'bg-teal-100 text-teal-700',
  imi: 'bg-orange-100 text-orange-700',
  ir_anual: 'bg-red-100 text-red-700',
  matricula_alcaldia: 'bg-yellow-100 text-yellow-700',
  isc: 'bg-pink-100 text-pink-700',
  retencion_definitiva: 'bg-indigo-100 text-indigo-700',
}

export default function TributacionPage() {
  const [obligaciones, setObligaciones] = useState<ObligacionCalendario[]>([])
  const [loading, setLoading] = useState(true)
  const [empresaId, setEmpresaId] = useState('')
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [generando, setGenerando] = useState(false)
  const [filtroEstado, setFiltroEstado] = useState('pendiente')

  useEffect(() => {
    async function init() {
      // La empresa se resuelve por la sesión del usuario (igual que el resto
      // del dashboard), no por localStorage — esa llave nunca se guardaba,
      // por lo que este calendario nunca llegaba a cargar datos.
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
      if (eid) fetchCalendario(eid, anio, 'pendiente')
    }
    init()
  }, [])

  async function fetchCalendario(eid: string, a: number, estado?: string) {
    setLoading(true)
    let url = `/api/tributacion/calendario?empresa_id=${eid}&anio=${a}`
    if (estado) url += `&estado=${estado}`
    const r = await fetch(url)
    const d = await r.json()
    setObligaciones(Array.isArray(d) ? d : [])
    setLoading(false)
  }

  async function generarCalendario() {
    setGenerando(true)
    const r = await fetch('/api/tributacion/calendario', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ empresa_id: empresaId, anio })
    })
    const d = await r.json()
    setGenerando(false)
    fetchCalendario(empresaId, anio, filtroEstado)
    alert(`Calendario generado: ${d.generadas} obligaciones creadas para ${anio}`)
  }

  async function marcarCumplido(id: string) {
    await fetch('/api/tributacion/calendario', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, estado: 'presentado', fecha_cumplimiento: new Date().toISOString().split('T')[0] })
    })
    fetchCalendario(empresaId, anio, filtroEstado)
  }

  const hoy = new Date()
  const proximas = obligaciones.filter(o => {
    const venc = new Date(o.fecha_vencimiento)
    const diff = Math.ceil((venc.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24))
    return diff >= 0 && diff <= 10
  })
  const vencidas = obligaciones.filter(o => new Date(o.fecha_vencimiento) < hoy && o.estado === 'pendiente')

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tributación y Declaraciones</h1>
          <p className="text-sm text-gray-500 mt-1">LCT Art. 52, 63-64, 87 · Plan Arbitrios Municipal · Portal VET DGI</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={anio}
            onChange={e => { setAnio(parseInt(e.target.value)); fetchCalendario(empresaId, parseInt(e.target.value), filtroEstado) }}
            className="border rounded-lg px-3 py-2 text-sm"
          >
            {[2023,2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button
            onClick={generarCalendario}
            disabled={generando}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {generando ? 'Generando...' : `Generar Calendario ${anio}`}
          </button>
        </div>
      </div>

      {/* Alertas */}
      {vencidas.length > 0 && (
        <div className="bg-red-50 border border-red-300 rounded-lg p-4 flex gap-3">
          <AlertTriangle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-800">{vencidas.length} obligación(es) VENCIDA(S)</p>
            <ul className="text-sm text-red-700 mt-1 space-y-0.5">
              {vencidas.map(o => (
                <li key={o.id}>• {o.descripcion} — venció el {o.fecha_vencimiento}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {proximas.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3">
          <Clock size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-800">{proximas.length} vencimiento(s) en los próximos 10 días</p>
            <ul className="text-sm text-amber-700 mt-1 space-y-0.5">
              {proximas.map(o => {
                const diff = Math.ceil((new Date(o.fecha_vencimiento).getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24))
                return (
                  <li key={o.id}>• {o.descripcion} — vence en {diff} día(s) ({o.fecha_vencimiento})</li>
                )
              })}
            </ul>
          </div>
        </div>
      )}

      {/* Módulos rápidos */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {[
          { href: '/dashboard/tributacion/ir-anual', icon: FileText, label: 'IR Anual F-106', desc: 'Declaración anual LCT art. 52', color: 'bg-red-50 border-red-200' },
          { href: '/dashboard/tributacion/anticipos-ir', icon: DollarSign, label: 'Anticipos IR', desc: '1% ingresos brutos · Día 5', color: 'bg-purple-50 border-purple-200' },
          { href: '/dashboard/tributacion/imi', icon: Building2, label: 'IMI Municipal', desc: '1% ingresos · Alcaldía', color: 'bg-orange-50 border-orange-200' },
          { href: '/dashboard/tributacion/retenciones', icon: DollarSign, label: 'Retenciones Definitivas', desc: 'Dividendos · Servicios · LCT art. 87', color: 'bg-indigo-50 border-indigo-200' },
          { href: '/dashboard/tributacion/isc', icon: FileText, label: 'ISC', desc: 'Selectivo al Consumo · LCT art. 150+', color: 'bg-pink-50 border-pink-200' },
          { href: '/dashboard/tributacion/calendario', icon: Calendar, label: 'Calendario Tributario', desc: 'Todas las fechas límite', color: 'bg-green-50 border-green-200' },
        ].map(m => (
          <a key={m.href} href={m.href} className={`flex flex-col gap-1 p-4 rounded-xl border-2 hover:shadow-md transition-shadow ${m.color}`}>
            <m.icon size={22} className="text-gray-600 mb-1" />
            <p className="font-semibold text-sm text-gray-800">{m.label}</p>
            <p className="text-xs text-gray-500">{m.desc}</p>
          </a>
        ))}
      </div>

      {/* Calendario */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">Obligaciones {anio}</h2>
          <div className="flex gap-2">
            {['pendiente','presentado','pagado'].map(e => (
              <button
                key={e}
                onClick={() => { setFiltroEstado(e); fetchCalendario(empresaId, anio, e) }}
                className={`px-3 py-1 text-xs rounded-full border ${filtroEstado === e ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
              >
                {e.charAt(0).toUpperCase() + e.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-400">Cargando...</div>
        ) : obligaciones.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <Calendar size={40} className="mx-auto mb-2 opacity-30" />
            <p>No hay obligaciones. Use <strong>Generar Calendario</strong> para crearlas.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Tipo','Descripción','Vencimiento','Estado','Acción'].map(h => (
                    <th key={h} className="px-4 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {obligaciones.map(o => {
                  const venc = new Date(o.fecha_vencimiento)
                  const diff = Math.ceil((venc.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24))
                  const esVencida = diff < 0 && o.estado === 'pendiente'
                  const esProxima = diff >= 0 && diff <= 10 && o.estado === 'pendiente'
                  return (
                    <tr key={o.id} className={`hover:bg-gray-50 ${esVencida ? 'bg-red-50' : esProxima ? 'bg-amber-50' : ''}`}>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full ${TIPO_COLOR[o.tipo_obligacion] ?? 'bg-gray-100 text-gray-700'}`}>
                          {TIPO_LABEL[o.tipo_obligacion] ?? o.tipo_obligacion}
                        </span>
                      </td>
                      <td className="px-4 py-3">{o.descripcion}</td>
                      <td className={`px-4 py-3 font-mono text-xs ${esVencida ? 'text-red-600 font-bold' : esProxima ? 'text-amber-600 font-semibold' : 'text-gray-600'}`}>
                        {o.fecha_vencimiento}
                        {esVencida && <span className="ml-1 text-red-500">⚠ VENCIDA</span>}
                        {esProxima && <span className="ml-1 text-amber-500">({diff}d)</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          o.estado === 'pagado' ? 'bg-green-100 text-green-700' :
                          o.estado === 'presentado' ? 'bg-blue-100 text-blue-700' :
                          esVencida ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'
                        }`}>{o.estado}</span>
                      </td>
                      <td className="px-4 py-3">
                        {o.estado === 'pendiente' && (
                          <button
                            onClick={() => marcarCumplido(o.id)}
                            className="flex items-center gap-1 text-xs text-green-700 hover:text-green-900"
                          >
                            <CheckCircle size={14} /> Marcar presentado
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
    </div>
  )
}
