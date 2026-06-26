'use client'
import { useState, useEffect } from 'react'
import { FileX, Plus, ArrowUpDown } from 'lucide-react'

interface Nota {
  id: string
  tipo: 'credito' | 'debito'
  numero_nota: string
  fecha: string
  motivo: string
  subtotal: number
  iva: number
  total: number
  estado: string
  factura?: { numero_factura: string }
  compra?: { numero_compra: string }
  cliente?: { nombre: string }
  proveedor?: { nombre: string }
}

const fmt = (n: number) => new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO' }).format(n ?? 0)

export default function NotasCreditoDebitoPage() {
  const [notas, setNotas] = useState<Nota[]>([])
  const [loading, setLoading] = useState(true)
  const [empresaId, setEmpresaId] = useState('')
  const [filtroTipo, setFiltroTipo] = useState<string>('todos')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    tipo: 'credito' as 'credito' | 'debito',
    fecha: new Date().toISOString().split('T')[0],
    motivo: '',
    ref_factura_id: '',
    ref_compra_id: '',
    subtotal: '',
    iva: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const eid = localStorage.getItem('empresa_id') || ''
    setEmpresaId(eid)
    if (eid) fetchNotas(eid)
  }, [])

  async function fetchNotas(eid: string, tipo?: string) {
    setLoading(true)
    let url = `/api/notas-credito-debito?empresa_id=${eid}`
    if (tipo && tipo !== 'todos') url += `&tipo=${tipo}`
    const r = await fetch(url)
    const d = await r.json()
    setNotas(Array.isArray(d) ? d : [])
    setLoading(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const sub = parseFloat(form.subtotal) || 0
    const iva = parseFloat(form.iva) || (sub * 0.15)
    const r = await fetch('/api/notas-credito-debito', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        empresa_id: empresaId,
        tipo: form.tipo,
        fecha: form.fecha,
        motivo: form.motivo,
        ref_factura_id: form.ref_factura_id || undefined,
        ref_compra_id: form.ref_compra_id || undefined,
        subtotal: sub,
        iva,
        total: sub + iva,
        estado: 'emitida'
      })
    })
    const d = await r.json()
    setSaving(false)
    if (!r.ok) { setError(d.error); return }
    setShowForm(false)
    fetchNotas(empresaId, filtroTipo !== 'todos' ? filtroTipo : undefined)
  }

  const totalCredito = notas.filter(n => n.tipo === 'credito' && n.estado !== 'anulada').reduce((s, n) => s + n.total, 0)
  const totalDebito = notas.filter(n => n.tipo === 'debito' && n.estado !== 'anulada').reduce((s, n) => s + n.total, 0)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notas de Crédito y Débito</h1>
          <p className="text-sm text-gray-500 mt-1">LCT Art. 116 · Numeración correlativa DGI · Reversión automática de IVA</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
          <Plus size={16} /> Nueva Nota
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-green-50 rounded-xl p-4">
          <p className="text-sm text-gray-600">Notas de Crédito (devoluciones venta)</p>
          <p className="text-xl font-bold text-green-700">{fmt(totalCredito)}</p>
          <p className="text-xs text-gray-400 mt-1">{notas.filter(n => n.tipo === 'credito').length} documento(s)</p>
        </div>
        <div className="bg-red-50 rounded-xl p-4">
          <p className="text-sm text-gray-600">Notas de Débito (devoluciones compra)</p>
          <p className="text-xl font-bold text-red-700">{fmt(totalDebito)}</p>
          <p className="text-xs text-gray-400 mt-1">{notas.filter(n => n.tipo === 'debito').length} documento(s)</p>
        </div>
      </div>

      <div className="flex gap-2">
        {['todos','credito','debito'].map(t => (
          <button key={t} onClick={() => { setFiltroTipo(t); fetchNotas(empresaId, t !== 'todos' ? t : undefined) }}
            className={`px-3 py-1 text-xs rounded-full border ${filtroTipo === t ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600'}`}>
            {t === 'todos' ? 'Todos' : t === 'credito' ? 'Notas de Crédito (NC)' : 'Notas de Débito (ND)'}
          </button>
        ))}
      </div>

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
            <div className="p-6 space-y-4">
              <h2 className="text-lg font-bold">Nueva Nota de Crédito / Débito</h2>
              {error && <div className="bg-red-50 text-red-700 px-4 py-2 rounded text-sm">{error}</div>}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Tipo *</label>
                  <select required className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={form.tipo} onChange={e => setForm({...form, tipo: e.target.value as 'credito'|'debito'})}>
                    <option value="credito">Nota de Crédito (NC) — Devolución de venta</option>
                    <option value="debito">Nota de Débito (ND) — Devolución de compra</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Fecha *</label>
                  <input required type="date" className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={form.fecha} onChange={e => setForm({...form, fecha: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Motivo *</label>
                  <input required className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Razón de la nota..."
                    value={form.motivo} onChange={e => setForm({...form, motivo: e.target.value})} />
                </div>
                {form.tipo === 'credito' ? (
                  <div>
                    <label className="block text-sm font-medium mb-1">N° Factura de Venta Origen</label>
                    <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="ID de la factura"
                      value={form.ref_factura_id} onChange={e => setForm({...form, ref_factura_id: e.target.value})} />
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium mb-1">N° Compra Origen</label>
                    <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="ID de la compra"
                      value={form.ref_compra_id} onChange={e => setForm({...form, ref_compra_id: e.target.value})} />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Subtotal (C$) *</label>
                    <input required type="number" step="0.01" min="0" className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={form.subtotal}
                      onChange={e => {
                        const sub = parseFloat(e.target.value) || 0
                        setForm({...form, subtotal: e.target.value, iva: (sub * 0.15).toFixed(2)})
                      }} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">IVA 15% (C$)</label>
                    <input type="number" step="0.01" min="0" className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={form.iva} onChange={e => setForm({...form, iva: e.target.value})} />
                  </div>
                </div>
                {form.subtotal && (
                  <div className="bg-gray-50 rounded-lg p-3 text-sm">
                    Total: <strong>{fmt((parseFloat(form.subtotal)||0) + (parseFloat(form.iva)||0))}</strong>
                  </div>
                )}
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
                  <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
                    {saving ? 'Guardando...' : 'Emitir Nota'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-gray-400">Cargando...</div>
      ) : notas.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <FileX size={40} className="mx-auto mb-2 opacity-30" />
          <p>No hay notas emitidas</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['N° Nota','Tipo','Fecha','Motivo','Documento Origen','Subtotal','IVA','Total','Estado'].map(h => (
                  <th key={h} className="px-3 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {notas.map(n => (
                <tr key={n.id} className="hover:bg-gray-50">
                  <td className="px-3 py-3 font-mono text-xs font-bold">{n.numero_nota}</td>
                  <td className="px-3 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${n.tipo === 'credito' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {n.tipo === 'credito' ? 'N/C' : 'N/D'}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-xs">{n.fecha}</td>
                  <td className="px-3 py-3 text-xs max-w-xs truncate">{n.motivo}</td>
                  <td className="px-3 py-3 text-xs">
                    {n.factura ? `F: ${n.factura.numero_factura}` : n.compra ? `C: ${n.compra.numero_compra}` : '—'}
                    {n.cliente && <span className="block text-gray-400">{n.cliente.nombre}</span>}
                    {n.proveedor && <span className="block text-gray-400">{n.proveedor.nombre}</span>}
                  </td>
                  <td className="px-3 py-3">{fmt(n.subtotal)}</td>
                  <td className="px-3 py-3">{fmt(n.iva)}</td>
                  <td className="px-3 py-3 font-bold">{fmt(n.total)}</td>
                  <td className="px-3 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      n.estado === 'aplicada' ? 'bg-green-100 text-green-700' :
                      n.estado === 'anulada' ? 'bg-red-100 text-red-600' :
                      'bg-blue-100 text-blue-700'
                    }`}>{n.estado}</span>
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
