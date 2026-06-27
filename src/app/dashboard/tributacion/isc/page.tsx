'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { FileText, Plus, CheckCircle, AlertTriangle, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

interface DeclaracionISC {
  id: string
  anio: number
  mes: number
  fecha_vencimiento: string
  base_imponible: number
  tasa: number
  monto_isc: number
  descripcion: string
  estado: 'pendiente' | 'declarado' | 'pagado' | 'exento'
  fecha_pago?: string
  numero_boleta?: string
  asiento_id?: string
}

// Tasas ISC según producto (LCT Art. 150+)
const TASAS_ISC = [
  { label: 'Bebidas alcohólicas (10%)',        tasa: 0.10 },
  { label: 'Cerveza (10%)',                     tasa: 0.10 },
  { label: 'Cigarrillos y tabaco (60%)',        tasa: 0.60 },
  { label: 'Bebidas gaseosas (7%)',             tasa: 0.07 },
  { label: 'Energizantes / Jugos artif. (15%)', tasa: 0.15 },
  { label: 'Combustibles (específico)',         tasa: 0    },
  { label: 'Otro (ingresar tasa manualmente)',  tasa: 0    },
]

const MESES = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const fmt = (n: number) => new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO' }).format(n ?? 0)

const FORM_INIT = {
  anio:          new Date().getFullYear(),
  mes:           new Date().getMonth() + 1,
  base_imponible: '',
  tasa:          '0.10',
  descripcion:   '',
}

export default function ISCPage() {
  const [declaraciones, setDeclaraciones] = useState<DeclaracionISC[]>([])
  const [loading,       setLoading]       = useState(true)
  const [empresaId,     setEmpresaId]     = useState('')
  const [anio,          setAnio]          = useState(new Date().getFullYear())
  const [showForm,      setShowForm]      = useState(false)
  const [form,          setForm]          = useState(FORM_INIT)
  const [saving,        setSaving]        = useState(false)
  const [error,         setError]         = useState('')
  const [pagando,       setPagando]       = useState<string | null>(null)

  const fetchDeclaraciones = useCallback(async (eid: string, a: number) => {
    setLoading(true)
    const r = await fetch(`/api/tributacion/isc?empresa_id=${eid}&anio=${a}`)
    const d = await r.json()
    setDeclaraciones(Array.isArray(d) ? d : [])
    setLoading(false)
  }, [])

  useEffect(() => {
    async function boot() {
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
    boot()
  }, [fetchDeclaraciones, anio])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    const r = await fetch('/api/tributacion/isc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        empresa_id:     empresaId,
        anio:           form.anio,
        mes:            form.mes,
        base_imponible: parseFloat(form.base_imponible) || 0,
        tasa:           parseFloat(form.tasa) || 0,
        descripcion:    form.descripcion,
      }),
    })
    const d = await r.json()
    setSaving(false)
    if (!r.ok) { setError(d.error || 'Error al guardar'); return }
    setShowForm(false)
    setForm(FORM_INIT)
    fetchDeclaraciones(empresaId, anio)
  }

  async function marcarPagado(decl: DeclaracionISC) {
    const boleta    = prompt('Número de boleta VET DGI (opcional):')
    const formaPago = confirm('¿Pago desde banco? (Cancelar = Caja)') ? 'banco' : 'caja'
    setPagando(decl.id)
    const r = await fetch('/api/tributacion/isc', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id:           decl.id,
        empresa_id:   empresaId,
        numero_boleta: boleta || undefined,
        forma_pago:   formaPago,
      }),
    })
    setPagando(null)
    if (r.ok) fetchDeclaraciones(empresaId, anio)
    else { const d = await r.json(); alert('Error: ' + d.error) }
  }

  const totalPendiente = declaraciones.filter(d => d.estado === 'pendiente').reduce((s, d) => s + d.monto_isc, 0)
  const totalPagado    = declaraciones.filter(d => d.estado === 'pagado').reduce((s, d) => s + d.monto_isc, 0)
  const hoy = new Date()

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/tributacion" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">ISC — Impuesto Selectivo al Consumo</h1>
            <p className="text-sm text-gray-500 mt-0.5">LCT Art. 150–165 · Declaración mensual DGI VET · Vence día 15</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select value={anio} onChange={e => setAnio(parseInt(e.target.value))}
            className="border rounded-lg px-3 py-2 text-sm">
            {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-pink-600 text-white rounded-lg text-sm hover:bg-pink-700">
            <Plus size={16} /> Nueva Declaración ISC
          </button>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
          <p className="text-sm text-gray-600">Pendiente {anio}</p>
          <p className="text-2xl font-bold text-amber-700">{fmt(totalPendiente)}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-4 border border-green-200">
          <p className="text-sm text-gray-600">Pagado {anio}</p>
          <p className="text-2xl font-bold text-green-700">{fmt(totalPagado)}</p>
        </div>
      </div>

      {/* Info legal */}
      <div className="bg-pink-50 border border-pink-200 rounded-xl p-4 text-sm text-pink-800 space-y-1">
        <p><strong>LCT Art. 150–165 — ISC:</strong> Grava la producción e importación de bienes específicos.</p>
        <p>Sujetos pasivos: productores, fabricantes e importadores de bienes gravados.</p>
        <p>Principales tasas: bebidas alcohólicas 10%, cigarrillos 60%, gaseosas 7%, energizantes 15%.</p>
        <p>Declaración y pago mensual ante la DGI, vence el <strong>día 15</strong> del mes siguiente.</p>
      </div>

      {/* Modal nueva declaración */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="p-6 space-y-4">
              <h2 className="text-lg font-bold">Nueva Declaración ISC</h2>
              {error && <div className="bg-red-50 text-red-700 px-4 py-2 rounded text-sm">{error}</div>}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Año *</label>
                    <select required className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={form.anio} onChange={e => setForm({ ...form, anio: parseInt(e.target.value) })}>
                      {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Mes *</label>
                    <select required className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={form.mes} onChange={e => setForm({ ...form, mes: parseInt(e.target.value) })}>
                      {MESES.slice(1).map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Tipo de producto / Tasa ISC *</label>
                  <select className="w-full border rounded-lg px-3 py-2 text-sm"
                    onChange={e => {
                      const t = TASAS_ISC[parseInt(e.target.value)]
                      setForm({ ...form, tasa: String(t.tasa), descripcion: t.label !== 'Otro (ingresar tasa manualmente)' ? t.label : form.descripcion })
                    }}>
                    {TASAS_ISC.map((t, i) => <option key={i} value={i}>{t.label}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Descripción del bien gravado *</label>
                  <input required className="w-full border rounded-lg px-3 py-2 text-sm"
                    placeholder="Ej: Venta de cervezas nacionales"
                    value={form.descripcion}
                    onChange={e => setForm({ ...form, descripcion: e.target.value })} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Base imponible (C$) *</label>
                    <input required type="number" step="0.01" min="0"
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={form.base_imponible}
                      onChange={e => setForm({ ...form, base_imponible: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Tasa ISC *</label>
                    <input required type="number" step="0.01" min="0" max="1"
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={form.tasa}
                      onChange={e => setForm({ ...form, tasa: e.target.value })} />
                    <p className="text-xs text-gray-400 mt-1">Decimal: 0.10 = 10%</p>
                  </div>
                </div>

                {form.base_imponible && (
                  <div className="bg-pink-50 border border-pink-200 rounded-lg p-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">ISC a pagar:</span>
                      <strong className="text-pink-800">
                        {fmt((parseFloat(form.base_imponible) || 0) * (parseFloat(form.tasa) || 0))}
                        {' '}({((parseFloat(form.tasa) || 0) * 100).toFixed(0)}%)
                      </strong>
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => { setShowForm(false); setError('') }}
                    className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
                  <button type="submit" disabled={saving}
                    className="px-4 py-2 bg-pink-600 text-white rounded-lg text-sm hover:bg-pink-700 disabled:opacity-50">
                    {saving ? 'Guardando...' : 'Registrar ISC'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Tabla */}
      {loading ? (
        <div className="text-center py-10 text-gray-400">Cargando...</div>
      ) : declaraciones.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <FileText size={48} className="mx-auto mb-3 opacity-30" />
          <p className="font-medium">No hay declaraciones ISC para {anio}</p>
          <p className="text-sm mt-1">El ISC aplica si tu empresa produce o importa bienes gravados (alcohol, tabaco, gaseosas, etc.)</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Período','Descripción','Base Imponible','Tasa','ISC','Vencimiento','Estado','Acción'].map(h => (
                  <th key={h} className="px-3 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {declaraciones.map(d => {
                const vencida = d.estado === 'pendiente' && new Date(d.fecha_vencimiento) < hoy
                const proxima = d.estado === 'pendiente' && !vencida &&
                  Math.ceil((new Date(d.fecha_vencimiento).getTime() - hoy.getTime()) / 86400000) <= 10
                return (
                  <tr key={d.id} className={`hover:bg-gray-50 ${vencida ? 'bg-red-50' : proxima ? 'bg-amber-50' : ''}`}>
                    <td className="px-3 py-3 font-medium whitespace-nowrap">{MESES[d.mes]} {d.anio}</td>
                    <td className="px-3 py-3 text-xs max-w-xs truncate">{d.descripcion}</td>
                    <td className="px-3 py-3">{fmt(d.base_imponible)}</td>
                    <td className="px-3 py-3">{((d.tasa ?? 0) * 100).toFixed(0)}%</td>
                    <td className="px-3 py-3 font-bold text-pink-700">{fmt(d.monto_isc)}</td>
                    <td className="px-3 py-3 font-mono text-xs">
                      <span className={vencida ? 'text-red-600 font-bold' : proxima ? 'text-amber-600' : 'text-gray-600'}>
                        {d.fecha_vencimiento}
                        {vencida && <span className="ml-1">⚠</span>}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        d.estado === 'pagado'   ? 'bg-green-100 text-green-700'  :
                        d.estado === 'declarado'? 'bg-blue-100 text-blue-700'    :
                        d.estado === 'exento'   ? 'bg-gray-100 text-gray-600'    :
                        vencida                 ? 'bg-red-100 text-red-700'      :
                                                  'bg-amber-100 text-amber-700'
                      }`}>
                        {d.estado === 'pendiente' && vencida ? 'VENCIDA' : d.estado.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {d.estado === 'pendiente' && (
                        <button
                          onClick={() => marcarPagado(d)}
                          disabled={pagando === d.id}
                          className="flex items-center gap-1 px-3 py-1 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                        >
                          <CheckCircle size={12} />
                          {pagando === d.id ? 'Procesando...' : 'Pagar'}
                        </button>
                      )}
                      {d.estado === 'pagado' && d.asiento_id && (
                        <span className="text-xs text-green-600 flex items-center gap-1">
                          <CheckCircle size={12} /> Con asiento
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="bg-gray-50 border-t font-semibold text-sm">
              <tr>
                <td colSpan={4} className="px-3 py-3 text-right text-gray-600">Total ISC {anio}:</td>
                <td className="px-3 py-3 text-pink-700">
                  {fmt(declaraciones.reduce((s, d) => s + d.monto_isc, 0))}
                </td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
