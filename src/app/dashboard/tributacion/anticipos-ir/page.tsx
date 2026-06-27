'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { DollarSign, Plus, CheckCircle, ArrowLeft, X } from 'lucide-react'
import Link from 'next/link'

interface Anticipo {
  id: string
  anio: number
  mes: number
  ingresos_brutos_mes: number
  monto_anticipo: number
  retenciones_recibidas: number
  monto_a_pagar: number
  fecha_vencimiento: string
  fecha_pago?: string
  estado: string
  numero_boleta?: string
  asiento_id?: string
}

const MESES = ['','Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const fmt = (n: number) => new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO' }).format(n ?? 0)

export default function AnticiposIrPage() {
  const [anticipos,   setAnticipos]   = useState<Anticipo[]>([])
  const [loading,     setLoading]     = useState(true)
  const [empresaId,   setEmpresaId]   = useState('')
  const [anio,        setAnio]        = useState(new Date().getFullYear())
  const [calculando,  setCalculando]  = useState(false)
  // Modal de pago
  const [pagoModal,   setPagoModal]   = useState<Anticipo | null>(null)
  const [pagando,     setPagando]     = useState(false)
  const [boleta,      setBoleta]      = useState('')
  const [formaPago,   setFormaPago]   = useState<'banco'|'caja'>('banco')
  const [fechaPago,   setFechaPago]   = useState(new Date().toISOString().split('T')[0])

  const fetchAnticipos = useCallback(async (eid: string, a: number) => {
    setLoading(true)
    const r = await fetch(`/api/tributacion/anticipos-ir?empresa_id=${eid}&anio=${a}`)
    const d = await r.json()
    setAnticipos(Array.isArray(d) ? d : [])
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
      if (eid) fetchAnticipos(eid, new Date().getFullYear())
    }
    boot()
  }, [fetchAnticipos])

  async function calcularMes(mes: number) {
    setCalculando(true)
    const r = await fetch('/api/tributacion/anticipos-ir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ empresa_id: empresaId, anio, mes }),
    })
    setCalculando(false)
    if (r.ok) fetchAnticipos(empresaId, anio)
    else { const d = await r.json(); alert('Error: ' + d.error) }
  }

  async function confirmarPago() {
    if (!pagoModal) return
    setPagando(true)
    const r = await fetch('/api/tributacion/anticipos-ir', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id:           pagoModal.id,
        empresa_id:   empresaId,
        numero_boleta: boleta || undefined,
        fecha_pago:   fechaPago,
        forma_pago:   formaPago,
      }),
    })
    const d = await r.json()
    setPagando(false)
    if (r.ok) {
      setPagoModal(null); setBoleta(''); setFormaPago('banco')
      setFechaPago(new Date().toISOString().split('T')[0])
      fetchAnticipos(empresaId, anio)
    } else {
      alert('Error: ' + d.error)
    }
  }

  const totalPagado    = anticipos.filter(a => a.estado === 'pagado').reduce((s, a) => s + a.monto_a_pagar, 0)
  const totalPendiente = anticipos.filter(a => a.estado !== 'pagado').reduce((s, a) => s + a.monto_a_pagar, 0)
  const hoy = new Date()

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/tributacion" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Anticipos Mensuales IR</h1>
            <p className="text-sm text-gray-500 mt-0.5">LCT Art. 63-64 · 1% ingresos brutos · Vence día 5 de cada mes</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select value={anio} onChange={e => { const a = parseInt(e.target.value); setAnio(a); fetchAnticipos(empresaId, a) }}
            className="border rounded-lg px-3 py-2 text-sm">
            {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={() => calcularMes(new Date().getMonth() + 1)} disabled={calculando}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-700 disabled:opacity-50">
            <Plus size={16} />
            {calculando ? 'Calculando...' : 'Calcular Mes Actual'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-green-50 rounded-xl p-4 border border-green-200">
          <p className="text-sm text-gray-600">Total Pagado {anio}</p>
          <p className="text-2xl font-bold text-green-700">{fmt(totalPagado)}</p>
          <p className="text-xs text-gray-500 mt-1">Acreditable contra IR Anual</p>
        </div>
        <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
          <p className="text-sm text-gray-600">Total Pendiente {anio}</p>
          <p className="text-2xl font-bold text-amber-700">{fmt(totalPendiente)}</p>
        </div>
      </div>

      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 text-sm text-purple-800">
        <strong>Acreditación IR Anual:</strong> Los anticipos pagados se deducen del IR anual (F-106).
        El sistema los registra en <strong>1.1.10 IR Pagado por Anticipado</strong> (activo diferido)
        y los aplica automáticamente al calcular el IR Anual.
      </div>

      {/* Modal de pago */}
      {pagoModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg">Pagar Anticipo IR</h3>
              <button onClick={() => setPagoModal(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="bg-purple-50 rounded-lg p-3 text-sm">
              <p className="font-medium text-purple-800">{MESES[pagoModal.mes]} {pagoModal.anio}</p>
              <p className="text-gray-600">Monto a pagar: <strong>{fmt(pagoModal.monto_a_pagar)}</strong></p>
              <p className="text-gray-600">Vencimiento: {pagoModal.fecha_vencimiento}</p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Fecha de pago</label>
                <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={fechaPago} onChange={e => setFechaPago(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Forma de pago</label>
                <select className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={formaPago} onChange={e => setFormaPago(e.target.value as 'banco'|'caja')}>
                  <option value="banco">Banco / Transferencia</option>
                  <option value="caja">Caja / Efectivo</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">N° Boleta VET DGI <span className="text-gray-400 font-normal">(opcional)</span></label>
                <input type="text" className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
                  placeholder="Ej: 2026-06-00001234"
                  value={boleta} onChange={e => setBoleta(e.target.value)} />
              </div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
              Se generará automáticamente el asiento contable:<br />
              <strong>DB</strong> 1.1.10 IR Pagado por Anticipado · <strong>CR</strong> {formaPago === 'banco' ? '1.1.03 Banco' : '1.1.01 Caja'}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setPagoModal(null)}
                className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2.5 text-sm hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={confirmarPago} disabled={pagando}
                className="flex-1 bg-purple-600 text-white rounded-lg py-2.5 text-sm hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {pagando
                  ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Procesando...</>
                  : <><CheckCircle size={16} /> Confirmar Pago</>
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-gray-400">Cargando...</div>
      ) : anticipos.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <DollarSign size={40} className="mx-auto mb-2 opacity-30" />
          <p>No hay anticipos para {anio}. Use <strong>Calcular Mes Actual</strong>.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Período','Ingresos Brutos','Anticipo 1%','Retenciones','A Pagar','Vencimiento','Estado','Acción'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {anticipos.map(a => {
                const vencida = a.estado === 'pendiente' && new Date(a.fecha_vencimiento) < hoy
                const proxima = a.estado === 'pendiente' && !vencida &&
                  Math.ceil((new Date(a.fecha_vencimiento).getTime() - hoy.getTime()) / 86400000) <= 10
                return (
                  <tr key={a.id} className={`hover:bg-gray-50 ${vencida ? 'bg-red-50' : proxima ? 'bg-amber-50' : ''}`}>
                    <td className="px-4 py-3 font-medium whitespace-nowrap">{MESES[a.mes]} {a.anio}</td>
                    <td className="px-4 py-3">{fmt(a.ingresos_brutos_mes)}</td>
                    <td className="px-4 py-3">{fmt(a.monto_anticipo)}</td>
                    <td className="px-4 py-3 text-green-600">- {fmt(a.retenciones_recibidas)}</td>
                    <td className="px-4 py-3 font-bold">{fmt(a.monto_a_pagar)}</td>
                    <td className={`px-4 py-3 font-mono text-xs ${vencida ? 'text-red-600 font-bold' : proxima ? 'text-amber-600' : 'text-gray-600'}`}>
                      {a.fecha_vencimiento}
                      {vencida && <span className="ml-1">⚠</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        a.estado === 'pagado'   ? 'bg-green-100 text-green-700'  :
                        vencida                 ? 'bg-red-100 text-red-700'      :
                                                  'bg-amber-100 text-amber-700'
                      }`}>
                        {a.estado === 'pendiente' && vencida ? 'VENCIDA' : a.estado.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {a.estado === 'pendiente' ? (
                        <button onClick={() => setPagoModal(a)}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs bg-purple-600 text-white rounded-lg hover:bg-purple-700">
                          <CheckCircle size={12} /> Pagar
                        </button>
                      ) : (
                        <div className="text-xs text-green-600 space-y-0.5">
                          <div className="flex items-center gap-1"><CheckCircle size={12} /> Pagado {a.fecha_pago}</div>
                          {a.asiento_id && <div className="text-gray-400">Con asiento ✓</div>}
                          {a.numero_boleta && <div className="text-gray-400 font-mono">{a.numero_boleta}</div>}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="bg-gray-50 border-t font-semibold text-sm">
              <tr>
                <td colSpan={4} className="px-4 py-3 text-right text-gray-600">Total acreditado al IR Anual:</td>
                <td className="px-4 py-3 text-green-700">{fmt(totalPagado)}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}
