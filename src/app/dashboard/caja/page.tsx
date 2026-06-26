'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Plus, TrendingUp, TrendingDown, Wallet } from 'lucide-react'
import { getMovimientosCaja, getResumenCaja, getCuentasCaja } from '@/lib/pagos/queries'
import type { MovimientoCaja, CuentaCaja, ResumenCaja } from '@/types/pagos'
import { formatNIO } from '@/types/pagos'

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

export default function CajaPage() {
  const empresaId = useEmpresaId()
  const [resumen, setResumen] = useState<ResumenCaja | null>(null)
  const [cuentas, setCuentas] = useState<CuentaCaja[]>([])
  const [movimientos, setMovimientos] = useState<MovimientoCaja[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    if (!empresaId) return
    setLoading(true)
    try {
      const [res, cts, movs] = await Promise.all([
        getResumenCaja(empresaId),
        getCuentasCaja(empresaId),
        getMovimientosCaja(empresaId, { limit: 50 }),
      ])
      setResumen(res)
      setCuentas(cts)
      setMovimientos(movs)
    } catch (err) {
      console.error('Error cargando Caja:', err)
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
          <h1 className="text-3xl font-bold text-gray-900">Caja</h1>
          <p className="text-gray-600 mt-1">Control de efectivo y movimientos</p>
        </div>
        <Link href="/dashboard/caja/nueva-cuenta" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm">
          <Plus size={18} /> Nueva Cuenta
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2"><div className="bg-blue-100 p-2 rounded-lg"><Wallet size={18} className="text-blue-600" /></div><p className="text-xs font-medium text-gray-500 uppercase">Saldo Total</p></div>
          <p className="text-2xl font-bold text-gray-900">{formatNIO(resumen?.saldo_total ?? 0)}</p>
          <p className="text-xs text-gray-400 mt-1">{resumen?.total_cuentas ?? 0} cuentas activas</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2"><div className="bg-green-100 p-2 rounded-lg"><TrendingUp size={18} className="text-green-600" /></div><p className="text-xs font-medium text-gray-500 uppercase">Ingresos Hoy</p></div>
          <p className="text-2xl font-bold text-green-600">{formatNIO(resumen?.ingresos_hoy ?? 0)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2"><div className="bg-red-100 p-2 rounded-lg"><TrendingDown size={18} className="text-red-600" /></div><p className="text-xs font-medium text-gray-500 uppercase">Egresos Hoy</p></div>
          <p className="text-2xl font-bold text-red-600">{formatNIO(resumen?.egresos_hoy ?? 0)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-2"><div className="bg-purple-100 p-2 rounded-lg"><Wallet size={18} className="text-purple-600" /></div><p className="text-xs font-medium text-gray-500 uppercase">Movimientos Hoy</p></div>
          <p className="text-2xl font-bold text-gray-900">{resumen?.movimientos_hoy ?? 0}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-4">Cuentas de Caja</h2>
          {cuentas.length > 0 ? (
            <div className="space-y-3">
              {cuentas.map(c => (
                <div key={c.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                  <div><p className="font-medium text-sm">{c.nombre}</p><p className="text-xs text-gray-500">{c.tipo === 'caja_general' ? 'Caja General' : 'Caja Chica'}</p></div>
                  <p className="font-bold text-sm">{formatNIO(c.saldo_actual)}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Wallet size={32} className="text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">Sin cuentas de caja</p>
              <Link href="/dashboard/caja/nueva-cuenta" className="text-blue-600 text-sm hover:underline mt-2 inline-block">+ Crear cuenta</Link>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold mb-4">Últimos Movimientos</h2>
          {movimientos.length > 0 ? (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {movimientos.map(m => (
                <div key={m.id} className="flex justify-between items-center p-3 rounded-lg hover:bg-gray-50">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${m.tipo === 'ingreso' ? 'bg-green-100' : 'bg-red-100'}`}>
                      {m.tipo === 'ingreso' ? <TrendingUp size={14} className="text-green-600" /> : <TrendingDown size={14} className="text-red-600" />}
                    </div>
                    <div><p className="text-sm font-medium text-gray-900">{m.descripcion}</p><p className="text-xs text-gray-500">{formatFecha(m.fecha)}</p></div>
                  </div>
                  <p className={`font-semibold text-sm ${m.tipo === 'ingreso' ? 'text-green-600' : 'text-red-600'}`}>{m.tipo === 'ingreso' ? '+' : '-'}{formatNIO(m.monto)}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-500 text-sm">Sin movimientos registrados</p>
              <p className="text-gray-400 text-xs mt-1">Los movimientos aparecen automáticamente cuando registras cobros en efectivo</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
