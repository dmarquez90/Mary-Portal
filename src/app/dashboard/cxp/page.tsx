'use client'
import { useState, useEffect } from 'react'
import { ShoppingBag, Plus } from 'lucide-react'

interface SaldoCxP {
  compra_id: string
  numero_compra: string
  fecha_compra: string
  fecha_vencimiento?: string
  monto_original: number
  total_abonado: number
  saldo_pendiente: number
  estado_pago: 'vigente' | 'vencida' | 'pagada'
  dias_vencido: number
  proveedor_id: string
  proveedor?: { nombre: string; telefono?: string; correo?: string }
}

const fmt = (n: number) => new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO' }).format(n ?? 0)

export default function CxPPage() {
  const [saldos, setSaldos] = useState<SaldoCxP[]>([])
  const [loading, setLoading] = useState(true)
  const [empresaId, setEmpresaId] = useState('')
  const [filtro, setFiltro] = useState('vigente')
  const [modalAbono, setModalAbono] = useState<SaldoCxP | null>(null)
  const [abono, setAbono] = useState({ monto: '', fecha: new Date().toISOString().split('T')[0], forma_pago: 'transferencia', referencia: '', notas: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const eid = localStorage.getItem('empresa_id') || ''
    setEmpresaId(eid)
    if (eid) fetchSaldos(eid, 'vigente')
  }, [])

  async function fetchSaldos(eid: string, estado?: string) {
    setLoading(true)
    let url = `/api/cxp?empresa_id=${eid}`
    if (estado && estado !== 'todos') url += `&estado=${estado}`
    const r = await fetch(url)
    const d = await r.json()
    setSaldos(Array.isArray(d) ? d : [])
    setLoading(false)
  }

  async function registrarAbono() {
    if (!modalAbono) return
    setSaving(true)
    const r = await fetch('/api/cxp/abonos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        empresa_id: empresaId,
        compra_id: modalAbono.compra_id,
        proveedor_id: modalAbono.proveedor_id,
        ...abono,
        monto: parseFloat(abono.monto)
      })
    })
    setSaving(false)
    if (r.ok) {
      setModalAbono(null)
      fetchSaldos(empresaId, filtro)
    } else {
      const d = await r.json(); alert('Error: ' + d.error)
    }
  }

  const totalPendiente = saldos.filter(s => s.estado_pago !== 'pagada').reduce((s, c) => s + c.saldo_pendiente, 0)
  const totalVencido = saldos.filter(s => s.estado_pago === 'vencida').reduce((s, c) => s + c.saldo_pendiente, 0)

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Cuentas por Pagar (CxP)</h1>
        <p className="text-sm text-gray-500 mt-1">Deudas a proveedores — Antigüedad de saldo — Pagos parciales</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-orange-50 rounded-xl p-4">
          <p className="text-sm text-gray-600">Total por Pagar</p>
          <p className="text-xl font-bold text-orange-700">{fmt(totalPendiente)}</p>
        </div>
        <div className="bg-red-50 rounded-xl p-4">
          <p className="text-sm text-gray-600">Vencido</p>
          <p className="text-xl font-bold text-red-700">{fmt(totalVencido)}</p>
        </div>
        <div className="bg-gray-50 rounded-xl p-4">
          <p className="text-sm text-gray-600">Documentos</p>
          <p className="text-xl font-bold text-gray-700">{saldos.filter(s => s.estado_pago !== 'pagada').length}</p>
        </div>
      </div>

      <div className="flex gap-2">
        {['vigente','vencida','pagada','todos'].map(e => (
          <button key={e} onClick={() => { setFiltro(e); fetchSaldos(empresaId, e) }}
            className={`px-3 py-1 text-xs rounded-full border ${filtro === e ? 'bg-orange-600 text-white border-orange-600' : 'border-gray-300 text-gray-600'}`}>
            {e.charAt(0).toUpperCase() + e.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-400">Cargando...</div>
      ) : saldos.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <ShoppingBag size={40} className="mx-auto mb-2 opacity-30" />
          <p>No hay saldos pendientes con proveedores</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Compra','Proveedor','Fecha','Vencimiento','Original','Abonado','Saldo','Estado','Acción'].map(h => (
                  <th key={h} className="px-3 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {saldos.map(s => (
                <tr key={s.compra_id} className={`hover:bg-gray-50 ${s.estado_pago === 'vencida' ? 'bg-red-50' : ''}`}>
                  <td className="px-3 py-3 font-mono text-xs">{s.numero_compra}</td>
                  <td className="px-3 py-3 font-medium">{s.proveedor?.nombre ?? '—'}</td>
                  <td className="px-3 py-3 text-xs">{s.fecha_compra}</td>
                  <td className={`px-3 py-3 text-xs ${s.estado_pago === 'vencida' ? 'text-red-600 font-bold' : ''}`}>
                    {s.fecha_vencimiento ?? '—'}
                    {s.dias_vencido > 0 && <span className="ml-1 text-red-500">+{s.dias_vencido}d</span>}
                  </td>
                  <td className="px-3 py-3">{fmt(s.monto_original)}</td>
                  <td className="px-3 py-3 text-green-600">{fmt(s.total_abonado)}</td>
                  <td className="px-3 py-3 font-bold text-orange-700">{fmt(s.saldo_pendiente)}</td>
                  <td className="px-3 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      s.estado_pago === 'pagada' ? 'bg-green-100 text-green-700' :
                      s.estado_pago === 'vencida' ? 'bg-red-100 text-red-600' :
                      'bg-orange-100 text-orange-700'
                    }`}>{s.estado_pago}</span>
                  </td>
                  <td className="px-3 py-3">
                    {s.estado_pago !== 'pagada' && (
                      <button onClick={() => setModalAbono(s)}
                        className="flex items-center gap-1 text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded hover:bg-orange-200">
                        <Plus size={12} /> Abonar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalAbono && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="p-6 space-y-4">
              <h2 className="text-lg font-bold">Registrar Pago a Proveedor</h2>
              <div className="bg-orange-50 rounded-lg p-3 text-sm">
                <p><strong>{modalAbono.numero_compra}</strong> — {modalAbono.proveedor?.nombre}</p>
                <p>Saldo pendiente: <strong className="text-orange-700">{fmt(modalAbono.saldo_pendiente)}</strong></p>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Monto (C$) *</label>
                  <input type="number" step="0.01" max={modalAbono.saldo_pendiente} required
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={abono.monto} onChange={e => setAbono({...abono, monto: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Fecha</label>
                  <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={abono.fecha} onChange={e => setAbono({...abono, fecha: e.target.value})} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Forma de Pago</label>
                  <select className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={abono.forma_pago} onChange={e => setAbono({...abono, forma_pago: e.target.value})}>
                    {['efectivo','transferencia','cheque','tarjeta','otro'].map(f => (
                      <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Referencia</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={abono.referencia} onChange={e => setAbono({...abono, referencia: e.target.value})} />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setModalAbono(null)} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
                <button onClick={registrarAbono} disabled={saving || !abono.monto}
                  className="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm hover:bg-orange-700 disabled:opacity-50">
                  {saving ? 'Guardando...' : 'Registrar Pago'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
