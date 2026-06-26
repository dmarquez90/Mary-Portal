'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Plus, Building2, AlertTriangle, CheckCircle } from 'lucide-react'
import { getTransaccionesBanco, getResumenBancos, getCuentasBanco, getCheques } from '@/lib/pagos/queries'
import type { TransaccionBanco, CuentaBanco, ResumenBancos, Cheque } from '@/types/pagos'
import { formatNIO, TIPO_PAGO_LABELS, TIPO_PAGO_COLORS, ESTADO_CHEQUE_COLORS } from '@/types/pagos'

function useEmpresaId() {
  const [empresaId, setEmpresaId] = useState<string>('')
  useEffect(() => {
    const load = async () => {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const [{ data: en }, { data: ej }] = await Promise.all([
        supabase.from('empresas_persona_natural').select('id').eq('user_id', user.id).maybeSingle(),
        supabase.from('empresas_juridicas').select('id').eq('user_id', user.id).maybeSingle(),
      ])
      const ids = [en?.id, ej?.id].filter(Boolean) as string[]
      if (ids.length > 0) setEmpresaId(ids[0])
    }
    load()
  }, [])
  return empresaId
}

function formatFecha(fecha: string) {
  return new Date(fecha + 'T00:00:00').toLocaleDateString('es-NI', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function BancosPage() {
  const empresaId = useEmpresaId()
  const [resumen, setResumen] = useState<ResumenBancos | null>(null)
  const [cuentas, setCuentas] = useState<CuentaBanco[]>([])
  const [transacciones, setTransacciones] = useState<TransaccionBanco[]>([])
  const [cheques, setCheques] = useState<Cheque[]>([])
  const [tab, setTab] = useState<'transacciones' | 'cheques'>('transacciones')
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    if (!empresaId) return
    setLoading(true)
    try {
      const [res, cts, txs, chqs] = await Promise.all([
        getResumenBancos(empresaId),
        getCuentasBanco(empresaId),
        getTransaccionesBanco(empresaId, { limit: 50 }),
        getCheques(empresaId),
      ])
      setResumen(res)
      setCuentas(cts)
      setTransacciones(txs)
      setCheques(chqs)
    } catch (err) {
      console.error('Error cargando Bancos:', err)
    } finally {
      setLoading(false)
    }
  }, [empresaId])

  useEffect(() => { loadData() }, [loadData])

  if (!empresaId || loading) return <div className="p-6"><p className="text-gray-500">Cargando...</p></div>

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Bancos</h1>
          <p className="text-gray-600 mt-1">Cuentas bancarias, transferencias y cheques</p>
        </div>
        <Link href="/dashboard/bancos/nueva-cuenta" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm">
          <Plus size={18} /> Nueva Cuenta
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2"><div className="bg-blue-100 p-2 rounded-lg"><Building2 size={18} className="text-blue-600" /></div><p className="text-xs font-medium text-gray-500 uppercase">Saldo Total</p></div>
          <p className="text-2xl font-bold text-gray-900">{formatNIO(resumen?.saldo_total_nio ?? 0)}</p>
          <p className="text-xs text-gray-400 mt-1">{resumen?.total_cuentas ?? 0} cuentas activas</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2"><div className="bg-purple-100 p-2 rounded-lg"><CheckCircle size={18} className="text-purple-600" /></div><p className="text-xs font-medium text-gray-500 uppercase">Cheques Activos</p></div>
          <p className="text-2xl font-bold text-gray-900">{resumen?.cheques_activos ?? 0}</p>
        </div>
        <div className={`rounded-xl border p-5 ${(resumen?.cheques_por_vencer ?? 0) > 0 ? 'bg-orange-50 border-orange-200' : 'bg-white border-gray-200'}`}>
          <div className="flex items-center gap-3 mb-2"><div className={`p-2 rounded-lg ${(resumen?.cheques_por_vencer ?? 0) > 0 ? 'bg-orange-100' : 'bg-gray-100'}`}><AlertTriangle size={18} className={`${(resumen?.cheques_por_vencer ?? 0) > 0 ? 'text-orange-600' : 'text-gray-400'}`} /></div><p className="text-xs font-medium text-gray-500 uppercase">Por Vencer (7 días)</p></div>
          <p className={`text-2xl font-bold ${(resumen?.cheques_por_vencer ?? 0) > 0 ? 'text-orange-600' : 'text-gray-900'}`}>{resumen?.cheques_por_vencer ?? 0}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2"><div className="bg-green-100 p-2 rounded-lg"><Building2 size={18} className="text-green-600" /></div><p className="text-xs font-medium text-gray-500 uppercase">Transacciones</p></div>
          <p className="text-2xl font-bold text-gray-900">{transacciones.length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-4">Cuentas Bancarias</h2>
          {cuentas.length > 0 ? (
            <div className="space-y-3">
              {cuentas.map(c => (
                <div key={c.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <div><p className="font-medium text-sm">{c.nombre}</p><p className="text-xs text-gray-500">{c.banco} {c.numero_cuenta ? '• ' + c.numero_cuenta : ''}</p></div>
                  <p className="font-bold text-sm">{formatNIO(c.saldo_actual)}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Building2 size={32} className="text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">Sin cuentas bancarias</p>
              <Link href="/dashboard/bancos/nueva-cuenta" className="text-blue-600 text-sm hover:underline mt-2 inline-block">+ Agregar cuenta</Link>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 lg:col-span-2">
          <div className="flex gap-4 border-b mb-4">
            {(['transacciones', 'cheques'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} className={`pb-3 text-sm font-medium ${tab === t ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
                {t === 'transacciones' ? 'Transacciones' : `Cheques (${cheques.length})`}
              </button>
            ))}
          </div>

          {tab === 'transacciones' && (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {transacciones.length > 0 ? transacciones.map(tx => (
                <div key={tx.id} className="flex justify-between items-center p-3 rounded-lg hover:bg-gray-50">
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${TIPO_PAGO_COLORS[tx.tipo]}`}>{TIPO_PAGO_LABELS[tx.tipo]}</span>
                    <div><p className="text-sm font-medium text-gray-900">{tx.descripcion}</p><p className="text-xs text-gray-500">{formatFecha(tx.fecha)}{tx.referencia ? ' • Ref: ' + tx.referencia : ''}</p></div>
                  </div>
                  <p className="font-semibold text-sm">{formatNIO(tx.monto)}</p>
                </div>
              )) : <p className="text-center text-gray-500 text-sm py-8">Sin transacciones registradas</p>}
            </div>
          )}

          {tab === 'cheques' && (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {cheques.length > 0 ? cheques.map(chq => (
                <div key={chq.id} className="flex justify-between items-center p-3 rounded-lg hover:bg-gray-50">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium">#{chq.numero_cheque}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ESTADO_CHEQUE_COLORS[chq.estado]}`}>{chq.estado}</span>
                      {(chq.dias_para_vencer ?? 0) <= 7 && chq.estado === 'activo' && <span className="text-xs text-orange-600 font-medium">Vence en {chq.dias_para_vencer} días</span>}
                    </div>
                    <p className="text-xs text-gray-500">{chq.tipo === 'emitido' ? 'Emitido' : 'Recibido'} • {formatFecha(chq.fecha_emision)}</p>
                  </div>
                  <p className="font-semibold text-sm">{formatNIO(chq.monto)}</p>
                </div>
              )) : <p className="text-center text-gray-500 text-sm py-8">Sin cheques registrados</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
