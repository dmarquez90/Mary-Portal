'use client'
import { useState, useEffect } from 'react'
import { FileBarChart2, Plus } from 'lucide-react'

interface Retencion {
  id: string
  anio: number
  mes: number
  tipo_retencion: string
  beneficiario_nombre: string
  beneficiario_ruc?: string
  concepto: string
  base_imponible: number
  tasa: number
  monto_retenido: number
  fecha_pago: string
  estado: 'pendiente' | 'declarado' | 'pagado'
  numero_boleta?: string
}

const TIPOS_RETENCION = [
  { value: 'dividendos_residentes',      label: 'Dividendos — Residentes (5%)',       tasa: 0.05 },
  { value: 'dividendos_no_residentes',   label: 'Dividendos — No Residentes (10%)',   tasa: 0.10 },
  { value: 'donaciones',                 label: 'Donaciones (10%)',                    tasa: 0.10 },
  { value: 'servicios_no_residentes',    label: 'Servicios No Residentes (10-20%)',   tasa: 0.15 },
  { value: 'premios_loteria',            label: 'Premios / Loterías (10%)',            tasa: 0.10 },
  { value: 'herencias_legados',          label: 'Herencias y Legados (5%)',            tasa: 0.05 },
  { value: 'otro',                       label: 'Otro (especificar tasa)',             tasa: 0.10 },
]

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const fmt = (n: number) => new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO' }).format(n ?? 0)

const FORM_INIT = {
  tipo_retencion: 'dividendos_residentes',
  beneficiario_nombre: '',
  beneficiario_ruc: '',
  concepto: '',
  base_imponible: '',
  tasa: '0.05',
  fecha_pago: new Date().toISOString().split('T')[0],
  anio: new Date().getFullYear(),
  mes: new Date().getMonth() + 1,
}

export default function RetencionesDefinitivasPage() {
  const [retenciones, setRetenciones] = useState<Retencion[]>([])
  const [loading, setLoading] = useState(true)
  const [empresaId, setEmpresaId] = useState('')
  const [filtroAnio, setFiltroAnio] = useState(new Date().getFullYear())
  const [filtroMes, setFiltroMes] = useState<number | ''>('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(FORM_INIT)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const eid = localStorage.getItem('empresa_id') || ''
    setEmpresaId(eid)
    if (eid) fetchRetenciones(eid, filtroAnio)
  }, [])

  async function fetchRetenciones(eid: string, a: number, m?: number | '') {
    setLoading(true)
    let url = `/api/tributacion/retenciones-definitivas?empresa_id=${eid}&anio=${a}`
    if (m) url += `&mes=${m}`
    const r = await fetch(url)
    const d = await r.json()
    setRetenciones(Array.isArray(d) ? d : [])
    setLoading(false)
  }

  function onTipoChange(tipo: string) {
    const t = TIPOS_RETENCION.find(t => t.value === tipo)
    setForm({ ...form, tipo_retencion: tipo, tasa: String(t?.tasa ?? 0.10) })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const r = await fetch('/api/tributacion/retenciones-definitivas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        empresa_id: empresaId,
        tipo_retencion: form.tipo_retencion,
        beneficiario_nombre: form.beneficiario_nombre,
        beneficiario_ruc: form.beneficiario_ruc || undefined,
        concepto: form.concepto,
        base_imponible: parseFloat(form.base_imponible) || 0,
        tasa: parseFloat(form.tasa) || 0,
        fecha_pago: form.fecha_pago,
        anio: form.anio,
        mes: form.mes,
        estado: 'pendiente',
      })
    })
    const d = await r.json()
    setSaving(false)
    if (!r.ok) { setError(d.error || 'Error al guardar'); return }
    setShowForm(false)
    setForm(FORM_INIT)
    fetchRetenciones(empresaId, filtroAnio, filtroMes)
  }

  const totalRetenido = retenciones.filter(r => r.estado !== 'pendiente' || true).reduce((s, r) => s + r.monto_retenido, 0)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Retenciones Definitivas</h1>
          <p className="text-sm text-gray-500 mt-1">LCT Art. 87 · Dividendos, donaciones, no residentes · Declaración mensual DGI VET</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
        >
          <Plus size={16} /> Nueva Retención
        </button>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3">
        <select className="border rounded-lg px-3 py-2 text-sm" value={filtroAnio}
          onChange={e => { const a = parseInt(e.target.value); setFiltroAnio(a); fetchRetenciones(empresaId, a, filtroMes) }}>
          {[2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select className="border rounded-lg px-3 py-2 text-sm" value={filtroMes}
          onChange={e => { const m = e.target.value ? parseInt(e.target.value) : ''; setFiltroMes(m); fetchRetenciones(empresaId, filtroAnio, m) }}>
          <option value="">Todos los meses</option>
          {MESES.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
        </select>
        <div className="ml-auto bg-blue-50 rounded-lg px-4 py-2 text-sm">
          Total retenido: <strong className="text-blue-700">{fmt(totalRetenido)}</strong>
        </div>
      </div>

      {/* Info legal */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
        <strong>LCT Art. 87 — Retenciones Definitivas:</strong> Dividendos residentes 5%, dividendos no residentes 10%,
        donaciones 10%, servicios técnicos de no residentes 10–20%, premios de loterías 10%.
        El retenedor debe declarar y enterar mensualmente a la DGI mediante el VET.
      </div>

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="p-6 space-y-4">
              <h2 className="text-lg font-bold">Nueva Retención Definitiva</h2>
              {error && <div className="bg-red-50 text-red-700 px-4 py-2 rounded text-sm">{error}</div>}
              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Tipo de Retención *</label>
                  <select required className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={form.tipo_retencion} onChange={e => onTipoChange(e.target.value)}>
                    {TIPOS_RETENCION.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Año *</label>
                    <select required className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={form.anio} onChange={e => setForm({...form, anio: parseInt(e.target.value)})}>
                      {[2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Mes *</label>
                    <select required className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={form.mes} onChange={e => setForm({...form, mes: parseInt(e.target.value)})}>
                      {MESES.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Beneficiario (nombre) *</label>
                  <input required className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={form.beneficiario_nombre} onChange={e => setForm({...form, beneficiario_nombre: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">RUC / Cédula del Beneficiario</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={form.beneficiario_ruc} onChange={e => setForm({...form, beneficiario_ruc: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Concepto *</label>
                  <input required className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={form.concepto} onChange={e => setForm({...form, concepto: e.target.value})} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Base Imponible (C$) *</label>
                    <input required type="number" step="0.01" min="0" className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={form.base_imponible} onChange={e => setForm({...form, base_imponible: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Tasa *</label>
                    <input required type="number" step="0.01" min="0" max="1" className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={form.tasa} onChange={e => setForm({...form, tasa: e.target.value})} />
                  </div>
                </div>
                {form.base_imponible && (
                  <div className="bg-gray-50 rounded-lg p-3 text-sm">
                    Retención: <strong>{fmt((parseFloat(form.base_imponible)||0) * (parseFloat(form.tasa)||0))}</strong>
                    {' '}({((parseFloat(form.tasa)||0)*100).toFixed(0)}% de {fmt(parseFloat(form.base_imponible)||0)})
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium mb-1">Fecha de Pago *</label>
                  <input required type="date" className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={form.fecha_pago} onChange={e => setForm({...form, fecha_pago: e.target.value})} />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => { setShowForm(false); setError('') }}
                    className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
                  <button type="submit" disabled={saving}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                    {saving ? 'Guardando...' : 'Registrar Retención'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Tabla */}
      {loading ? (
        <div className="text-center py-8 text-gray-400">Cargando...</div>
      ) : retenciones.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <FileBarChart2 size={40} className="mx-auto mb-2 opacity-30" />
          <p>No hay retenciones definitivas registradas para el período seleccionado</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Período','Tipo','Beneficiario','RUC','Concepto','Base','Tasa','Retenido','Fecha Pago','Estado'].map(h => (
                  <th key={h} className="px-3 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {retenciones.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-3 py-3 whitespace-nowrap">{MESES[(r.mes ?? 1) - 1]} {r.anio}</td>
                  <td className="px-3 py-3 text-xs max-w-[140px] truncate">
                    {TIPOS_RETENCION.find(t => t.value === r.tipo_retencion)?.label ?? r.tipo_retencion}
                  </td>
                  <td className="px-3 py-3">{r.beneficiario_nombre}</td>
                  <td className="px-3 py-3 text-xs font-mono">{r.beneficiario_ruc || '—'}</td>
                  <td className="px-3 py-3 text-xs max-w-xs truncate">{r.concepto}</td>
                  <td className="px-3 py-3">{fmt(r.base_imponible)}</td>
                  <td className="px-3 py-3">{((r.tasa ?? 0) * 100).toFixed(0)}%</td>
                  <td className="px-3 py-3 font-bold text-red-700">{fmt(r.monto_retenido)}</td>
                  <td className="px-3 py-3 text-xs">{r.fecha_pago}</td>
                  <td className="px-3 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      r.estado === 'pagado' ? 'bg-green-100 text-green-700' :
                      r.estado === 'declarado' ? 'bg-blue-100 text-blue-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>{r.estado.toUpperCase()}</span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t">
              <tr>
                <td colSpan={7} className="px-3 py-3 text-sm font-semibold text-right text-gray-600">Total retenido:</td>
                <td className="px-3 py-3 font-bold text-red-700">{fmt(totalRetenido)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
