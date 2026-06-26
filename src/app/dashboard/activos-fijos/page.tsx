'use client'
import { useState, useEffect } from 'react'
import { Package, TrendingDown, FileText, Plus, AlertTriangle } from 'lucide-react'

interface ActivoFijo {
  id: string
  codigo: string
  nombre: string
  categoria: string
  costo_adquisicion: number
  valor_en_libros: number
  tasa_depreciacion_anual: number
  vida_util_anios: number
  fecha_adquisicion: string
  fecha_inicio_dep: string
  estado: string
  ubicacion?: string
}

const CATEGORIAS: Record<string, { label: string; tasa: number; color: string }> = {
  edificio:           { label: 'Edificio',          tasa: 0.05, color: 'bg-blue-100 text-blue-700' },
  equipo_produccion:  { label: 'Equipo Producción', tasa: 0.20, color: 'bg-green-100 text-green-700' },
  vehiculo:           { label: 'Vehículo',          tasa: 0.20, color: 'bg-orange-100 text-orange-700' },
  mobiliario:         { label: 'Mobiliario',        tasa: 0.20, color: 'bg-purple-100 text-purple-700' },
  equipo_tic:         { label: 'TIC',               tasa: 0.50, color: 'bg-pink-100 text-pink-700' },
  otro:               { label: 'Otro',              tasa: 0.10, color: 'bg-gray-100 text-gray-700' },
}

const fmt = (n: number) => new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO' }).format(n)

export default function ActivosFijosPage() {
  const [activos, setActivos] = useState<ActivoFijo[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [empresaId, setEmpresaId] = useState<string>('')
  const [form, setForm] = useState({
    codigo: '', nombre: '', descripcion: '', categoria: 'equipo_produccion',
    costo_adquisicion: '', valor_residual: '0',
    fecha_adquisicion: new Date().toISOString().split('T')[0],
    fecha_inicio_dep: new Date().toISOString().split('T')[0],
    vida_util_anios: '', ubicacion: ''
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // Obtener empresa_id desde localStorage
    const eid = localStorage.getItem('empresa_id') || ''
    setEmpresaId(eid)
    if (eid) fetchActivos(eid)
  }, [])

  async function fetchActivos(eid: string) {
    setLoading(true)
    const r = await fetch(`/api/activos-fijos?empresa_id=${eid}`)
    const d = await r.json()
    setActivos(d)
    setLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const cat = CATEGORIAS[form.categoria]
    const vida = parseFloat(form.vida_util_anios)
    const r = await fetch('/api/activos-fijos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        empresa_id: empresaId,
        ...form,
        costo_adquisicion: parseFloat(form.costo_adquisicion),
        valor_residual: parseFloat(form.valor_residual) || 0,
        vida_util_anios: vida,
        tasa_depreciacion_anual: cat?.tasa ?? 0.10
      })
    })
    const d = await r.json()
    if (!r.ok) { setError(d.error); setSaving(false); return }
    setShowForm(false)
    setForm({ codigo: '', nombre: '', descripcion: '', categoria: 'equipo_produccion', costo_adquisicion: '', valor_residual: '0', fecha_adquisicion: new Date().toISOString().split('T')[0], fecha_inicio_dep: new Date().toISOString().split('T')[0], vida_util_anios: '', ubicacion: '' })
    fetchActivos(empresaId)
    setSaving(false)
  }

  async function calcularDepreciacion() {
    const hoy = new Date()
    const r = await fetch('/api/activos-fijos/depreciacion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        empresa_id: empresaId,
        anio: hoy.getFullYear(),
        mes: hoy.getMonth() + 1
      })
    })
    const d = await r.json()
    alert(`Depreciación calculada: ${d.procesados} activos procesados${d.errores?.length ? '\nErrores: ' + d.errores.join('\n') : ''}`)
    fetchActivos(empresaId)
  }

  const totalCosto = activos.reduce((s, a) => s + a.costo_adquisicion, 0)
  const totalLibros = activos.reduce((s, a) => s + a.valor_en_libros, 0)
  const totalDep = totalCosto - totalLibros

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Activos Fijos y Depreciación</h1>
          <p className="text-sm text-gray-500 mt-1">Ley 822 LCT Art. 45 — Cuotas de depreciación deducibles IR anual</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={calcularDepreciacion}
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-sm"
          >
            <TrendingDown size={16} />
            Calcular Dep. del Mes
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
          >
            <Plus size={16} />
            Nuevo Activo
          </button>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Costo Total Activos', value: fmt(totalCosto), color: 'text-blue-700', bg: 'bg-blue-50' },
          { label: 'Depreciación Acumulada', value: fmt(totalDep), color: 'text-red-700', bg: 'bg-red-50' },
          { label: 'Valor en Libros', value: fmt(totalLibros), color: 'text-green-700', bg: 'bg-green-50' },
        ].map(card => (
          <div key={card.label} className={`${card.bg} rounded-xl p-4`}>
            <p className="text-sm text-gray-600">{card.label}</p>
            <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Tasas LCT */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm font-semibold text-blue-800 mb-2">Tasas de Depreciación — LCT Art. 45</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(CATEGORIAS).map(([k, v]) => (
            <span key={k} className={`text-xs px-2 py-1 rounded-full font-medium ${v.color}`}>
              {v.label}: {(v.tasa * 100).toFixed(0)}% anual
            </span>
          ))}
        </div>
      </div>

      {/* Formulario */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-screen overflow-y-auto">
            <div className="p-6">
              <h2 className="text-lg font-bold mb-4">Registrar Activo Fijo</h2>
              {error && <div className="bg-red-50 text-red-700 px-4 py-2 rounded mb-4 text-sm">{error}</div>}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Código *</label>
                    <input required className="w-full border rounded-lg px-3 py-2 text-sm" value={form.codigo} onChange={e => setForm({...form, codigo: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                    <input required className="w-full border rounded-lg px-3 py-2 text-sm" value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Categoría LCT *</label>
                  <select required className="w-full border rounded-lg px-3 py-2 text-sm" value={form.categoria} onChange={e => {
                    const cat = e.target.value
                    const vida = cat === 'edificio' ? '20' : cat === 'equipo_tic' ? '2' : '5'
                    setForm({...form, categoria: cat, vida_util_anios: vida})
                  }}>
                    {Object.entries(CATEGORIAS).map(([k, v]) => (
                      <option key={k} value={k}>{v.label} — {(v.tasa*100).toFixed(0)}% anual</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Costo Adquisición (C$) *</label>
                    <input required type="number" step="0.01" min="0" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.costo_adquisicion} onChange={e => setForm({...form, costo_adquisicion: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Valor Residual (C$)</label>
                    <input type="number" step="0.01" min="0" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.valor_residual} onChange={e => setForm({...form, valor_residual: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Vida Útil (años) *</label>
                    <input required type="number" step="0.5" min="0.5" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.vida_util_anios} onChange={e => setForm({...form, vida_util_anios: e.target.value})} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Fecha Adquisición *</label>
                    <input required type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.fecha_adquisicion} onChange={e => setForm({...form, fecha_adquisicion: e.target.value, fecha_inicio_dep: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Inicio Depreciación *</label>
                    <input required type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.fecha_inicio_dep} onChange={e => setForm({...form, fecha_inicio_dep: e.target.value})} />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ubicación</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.ubicacion} onChange={e => setForm({...form, ubicacion: e.target.value})} />
                </div>
                {form.costo_adquisicion && form.vida_util_anios && (
                  <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm">
                    <strong>Cuota mensual estimada:</strong>{' '}
                    {fmt((parseFloat(form.costo_adquisicion) - parseFloat(form.valor_residual || '0')) / (parseFloat(form.vida_util_anios) * 12))}
                    {' '}· Tasa anual: {(CATEGORIAS[form.categoria]?.tasa * 100).toFixed(0)}%
                  </div>
                )}
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
                  <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                    {saving ? 'Guardando...' : 'Guardar Activo'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Tabla */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Cargando activos...</div>
      ) : activos.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Package size={48} className="mx-auto mb-3 opacity-30" />
          <p>No hay activos fijos registrados</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Código','Nombre','Categoría','Costo Adq.','Dep. Acum.','Valor Libros','Vida Útil','Estado'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {activos.map(a => {
                const depAcum = a.costo_adquisicion - a.valor_en_libros
                const pctDep = (depAcum / a.costo_adquisicion) * 100
                return (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs">{a.codigo}</td>
                    <td className="px-4 py-3 font-medium">{a.nombre}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full ${CATEGORIAS[a.categoria]?.color ?? 'bg-gray-100 text-gray-700'}`}>
                        {CATEGORIAS[a.categoria]?.label ?? a.categoria}
                      </span>
                    </td>
                    <td className="px-4 py-3">{fmt(a.costo_adquisicion)}</td>
                    <td className="px-4 py-3 text-red-600">{fmt(depAcum)} <span className="text-gray-400 text-xs">({pctDep.toFixed(0)}%)</span></td>
                    <td className="px-4 py-3 font-semibold text-green-700">{fmt(a.valor_en_libros)}</td>
                    <td className="px-4 py-3">{a.vida_util_anios} años</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        a.estado === 'activo' ? 'bg-green-100 text-green-700' :
                        a.estado === 'depreciado' ? 'bg-gray-100 text-gray-600' :
                        'bg-red-100 text-red-600'
                      }`}>{a.estado}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex gap-3">
        <AlertTriangle size={18} className="text-yellow-600 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-yellow-800">
          <strong>Recordatorio DGI:</strong> La depreciación debe calcularse y contabilizarse mensualmente
          para ser deducible del IR anual (LCT Art. 45). Use el botón <em>"Calcular Dep. del Mes"</em> al
          cerrar cada período contable.
        </p>
      </div>
    </div>
  )
}
