'use client'

import { useState, useEffect, useCallback } from 'react'
import { ShoppingBag, AlertTriangle, Plus, X } from 'lucide-react'

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

interface CuentaCaja  { id: string; nombre: string; tipo: string }
interface CuentaBanco { id: string; nombre: string; banco: string }

interface AbonoForm {
  monto: string
  fecha: string
  forma_pago: string
  referencia: string
  notas: string
  cuenta_caja_id: string
  cuenta_banco_id: string
}

const fmt = (n: number) =>
  new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO' }).format(n ?? 0)

function aging(saldos: SaldoCxP[]) {
  const pendientes = saldos.filter(s => s.estado_pago !== 'pagada')
  return {
    '0-30':  pendientes.filter(s => s.dias_vencido <= 30).reduce((a, s) => a + s.saldo_pendiente, 0),
    '31-60': pendientes.filter(s => s.dias_vencido > 30 && s.dias_vencido <= 60).reduce((a, s) => a + s.saldo_pendiente, 0),
    '61-90': pendientes.filter(s => s.dias_vencido > 60 && s.dias_vencido <= 90).reduce((a, s) => a + s.saldo_pendiente, 0),
    '+90':   pendientes.filter(s => s.dias_vencido > 90).reduce((a, s) => a + s.saldo_pendiente, 0),
  }
}

export default function CxPPage() {
  const [saldos,     setSaldos]     = useState<SaldoCxP[]>([])
  const [loading,    setLoading]    = useState(true)
  const [empresaId,  setEmpresaId]  = useState('')
  const [filtro,     setFiltro]     = useState('vigente')
  const [modalAbono, setModalAbono] = useState<SaldoCxP | null>(null)
  const [cajas,      setCajas]      = useState<CuentaCaja[]>([])
  const [bancos,     setBancos]     = useState<CuentaBanco[]>([])
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')

  const abonoVacio = (): AbonoForm => ({
    monto: '',
    fecha: new Date().toISOString().split('T')[0],
    forma_pago: 'transferencia',
    referencia: '',
    notas: '',
    cuenta_caja_id: '',
    cuenta_banco_id: '',
  })
  const [abono, setAbono] = useState<AbonoForm>(abonoVacio())

  // â”€â”€ Obtener empresa_id correctamente â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    async function init() {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [{ data: nat }, { data: jur }] = await Promise.all([
        supabase.from('empresas_persona_natural').select('id').eq('user_id', user.id).maybeSingle(),
        supabase.from('empresas_juridicas').select('id').eq('user_id', user.id).maybeSingle(),
      ])
      const eid = nat?.id ?? jur?.id ?? ''
      setEmpresaId(eid)

      if (eid) {
        const [{ data: cajasData }, { data: bancosData }] = await Promise.all([
          supabase.from('cuentas_caja').select('id, nombre, tipo').eq('empresa_id', eid).eq('activa', true),
          supabase.from('cuentas_banco').select('id, nombre, banco').eq('empresa_id', eid).eq('activa', true),
        ])
        setCajas(cajasData ?? [])
        setBancos(bancosData ?? [])
      }
    }
    init()
  }, [])

  const fetchSaldos = useCallback(async (eid: string, estado: string) => {
    setLoading(true)
    let url = `/api/cxp?empresa_id=${eid}`
    if (estado !== 'todos') url += `&estado=${estado}`
    const r = await fetch(url)
    const d = await r.json()
    setSaldos(Array.isArray(d) ? d : [])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (empresaId) fetchSaldos(empresaId, filtro)
  }, [empresaId, filtro, fetchSaldos])

  function handleFormaPago(fp: string) {
    setAbono(prev => ({
      ...prev,
      forma_pago: fp,
      cuenta_caja_id:  fp === 'efectivo' ? prev.cuenta_caja_id : '',
      cuenta_banco_id: fp !== 'efectivo' ? prev.cuenta_banco_id : '',
    }))
  }

  async function registrarAbono() {
    if (!modalAbono) return
    setError('')
    if (!abono.monto || Number(abono.monto) <= 0) {
      setError('Ingresa un monto vÃ¡lido'); return
    }
    if (abono.forma_pago === 'efectivo' && !abono.cuenta_caja_id) {
      setError('Selecciona la cuenta de caja'); return
    }
    if (abono.forma_pago !== 'efectivo' && !abono.cuenta_banco_id) {
      setError('Selecciona la cuenta bancaria'); return
    }

    setSaving(true)
    const r = await fetch('/api/cxp/abonos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        empresa_id:      empresaId,
        compra_id:       modalAbono.compra_id,
        proveedor_id:    modalAbono.proveedor_id,
        monto:           parseFloat(abono.monto),
        fecha:           abono.fecha,
        forma_pago:      abono.forma_pago,
        referencia:      abono.referencia || null,
        notas:           abono.notas || null,
        cuenta_caja_id:  abono.cuenta_caja_id  || null,
        cuenta_banco_id: abono.cuenta_banco_id || null,
      }),
    })
    setSaving(false)
    if (r.ok) {
      setModalAbono(null)
      setAbono(abonoVacio())
      fetchSaldos(empresaId, filtro)
    } else {
      const d = await r.json()
      setError(d.error ?? 'Error al registrar pago')
    }
  }

  const totalPendiente  = saldos.filter(s => s.estado_pago !== 'pagada').reduce((a, s) => a + s.saldo_pendiente, 0)
  const totalVencido    = saldos.filter(s => s.estado_pago === 'vencida').reduce((a, s) => a + s.saldo_pendiente, 0)
  const nDocsPendientes = saldos.filter(s => s.estado_pago !== 'pagada').length
  const agingData       = aging(saldos)

  const FILTROS = ['vigente', 'vencida', 'pagada', 'todos'] as const

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">

      {/* Encabezado */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Cuentas por Pagar (CxP)</h1>
        <p className="text-sm text-gray-500 mt-1">
          Deudas a proveedores Â· AntigÃ¼edad de saldo Â· Pagos parciales
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-orange-50 rounded-xl p-4 flex items-start gap-3">
          <ShoppingBag className="text-orange-500 mt-0.5" size={20} />
          <div>
            <p className="text-xs text-gray-500">Total por Pagar</p>
            <p className="text-xl font-bold text-orange-700">{fmt(totalPendiente)}</p>
            <p className="text-xs text-gray-400">{nDocsPendientes} documento{nDocsPendientes !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <div className="bg-red-50 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="text-red-500 mt-0.5" size={20} />
          <div>
            <p className="text-xs text-gray-500">Cartera Vencida</p>
            <p className="text-xl font-bold text-red-700">{fmt(totalVencido)}</p>
            <p className="text-xs text-gray-400">
              {saldos.filter(s => s.estado_pago === 'vencida').length} compra(s)
            </p>
          </div>
        </div>
        <div className="col-span-2 md:col-span-1 bg-white border rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">AntigÃ¼edad</p>
          <div className="space-y-1 text-xs">
            {([['0-30 dÃ­as', agingData['0-30'], 'text-green-600'],
               ['31-60 dÃ­as', agingData['31-60'], 'text-yellow-600'],
               ['61-90 dÃ­as', agingData['61-90'], 'text-orange-600'],
               ['+90 dÃ­as',  agingData['+90'],   'text-red-600']] as [string, number, string][]).map(([label, monto, color]) => (
              <div key={label} className="flex justify-between">
                <span className="text-gray-500">{label}</span>
                <span className={`font-medium ${color}`}>{fmt(monto)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        {FILTROS.map(f => (
          <button
            key={f}
            onClick={() => setFiltro(f)}
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${
              filtro === f
                ? 'bg-orange-600 text-white border-orange-600'
                : 'border-gray-300 text-gray-600 hover:border-orange-400'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Cargando obligaciones...</div>
      ) : saldos.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <ShoppingBag size={40} className="mx-auto mb-2 opacity-30" />
          <p>No hay registros en esta categorÃ­a</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Compra', 'Proveedor', 'Fecha', 'Vencimiento', 'Total', 'Pagado', 'Saldo', 'Estado', ''].map(h => (
                  <th key={h} className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {saldos.map(s => (
                <tr
                  key={s.compra_id}
                  className={`hover:bg-gray-50 transition-colors ${
                    s.estado_pago === 'vencida' ? 'bg-red-50/40' : ''
                  }`}
                >
                  <td className="px-3 py-3 font-mono text-xs font-semibold text-orange-700">
                    {s.numero_compra}
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-medium text-gray-900 leading-tight">{s.proveedor?.nombre ?? 'â€”'}</p>
                    {s.proveedor?.telefono && (
                      <p className="text-xs text-gray-400">{s.proveedor.telefono}</p>
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs text-gray-500">{s.fecha_compra}</td>
                  <td className={`px-3 py-3 text-xs ${s.estado_pago === 'vencida' ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>
                    {s.fecha_vencimiento ?? 'â€”'}
                    {s.dias_vencido > 0 && (
                      <span className="ml-1 text-red-500">+{s.dias_vencido}d</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right font-medium">{fmt(s.monto_original)}</td>
                  <td className="px-3 py-3 text-right text-green-700">{fmt(s.total_abonado)}</td>
                  <td className="px-3 py-3 text-right font-bold text-orange-700">{fmt(s.saldo_pendiente)}</td>
                  <td className="px-3 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${
                      s.estado_pago === 'pagada'  ? 'bg-green-100 text-green-700' :
                      s.estado_pago === 'vencida' ? 'bg-red-100 text-red-600'    :
                                                    'bg-orange-100 text-orange-700'
                    }`}>
                      {s.estado_pago}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    {s.estado_pago !== 'pagada' && (
                      <button
                        onClick={() => { setModalAbono(s); setAbono(abonoVacio()); setError('') }}
                        className="flex items-center gap-1 text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-lg hover:bg-orange-200 transition-colors whitespace-nowrap"
                      >
                        <Plus size={12} /> Pagar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de pago */}
      {modalAbono && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">

            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b">
              <h2 className="text-lg font-bold text-gray-900">Registrar Pago a Proveedor</h2>
              <button onClick={() => setModalAbono(null)} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="px-6 py-4 space-y-4">
              {/* Info de la compra */}
              <div className="bg-orange-50 rounded-xl p-3 text-sm space-y-1">
                <p className="font-semibold text-orange-800">{modalAbono.numero_compra}</p>
                <p className="text-gray-600">{modalAbono.proveedor?.nombre}</p>
                <div className="flex justify-between pt-1">
                  <span className="text-gray-500 text-xs">Saldo pendiente</span>
                  <span className="font-bold text-orange-700">{fmt(modalAbono.saldo_pendiente)}</span>
                </div>
              </div>

              {/* Monto */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Monto del Pago (C$) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={modalAbono.saldo_pendiente}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-300 outline-none"
                  value={abono.monto}
                  onChange={e => setAbono({ ...abono, monto: e.target.value })}
                  placeholder="0.00"
                />
                <button
                  type="button"
                  className="text-xs text-orange-600 hover:underline mt-1"
                  onClick={() => setAbono({ ...abono, monto: modalAbono.saldo_pendiente.toString() })}
                >
                  Pagar saldo completo ({fmt(modalAbono.saldo_pendiente)})
                </button>
              </div>

              {/* Fecha */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha</label>
                <input
                  type="date"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-300 outline-none"
                  value={abono.fecha}
                  onChange={e => setAbono({ ...abono, fecha: e.target.value })}
                />
              </div>

              {/* Forma de pago */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Forma de Pago <span className="text-red-500">*</span>
                </label>
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-300 outline-none"
                  value={abono.forma_pago}
                  onChange={e => handleFormaPago(e.target.value)}
                >
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia bancaria</option>
                  <option value="cheque">Cheque</option>
                  <option value="tarjeta">Tarjeta</option>
                  <option value="otro">Otro</option>
                </select>
              </div>

              {/* Cuenta caja */}
              {abono.forma_pago === 'efectivo' && cajas.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cuenta de Caja <span className="text-red-500">*</span>
                  </label>
                  <select
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-300 outline-none"
                    value={abono.cuenta_caja_id}
                    onChange={e => setAbono({ ...abono, cuenta_caja_id: e.target.value })}
                  >
                    <option value="">â€” Seleccionar â€”</option>
                    {cajas.map(c => (
                      <option key={c.id} value={c.id}>{c.nombre}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Cuenta banco */}
              {abono.forma_pago !== 'efectivo' && bancos.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cuenta Bancaria <span className="text-red-500">*</span>
                  </label>
                  <select
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-300 outline-none"
                    value={abono.cuenta_banco_id}
                    onChange={e => setAbono({ ...abono, cuenta_banco_id: e.target.value })}
                  >
                    <option value="">â€” Seleccionar â€”</option>
                    {bancos.map(b => (
                      <option key={b.id} value={b.id}>{b.nombre} â€” {b.banco}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Referencia */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Referencia / # Comprobante
                </label>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-300 outline-none"
                  placeholder="# transferencia, cheque, recibo..."
                  value={abono.referencia}
                  onChange={e => setAbono({ ...abono, referencia: e.target.value })}
                />
              </div>

              {/* Error */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
                  {error}
                </div>
              )}
            </div>

            <div className="px-6 pb-5 flex justify-end gap-3">
              <button
                onClick={() => { setModalAbono(null); setError('') }}
                className="px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={registrarAbono}
                disabled={saving || !abono.monto}
                className="px-4 py-2 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? 'Guardando...' : 'Registrar Pago'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

