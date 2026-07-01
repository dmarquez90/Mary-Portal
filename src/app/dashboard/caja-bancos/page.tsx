'use client'
export const dynamic = 'force-dynamic'
// src/app/dashboard/caja-bancos/page.tsx

import { useEffect, useState, useCallback } from 'react'
import { Landmark, Plus, Building2, Wallet, ArrowDownLeft, ArrowUpRight, BookCheck, X } from 'lucide-react'
import AlertasSaldoNegativo from '@/components/contabilidad/AlertasSaldoNegativo'

// ── Types ─────────────────────────────────────────────────────
interface CuentaBanco {
  id: string; nombre: string; banco: string | null; numero_cuenta: string | null
  tipo: string; moneda: string; saldo_actual: number; saldo_inicial: number; activa: boolean; notas: string | null
}
interface CuentaCaja {
  id: string; nombre: string; tipo: string; moneda: string
  saldo_actual: number; saldo_inicial: number; limite_caja_chica: number | null; activa: boolean; notas: string | null
}
interface TransaccionBanco {
  id: string; cuenta_banco_id: string; tipo: string; direccion: string | null; monto: number
  monto_usd: number | null; tipo_cambio: number | null; descripcion: string
  fecha: string; referencia: string | null; estado: string
  cuentas_banco?: { nombre: string; banco: string | null; moneda: string }
}
interface MovimientoCaja {
  id: string; cuenta_caja_id: string; tipo: string; monto: number
  descripcion: string; fecha: string; estado: string
  cuentas_caja?: { nombre: string; tipo: string }
}
interface Cheque {
  id: string; cuenta_banco_id: string; numero_cheque: string; tipo: string
  monto: number; beneficiario: string | null; fecha_emision: string
  fecha_vencimiento: string | null; estado: string; notas: string | null
  cuentas_banco?: { nombre: string; banco: string | null; moneda: string }
}
interface Resumen {
  totalNIO: number; totalUSD: number; totalCaja: number
  ingresosMes: number; egresosMes: number; chequesPendientes: number
  numCuentasBanco: number; numCajas: number
}

// ── Helpers ───────────────────────────────────────────────────
function fmt(monto: number, moneda = 'NIO') {
  return new Intl.NumberFormat('es-NI', {
    style: 'currency', currency: moneda === 'USD' ? 'USD' : 'NIO',
    minimumFractionDigits: 2,
  }).format(monto)
}
function fmtFecha(fecha: string) {
  return new Date(fecha + 'T00:00:00').toLocaleDateString('es-NI', { day: '2-digit', month: 'short', year: 'numeric' })
}
const hoy = () => new Date().toISOString().split('T')[0]

const TIPO_BADGE: Record<string, string> = {
  ingreso:  'bg-green-100 text-green-700',
  egreso:   'bg-red-100 text-red-700',
  cobro:    'bg-green-100 text-green-700',
  pago:     'bg-red-100 text-red-700',
  activo:   'bg-blue-100 text-blue-700',
  cobrado:  'bg-green-100 text-green-700',
  anulado:  'bg-gray-100 text-gray-500',
  registrado: 'bg-gray-100 text-gray-600',
}

// ── Modal genérico ────────────────────────────────────────────
function Modal({ titulo, onClose, onGuardar, guardando, children }: {
  titulo: string; onClose: () => void; onGuardar: () => void
  guardando: boolean; children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-4">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{titulo}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-3">{children}</div>
        <div className="p-5 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">Cancelar</button>
          <button
            onClick={onGuardar}
            disabled={guardando}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {guardando ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  )
}

const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300'

// ── Tabs ─────────────────────────────────────────────────────
const TABS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'bancos', label: 'Cuentas Bancarias' },
  { id: 'caja', label: 'Caja' },
  { id: 'transacciones', label: 'Transacciones' },
  { id: 'cheques', label: 'Cheques' },
]

// ─────────────────────────────────────────────────────────────
export default function CajaBancosPage() {
  const [tab, setTab] = useState('resumen')
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [cuentasBanco, setCuentasBanco] = useState<CuentaBanco[]>([])
  const [cajas, setCajas] = useState<CuentaCaja[]>([])
  const [transacciones, setTransacciones] = useState<TransaccionBanco[]>([])
  const [movimientosCaja, setMovimientosCaja] = useState<MovimientoCaja[]>([])
  const [cheques, setCheques] = useState<Cheque[]>([])
  const [loading, setLoading] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  // Modales
  const [modalBanco, setModalBanco] = useState(false)
  const [modalCaja, setModalCaja] = useState(false)
  const [modalTx, setModalTx] = useState(false)
  const [modalMovCaja, setModalMovCaja] = useState(false)
  const [modalCheque, setModalCheque] = useState(false)

  // Forms
  const [formBanco, setFormBanco] = useState({ nombre: '', banco: '', numero_cuenta: '', tipo: 'corriente', moneda: 'NIO', saldo_inicial: '', notas: '' })
  const [formCaja, setFormCaja] = useState({ nombre: '', tipo: 'caja_general', moneda: 'NIO', saldo_inicial: '', limite_caja_chica: '', notas: '' })
  const [formTx, setFormTx] = useState({ cuenta_banco_id: '', direccion: 'entrada', tipo: 'deposito', monto: '', descripcion: '', fecha: hoy(), referencia: '', monto_usd: '', tipo_cambio: '', notas: '' })
  const [formMovCaja, setFormMovCaja] = useState({ cuenta_caja_id: '', tipo: 'ingreso', monto: '', descripcion: '', fecha: hoy(), notas: '' })
  const [formCheque, setFormCheque] = useState({ cuenta_banco_id: '', numero_cheque: '', tipo: 'cobro', monto: '', beneficiario: '', fecha_emision: hoy(), fecha_vencimiento: '', notas: '' })

  // Cargar datos según tab activa
  const cargarResumen = useCallback(async () => {
    const r = await fetch('/api/caja-bancos/resumen')
    if (r.ok) setResumen(await r.json())
  }, [])

  const cargarBancos = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/caja-bancos/cuentas-banco')
    if (r.ok) { const d = await r.json(); setCuentasBanco(d.cuentas || []) }
    setLoading(false)
  }, [])

  const cargarCajas = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/caja-bancos/cuentas-caja')
    if (r.ok) { const d = await r.json(); setCajas(d.cajas || []) }
    setLoading(false)
  }, [])

  const cargarTx = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/caja-bancos/transacciones')
    if (r.ok) { const d = await r.json(); setTransacciones(d.transacciones || []) }
    setLoading(false)
  }, [])

  const cargarMovCaja = useCallback(async () => {
    const r = await fetch('/api/caja-bancos/movimientos-caja')
    if (r.ok) { const d = await r.json(); setMovimientosCaja(d.movimientos || []) }
  }, [])

  const cargarCheques = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/caja-bancos/cheques')
    if (r.ok) { const d = await r.json(); setCheques(d.cheques || []) }
    setLoading(false)
  }, [])

  // Carga inicial: resumen + bancos + cajas en paralelo (sin esperar cambio de tab)
  useEffect(() => {
    // Siempre cargar resumen, bancos y cajas para que el resumen inicial tenga datos
    void Promise.all([cargarResumen(), cargarBancos(), cargarCajas()])
    // Cargar datos específicos según tab activa
    if (tab === 'caja') cargarMovCaja()
    else if (tab === 'transacciones') cargarTx()
    else if (tab === 'cheques') { cargarCheques() }
  }, [tab])

  // ── Guardar cuenta bancaria ───────────────────────────────
  async function guardarBanco() {
    if (!formBanco.nombre || !formBanco.tipo) { setError('Nombre y tipo son requeridos'); return }
    setGuardando(true); setError('')
    const r = await fetch('/api/caja-bancos/cuentas-banco', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formBanco),
    })
    const d = await r.json()
    if (!r.ok) { setError(d.error || 'Error al guardar'); setGuardando(false); return }
    setModalBanco(false)
    setFormBanco({ nombre: '', banco: '', numero_cuenta: '', tipo: 'corriente', moneda: 'NIO', saldo_inicial: '', notas: '' })
    cargarBancos(); cargarResumen()
    setGuardando(false)
  }

  // ── Guardar caja ─────────────────────────────────────────
  async function guardarCaja() {
    if (!formCaja.nombre) { setError('Nombre es requerido'); return }
    setGuardando(true); setError('')
    const r = await fetch('/api/caja-bancos/cuentas-caja', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formCaja),
    })
    const d = await r.json()
    if (!r.ok) { setError(d.error || 'Error al guardar'); setGuardando(false); return }
    setModalCaja(false)
    setFormCaja({ nombre: '', tipo: 'caja_general', moneda: 'NIO', saldo_inicial: '', limite_caja_chica: '', notas: '' })
    cargarCajas(); cargarResumen()
    setGuardando(false)
  }

  // ── Guardar transacción bancaria ─────────────────────────
  async function guardarTx() {
    if (!formTx.cuenta_banco_id || !formTx.monto || !formTx.descripcion)
      { setError('Cuenta, monto y descripción son requeridos'); return }
    setGuardando(true); setError('')
    const r = await fetch('/api/caja-bancos/transacciones', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formTx),
    })
    const d = await r.json()
    if (!r.ok) { setError(d.error || 'Error al guardar'); setGuardando(false); return }
    setModalTx(false)
    setFormTx({ cuenta_banco_id: '', direccion: 'entrada', tipo: 'deposito', monto: '', descripcion: '', fecha: hoy(), referencia: '', monto_usd: '', tipo_cambio: '', notas: '' })
    cargarTx(); cargarResumen(); cargarBancos()
    setGuardando(false)
  }

  // ── Guardar movimiento caja ───────────────────────────────
  async function guardarMovCaja() {
    if (!formMovCaja.cuenta_caja_id || !formMovCaja.monto || !formMovCaja.descripcion)
      { setError('Caja, monto y descripción son requeridos'); return }
    setGuardando(true); setError('')
    const r = await fetch('/api/caja-bancos/movimientos-caja', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formMovCaja),
    })
    const d = await r.json()
    if (!r.ok) { setError(d.error || 'Error al guardar'); setGuardando(false); return }
    setModalMovCaja(false)
    setFormMovCaja({ cuenta_caja_id: '', tipo: 'ingreso', monto: '', descripcion: '', fecha: hoy(), notas: '' })
    cargarCajas(); cargarMovCaja(); cargarResumen()
    setGuardando(false)
  }

  // ── Guardar cheque ────────────────────────────────────────
  async function guardarCheque() {
    if (!formCheque.cuenta_banco_id || !formCheque.numero_cheque || !formCheque.monto)
      { setError('Cuenta, número de cheque y monto son requeridos'); return }
    setGuardando(true); setError('')
    const r = await fetch('/api/caja-bancos/cheques', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formCheque),
    })
    const d = await r.json()
    if (!r.ok) { setError(d.error || 'Error al guardar'); setGuardando(false); return }
    setModalCheque(false)
    setFormCheque({ cuenta_banco_id: '', numero_cheque: '', tipo: 'cobro', monto: '', beneficiario: '', fecha_emision: hoy(), fecha_vencimiento: '', notas: '' })
    cargarCheques(); cargarResumen()
    setGuardando(false)
  }

  async function cambiarEstadoCheque(id: string, estado: string) {
    await fetch('/api/caja-bancos/cheques', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, estado }),
    })
    cargarCheques(); cargarResumen()
  }

  // ── Botón contextual según tab ────────────────────────────
  function botonPrincipal() {
    if (tab === 'bancos') return <button onClick={() => { setError(''); setModalBanco(true) }} className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"><Plus size={16} /> Nueva cuenta bancaria</button>
    if (tab === 'caja') return (
      <div className="flex gap-2">
        <button onClick={() => { setError(''); setModalCaja(true) }} className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"><Plus size={16} /> Nueva caja</button>
        <button onClick={() => { setError(''); setModalMovCaja(true) }} className="flex items-center gap-1.5 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700"><Plus size={16} /> Nuevo movimiento</button>
      </div>
    )
    if (tab === 'transacciones') return <button onClick={() => { setError(''); setModalTx(true) }} className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"><Plus size={16} /> Nueva transacción</button>
    if (tab === 'cheques') return <button onClick={() => { setError(''); setModalCheque(true) }} className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"><Plus size={16} /> Nuevo cheque</button>
    return null
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-5">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
            <Landmark size={20} className="text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Caja y Bancos</h1>
            <p className="text-sm text-gray-500">
              {resumen ? `${resumen.numCuentasBanco} cuenta(s) bancaria(s) · ${resumen.numCajas} caja(s)` : 'Cargando...'}
            </p>
          </div>
        </div>
        <div>{botonPrincipal()}</div>
      </div>

      <AlertasSaldoNegativo />

      {/* Totales */}
      {resumen && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'Total NIO', valor: fmt(resumen.totalNIO, 'NIO'), color: 'text-gray-900' },
            { label: 'Total USD', valor: fmt(resumen.totalUSD, 'USD'), color: 'text-gray-900' },
            { label: 'Ingresos Mes', valor: fmt(resumen.ingresosMes), color: 'text-green-600' },
            { label: 'Egresos Mes', valor: fmt(resumen.egresosMes), color: 'text-red-600' },
            { label: 'Cheques Pendientes', valor: String(resumen.chequesPendientes), color: 'text-orange-600' },
          ].map(s => (
            <div key={s.label} className="bg-white border border-gray-200 rounded-xl p-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide">{s.label}</p>
              <p className={`text-lg font-bold mt-0.5 ${s.color}`}>{s.valor}</p>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors border-b-2 -mb-px ${
                tab === t.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error global */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm flex items-center justify-between">
          {error}
          <button onClick={() => setError('')}><X size={14} /></button>
        </div>
      )}

      {/* ── RESUMEN ── */}
      {tab === 'resumen' && (
        <div className="grid md:grid-cols-2 gap-4">
          {/* Bancos */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Building2 size={16} className="text-blue-500" /> Cuentas Bancarias
              </div>
              <button onClick={() => setTab('bancos')} className="text-xs text-blue-600 hover:underline">Ver todas</button>
            </div>
            {cuentasBanco.length === 0
              ? <p className="text-sm text-gray-400 p-4 text-center">No hay cuentas registradas. <button onClick={() => { setModalBanco(true); setTab('bancos') }} className="text-blue-600 hover:underline">Agregar</button></p>
              : cuentasBanco.slice(0,5).map(c => (
                <div key={c.id} className="flex items-center justify-between px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{c.nombre}</p>
                    <p className="text-xs text-gray-400">{c.banco || '—'} {c.numero_cuenta ? `· ${c.numero_cuenta}` : ''}</p>
                  </div>
                  <span className="text-sm font-semibold text-gray-900">{fmt(c.saldo_actual, c.moneda)}</span>
                </div>
              ))
            }
          </div>
          {/* Cajas */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Wallet size={16} className="text-green-500" /> Cajas
              </div>
              <button onClick={() => setTab('caja')} className="text-xs text-blue-600 hover:underline">Ver todas</button>
            </div>
            {cajas.length === 0
              ? <p className="text-sm text-gray-400 p-4 text-center">No hay cajas registradas. <button onClick={() => { setModalCaja(true); setTab('caja') }} className="text-blue-600 hover:underline">Agregar</button></p>
              : cajas.map(c => (
                <div key={c.id} className="flex items-center justify-between px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{c.nombre}</p>
                    <p className="text-xs text-gray-400">{c.tipo === 'caja_general' ? 'Caja General' : 'Caja Chica'}{c.limite_caja_chica ? ` · Límite: ${fmt(c.limite_caja_chica)}` : ''}</p>
                  </div>
                  <span className="text-sm font-semibold text-gray-900">{fmt(c.saldo_actual, c.moneda)}</span>
                </div>
              ))
            }
          </div>
        </div>
      )}

      {/* ── CUENTAS BANCARIAS ── */}
      {tab === 'bancos' && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {loading
            ? <p className="text-sm text-gray-400 p-8 text-center">Cargando...</p>
            : cuentasBanco.length === 0
            ? <div className="p-12 text-center text-gray-400">
                <Building2 size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">No hay cuentas bancarias registradas.</p>
                <button onClick={() => setModalBanco(true)} className="mt-3 text-sm text-blue-600 hover:underline">+ Agregar primera cuenta</button>
              </div>
            : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-2 text-left">Nombre</th>
                    <th className="px-4 py-2 text-left">Banco</th>
                    <th className="px-4 py-2 text-left">No. Cuenta</th>
                    <th className="px-4 py-2 text-left">Tipo</th>
                    <th className="px-4 py-2 text-left">Moneda</th>
                    <th className="px-4 py-2 text-right">Saldo Actual</th>
                    <th className="px-4 py-2 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {cuentasBanco.map(c => (
                    <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">{c.nombre}</td>
                      <td className="px-4 py-3 text-gray-600">{c.banco || '—'}</td>
                      <td className="px-4 py-3 text-gray-600 font-mono text-xs">{c.numero_cuenta || '—'}</td>
                      <td className="px-4 py-3 capitalize text-gray-600">{c.tipo}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">{c.moneda}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmt(c.saldo_actual, c.moneda)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${c.activa ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                          {c.activa ? 'Activa' : 'Inactiva'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        </div>
      )}

      {/* ── CAJA ── */}
      {tab === 'caja' && (
        <div className="space-y-4">
          {/* Lista de cajas */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 text-sm font-medium text-gray-700">Cajas registradas</div>
            {loading
              ? <p className="text-sm text-gray-400 p-6 text-center">Cargando...</p>
              : cajas.length === 0
              ? <div className="p-10 text-center text-gray-400">
                  <Wallet size={28} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No hay cajas registradas.</p>
                  <button onClick={() => setModalCaja(true)} className="mt-2 text-sm text-blue-600 hover:underline">+ Agregar primera caja</button>
                </div>
              : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-2 text-left">Nombre</th>
                      <th className="px-4 py-2 text-left">Tipo</th>
                      <th className="px-4 py-2 text-left">Moneda</th>
                      <th className="px-4 py-2 text-right">Límite C. Chica</th>
                      <th className="px-4 py-2 text-right">Saldo Actual</th>
                      <th className="px-4 py-2 text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cajas.map(c => (
                      <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-800">{c.nombre}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${c.tipo === 'caja_general' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                            {c.tipo === 'caja_general' ? 'Caja General' : 'Caja Chica'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{c.moneda}</td>
                        <td className="px-4 py-3 text-right text-gray-500">{c.limite_caja_chica ? fmt(c.limite_caja_chica) : '—'}</td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmt(c.saldo_actual, c.moneda)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${c.activa ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {c.activa ? 'Activa' : 'Inactiva'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            }
          </div>

          {/* Últimos movimientos de caja */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <span className="text-sm font-medium text-gray-700">Movimientos de Caja</span>
              <button onClick={() => setModalMovCaja(true)} className="text-xs text-blue-600 hover:underline flex items-center gap-1"><Plus size={12} /> Nuevo movimiento</button>
            </div>
            {movimientosCaja.length === 0
              ? <p className="text-sm text-gray-400 p-6 text-center">Sin movimientos registrados.</p>
              : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-2 text-left">Fecha</th>
                      <th className="px-4 py-2 text-left">Caja</th>
                      <th className="px-4 py-2 text-left">Tipo</th>
                      <th className="px-4 py-2 text-left">Descripción</th>
                      <th className="px-4 py-2 text-right">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movimientosCaja.slice(0,50).map(m => (
                      <tr key={m.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{fmtFecha(m.fecha)}</td>
                        <td className="px-4 py-2.5 text-gray-600">{m.cuentas_caja?.nombre || '—'}</td>
                        <td className="px-4 py-2.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${TIPO_BADGE[m.tipo] || 'bg-gray-100 text-gray-600'}`}>{m.tipo}</span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-700">{m.descripcion}</td>
                        <td className={`px-4 py-2.5 text-right font-semibold ${m.tipo === 'ingreso' || m.tipo === 'cobro' ? 'text-green-700' : 'text-red-700'}`}>
                          {m.tipo === 'ingreso' || m.tipo === 'cobro' ? '+' : '-'}{fmt(m.monto)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            }
          </div>
        </div>
      )}

      {/* ── TRANSACCIONES BANCARIAS ── */}
      {tab === 'transacciones' && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {loading
            ? <p className="text-sm text-gray-400 p-8 text-center">Cargando...</p>
            : transacciones.length === 0
            ? <div className="p-12 text-center text-gray-400">
                <BookCheck size={32} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">No hay transacciones bancarias registradas.</p>
                <button onClick={() => setModalTx(true)} className="mt-2 text-sm text-blue-600 hover:underline">+ Registrar primera transacción</button>
              </div>
            : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-2 text-left">Fecha</th>
                    <th className="px-4 py-2 text-left">Cuenta</th>
                    <th className="px-4 py-2 text-left">Tipo</th>
                    <th className="px-4 py-2 text-left">Descripción</th>
                    <th className="px-4 py-2 text-left">Referencia</th>
                    <th className="px-4 py-2 text-right">Monto</th>
                    <th className="px-4 py-2 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {transacciones.map(t => (
                    <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{fmtFecha(t.fecha)}</td>
                      <td className="px-4 py-2.5 text-gray-700">{t.cuentas_banco?.nombre || '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${TIPO_BADGE[t.tipo] || 'bg-gray-100 text-gray-600'}`}>{t.tipo}</span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-700 max-w-[200px] truncate">{t.descripcion}</td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs font-mono">{t.referencia || '—'}</td>
                      <td className={`px-4 py-2.5 text-right font-semibold ${(t.direccion ? t.direccion === 'entrada' : ['ingreso','deposito','cobro','transferencia'].includes(t.tipo)) ? 'text-green-700' : 'text-red-700'}`}>
                        {(t.direccion ? t.direccion === 'entrada' : ['ingreso','deposito','cobro','transferencia'].includes(t.tipo)) ? '+' : '-'}{fmt(t.monto, t.cuentas_banco?.moneda)}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${TIPO_BADGE[t.estado] || 'bg-gray-100 text-gray-600'}`}>{t.estado}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        </div>
      )}

      {/* ── CHEQUES ── */}
      {tab === 'cheques' && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          {loading
            ? <p className="text-sm text-gray-400 p-8 text-center">Cargando...</p>
            : cheques.length === 0
            ? <div className="p-12 text-center text-gray-400">
                <p className="text-sm">No hay cheques registrados.</p>
                <button onClick={() => setModalCheque(true)} className="mt-2 text-sm text-blue-600 hover:underline">+ Registrar primer cheque</button>
              </div>
            : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-2 text-left">No. Cheque</th>
                    <th className="px-4 py-2 text-left">Cuenta</th>
                    <th className="px-4 py-2 text-left">Tipo</th>
                    <th className="px-4 py-2 text-left">Beneficiario</th>
                    <th className="px-4 py-2 text-left">Emisión</th>
                    <th className="px-4 py-2 text-left">Vencimiento</th>
                    <th className="px-4 py-2 text-right">Monto</th>
                    <th className="px-4 py-2 text-center">Estado</th>
                    <th className="px-4 py-2 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {cheques.map(c => (
                    <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-mono text-sm text-gray-700">{c.numero_cheque}</td>
                      <td className="px-4 py-2.5 text-gray-600">{c.cuentas_banco?.nombre || '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${TIPO_BADGE[c.tipo] || 'bg-gray-100 text-gray-600'}`}>{c.tipo}</span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-700">{c.beneficiario || '—'}</td>
                      <td className="px-4 py-2.5 text-gray-500">{fmtFecha(c.fecha_emision)}</td>
                      <td className="px-4 py-2.5 text-gray-500">{c.fecha_vencimiento ? fmtFecha(c.fecha_vencimiento) : '—'}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{fmt(c.monto, c.cuentas_banco?.moneda ?? 'NIO')}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${TIPO_BADGE[c.estado] || 'bg-gray-100 text-gray-600'}`}>{c.estado}</span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {c.estado === 'activo' && (
                          <div className="flex gap-1 justify-center">
                            <button onClick={() => cambiarEstadoCheque(c.id, 'cobrado')} className="text-xs text-green-700 hover:text-green-900 border border-green-200 rounded px-1.5 py-0.5">Cobrar</button>
                            <button onClick={() => cambiarEstadoCheque(c.id, 'anulado')} className="text-xs text-red-600 hover:text-red-800 border border-red-200 rounded px-1.5 py-0.5">Anular</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        </div>
      )}

      {/* ════════ MODALES ════════ */}

      {/* Modal: Nueva cuenta bancaria */}
      {modalBanco && (
        <Modal titulo="Nueva Cuenta Bancaria" onClose={() => setModalBanco(false)} onGuardar={guardarBanco} guardando={guardando}>
          {error && <p className="text-xs text-red-600 bg-red-50 rounded p-2">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Nombre *">
              <input className={inputCls} value={formBanco.nombre} onChange={e => setFormBanco({...formBanco, nombre: e.target.value})} placeholder="Ej: BDF Principal" />
            </Campo>
            <Campo label="Banco">
              <select className={inputCls} value={formBanco.banco} onChange={e => setFormBanco({...formBanco, banco: e.target.value})}>
                <option value="">— Seleccionar —</option>
                <option>BAC</option><option>BDF</option><option>Banpro</option>
                <option>Ficohsa</option><option>Avanz</option><option>Atlantida</option>
                <option>LAFISE</option><option>Otro</option>
              </select>
            </Campo>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Tipo de cuenta *">
              <select className={inputCls} value={formBanco.tipo} onChange={e => setFormBanco({...formBanco, tipo: e.target.value})}>
                <option value="corriente">Corriente</option>
                <option value="ahorros">Ahorros</option>
                <option value="otro">Otro</option>
              </select>
            </Campo>
            <Campo label="Moneda *">
              <select className={inputCls} value={formBanco.moneda} onChange={e => setFormBanco({...formBanco, moneda: e.target.value})}>
                <option value="NIO">NIO (Córdobas)</option>
                <option value="USD">USD (Dólares)</option>
              </select>
            </Campo>
          </div>
          <Campo label="Número de cuenta">
            <input className={inputCls} value={formBanco.numero_cuenta} onChange={e => setFormBanco({...formBanco, numero_cuenta: e.target.value})} placeholder="Ej: 300-100000-0" />
          </Campo>
          <Campo label="Saldo inicial">
            <input type="number" min="0" step="0.01" className={inputCls} value={formBanco.saldo_inicial} onChange={e => setFormBanco({...formBanco, saldo_inicial: e.target.value})} placeholder="0.00" />
          </Campo>
          <Campo label="Notas">
            <textarea className={inputCls} rows={2} value={formBanco.notas} onChange={e => setFormBanco({...formBanco, notas: e.target.value})} placeholder="Observaciones opcionales" />
          </Campo>
        </Modal>
      )}

      {/* Modal: Nueva caja */}
      {modalCaja && (
        <Modal titulo="Nueva Caja" onClose={() => setModalCaja(false)} onGuardar={guardarCaja} guardando={guardando}>
          {error && <p className="text-xs text-red-600 bg-red-50 rounded p-2">{error}</p>}
          <Campo label="Nombre *">
            <input className={inputCls} value={formCaja.nombre} onChange={e => setFormCaja({...formCaja, nombre: e.target.value})} placeholder="Ej: Caja General Sucursal Norte" />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Tipo *">
              <select className={inputCls} value={formCaja.tipo} onChange={e => setFormCaja({...formCaja, tipo: e.target.value})}>
                <option value="caja_general">Caja General</option>
                <option value="caja_chica">Caja Chica</option>
              </select>
            </Campo>
            <Campo label="Moneda">
              <select className={inputCls} value={formCaja.moneda} onChange={e => setFormCaja({...formCaja, moneda: e.target.value})}>
                <option value="NIO">NIO (Córdobas)</option>
                <option value="USD">USD (Dólares)</option>
              </select>
            </Campo>
          </div>
          <Campo label="Saldo inicial">
            <input type="number" min="0" step="0.01" className={inputCls} value={formCaja.saldo_inicial} onChange={e => setFormCaja({...formCaja, saldo_inicial: e.target.value})} placeholder="0.00" />
          </Campo>
          {formCaja.tipo === 'caja_chica' && (
            <Campo label="Límite de Caja Chica (fondo fijo)">
              <input type="number" min="0" step="0.01" className={inputCls} value={formCaja.limite_caja_chica} onChange={e => setFormCaja({...formCaja, limite_caja_chica: e.target.value})} placeholder="0.00" />
            </Campo>
          )}
          <Campo label="Notas">
            <textarea className={inputCls} rows={2} value={formCaja.notas} onChange={e => setFormCaja({...formCaja, notas: e.target.value})} placeholder="Observaciones opcionales" />
          </Campo>
        </Modal>
      )}

      {/* Modal: Nueva transacción bancaria */}
      {modalTx && (
        <Modal titulo="Nueva Transacción Bancaria" onClose={() => setModalTx(false)} onGuardar={guardarTx} guardando={guardando}>
          {error && <p className="text-xs text-red-600 bg-red-50 rounded p-2">{error}</p>}
          <Campo label="Cuenta bancaria *">
            <select className={inputCls} value={formTx.cuenta_banco_id} onChange={e => setFormTx({...formTx, cuenta_banco_id: e.target.value})}>
              <option value="">— Seleccionar cuenta —</option>
              {cuentasBanco.filter(c => c.activa).map(c => (
                <option key={c.id} value={c.id}>{c.nombre} ({c.moneda})</option>
              ))}
            </select>
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Dirección *">
              <select className={inputCls} value={formTx.direccion} onChange={e => setFormTx({...formTx, direccion: e.target.value, tipo: e.target.value === 'entrada' ? 'deposito' : 'retiro'})}>
                <option value="entrada">↓ Entrada (ingreso)</option>
                <option value="salida">↑ Salida (egreso)</option>
              </select>
            </Campo>
            <Campo label="Método de pago *">
              <select className={inputCls} value={formTx.tipo} onChange={e => setFormTx({...formTx, tipo: e.target.value})}>
                {formTx.direccion === 'entrada' ? (
                  <>
                    <option value="deposito">Depósito</option>
                    <option value="transferencia">Transferencia</option>
                    <option value="cobro">Cobro en efectivo</option>
                    <option value="deposito_cheque">Cheque depositado</option>
                    <option value="tarjeta">Tarjeta / POS</option>
                    <option value="ingreso">Otro ingreso</option>
                  </>
                ) : (
                  <>
                    <option value="retiro">Retiro</option>
                    <option value="transferencia_salida">Transferencia</option>
                    <option value="cheque">Cheque emitido</option>
                    <option value="tarjeta">Tarjeta débito</option>
                    <option value="egreso">Otro egreso</option>
                  </>
                )}
              </select>
            </Campo>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Campo label={`Monto (${cuentasBanco.find(c => c.id === formTx.cuenta_banco_id)?.moneda ?? 'NIO'}) *`}>
              <input type="number" min="0.01" step="0.01" className={inputCls} value={formTx.monto} onChange={e => setFormTx({...formTx, monto: e.target.value})} placeholder="0.00" />
            </Campo>
            <Campo label="Fecha *">
              <input type="date" className={inputCls} value={formTx.fecha} onChange={e => setFormTx({...formTx, fecha: e.target.value})} />
            </Campo>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Descripción *">
              <input className={inputCls} value={formTx.descripcion} onChange={e => setFormTx({...formTx, descripcion: e.target.value})} placeholder="Concepto de la transacción" />
            </Campo>
            <Campo label="Referencia / No. comprobante">
              <input className={inputCls} value={formTx.referencia} onChange={e => setFormTx({...formTx, referencia: e.target.value})} placeholder="Ej: TRF-0001" />
            </Campo>
          </div>
          {cuentasBanco.find(c => c.id === formTx.cuenta_banco_id)?.moneda === 'USD' && (
            <div className="grid grid-cols-2 gap-3">
              <Campo label="Monto USD">
                <input type="number" min="0" step="0.01" className={inputCls} value={formTx.monto_usd} onChange={e => setFormTx({...formTx, monto_usd: e.target.value})} placeholder="0.00" />
              </Campo>
              <Campo label="Tipo de cambio">
                <input type="number" min="0" step="0.0001" className={inputCls} value={formTx.tipo_cambio} onChange={e => setFormTx({...formTx, tipo_cambio: e.target.value})} placeholder="Ej: 36.50" />
              </Campo>
            </div>
          )}
          <Campo label="Notas">
            <textarea className={inputCls} rows={2} value={formTx.notas} onChange={e => setFormTx({...formTx, notas: e.target.value})} />
          </Campo>
        </Modal>
      )}

      {/* Modal: Nuevo movimiento de caja */}
      {modalMovCaja && (
        <Modal titulo="Nuevo Movimiento de Caja" onClose={() => setModalMovCaja(false)} onGuardar={guardarMovCaja} guardando={guardando}>
          {error && <p className="text-xs text-red-600 bg-red-50 rounded p-2">{error}</p>}
          <Campo label="Caja *">
            <select className={inputCls} value={formMovCaja.cuenta_caja_id} onChange={e => setFormMovCaja({...formMovCaja, cuenta_caja_id: e.target.value})}>
              <option value="">— Seleccionar caja —</option>
              {cajas.filter(c => c.activa).map(c => (
                <option key={c.id} value={c.id}>{c.nombre} ({c.tipo === 'caja_general' ? 'General' : 'Chica'})</option>
              ))}
            </select>
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Tipo *">
              <select className={inputCls} value={formMovCaja.tipo} onChange={e => setFormMovCaja({...formMovCaja, tipo: e.target.value})}>
                <option value="ingreso">Ingreso</option>
                <option value="egreso">Egreso</option>
              </select>
            </Campo>
            <Campo label="Fecha *">
              <input type="date" className={inputCls} value={formMovCaja.fecha} onChange={e => setFormMovCaja({...formMovCaja, fecha: e.target.value})} />
            </Campo>
          </div>
          <Campo label="Monto *">
            <input type="number" min="0.01" step="0.01" className={inputCls} value={formMovCaja.monto} onChange={e => setFormMovCaja({...formMovCaja, monto: e.target.value})} placeholder="0.00" />
          </Campo>
          <Campo label="Descripción *">
            <input className={inputCls} value={formMovCaja.descripcion} onChange={e => setFormMovCaja({...formMovCaja, descripcion: e.target.value})} placeholder="Concepto del movimiento" />
          </Campo>
          <Campo label="Notas">
            <textarea className={inputCls} rows={2} value={formMovCaja.notas} onChange={e => setFormMovCaja({...formMovCaja, notas: e.target.value})} />
          </Campo>
        </Modal>
      )}

      {/* Modal: Nuevo cheque */}
      {modalCheque && (
        <Modal titulo="Registrar Cheque" onClose={() => setModalCheque(false)} onGuardar={guardarCheque} guardando={guardando}>
          {error && <p className="text-xs text-red-600 bg-red-50 rounded p-2">{error}</p>}
          <Campo label="Cuenta bancaria *">
            <select className={inputCls} value={formCheque.cuenta_banco_id} onChange={e => setFormCheque({...formCheque, cuenta_banco_id: e.target.value})}>
              <option value="">— Seleccionar cuenta —</option>
              {cuentasBanco.filter(c => c.activa).map(c => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="No. de Cheque *">
              <input className={`${inputCls} font-mono`} value={formCheque.numero_cheque} onChange={e => setFormCheque({...formCheque, numero_cheque: e.target.value})} placeholder="Ej: 0001234" />
            </Campo>
            <Campo label="Tipo *">
              <select className={inputCls} value={formCheque.tipo} onChange={e => setFormCheque({...formCheque, tipo: e.target.value})}>
                <option value="cobro">Por cobrar</option>
                <option value="pago">Por pagar</option>
              </select>
            </Campo>
          </div>
          <Campo label="Beneficiario / Girador">
            <input className={inputCls} value={formCheque.beneficiario} onChange={e => setFormCheque({...formCheque, beneficiario: e.target.value})} placeholder="Nombre del beneficiario o girador" />
          </Campo>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Monto *">
              <input type="number" min="0.01" step="0.01" className={inputCls} value={formCheque.monto} onChange={e => setFormCheque({...formCheque, monto: e.target.value})} placeholder="0.00" />
            </Campo>
            <Campo label="Fecha de emisión *">
              <input type="date" className={inputCls} value={formCheque.fecha_emision} onChange={e => setFormCheque({...formCheque, fecha_emision: e.target.value})} />
            </Campo>
          </div>
          <Campo label="Fecha de vencimiento">
            <input type="date" className={inputCls} value={formCheque.fecha_vencimiento} onChange={e => setFormCheque({...formCheque, fecha_vencimiento: e.target.value})} />
          </Campo>
          <Campo label="Notas">
            <textarea className={inputCls} rows={2} value={formCheque.notas} onChange={e => setFormCheque({...formCheque, notas: e.target.value})} />
          </Campo>
        </Modal>
      )}

    </div>
  )
}
