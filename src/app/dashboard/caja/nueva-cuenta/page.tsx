'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { crearCuentaCaja } from '@/lib/pagos/queries'
import type { TipoCuenta } from '@/types/pagos'

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

export default function NuevaCuentaCajaPage() {
  const empresaId = useEmpresaId()
  const router = useRouter()
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState<TipoCuenta>('caja_general')
  const [saldoInicial, setSaldoInicial] = useState('0.00')
  const [limite, setLimite] = useState('')
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function guardar() {
    setError(null)
    if (!nombre.trim()) { setError('El nombre es requerido'); return }
    setGuardando(true)
    try {
      await crearCuentaCaja({
        empresa_id: empresaId,
        nombre: nombre.trim(),
        tipo,
        saldo_inicial: parseFloat(saldoInicial) || 0,
        limite_caja_chica: tipo === 'caja_chica' && limite ? parseFloat(limite) : undefined,
        notas: notas.trim() || undefined,
      })
      router.push('/dashboard/caja')
    } catch (err: any) {
      setError(err.message ?? 'Error al crear la cuenta')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="p-6 max-w-lg mx-auto">
      <Link href="/dashboard/caja" className="flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-6 text-sm">
        <ChevronLeft size={18} /> Volver a Caja
      </Link>
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h1 className="text-xl font-bold mb-6">Nueva Cuenta de Caja</h1>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
            <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Caja General" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
            <select value={tipo} onChange={e => setTipo(e.target.value as TipoCuenta)} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="caja_general">Caja General</option>
              <option value="caja_chica">Caja Chica</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Saldo Inicial (NIO)</label>
            <input type="number" value={saldoInicial} onChange={e => setSaldoInicial(e.target.value)} step="0.01" min="0" placeholder="0.00" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          {tipo === 'caja_chica' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Límite Caja Chica (NIO)</label>
              <input type="number" value={limite} onChange={e => setLimite(e.target.value)} step="0.01" min="0" placeholder="5000.00" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notas</label>
            <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={3} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button onClick={guardar} disabled={guardando || !empresaId} className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium">
              {guardando ? 'Guardando...' : 'Crear Cuenta'}
            </button>
            <Link href="/dashboard/caja" className="flex-1 text-center bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 text-sm font-medium">Cancelar</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
