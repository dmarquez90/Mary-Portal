'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

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

export default function NuevaTransaccionPage() {
  const empresaId = useEmpresaId()
  const [tipo, setTipo] = useState('ingreso')

  if (!empresaId) return <div className="p-6"><p>Cargando...</p></div>

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <Link href="/dashboard/caja-bancos" className="flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-6">
        <ChevronLeft size={20} /> Volver
      </Link>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h1 className="text-2xl font-bold mb-6">Nueva Transacción</h1>

        <form className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Tipo de Transacción</label>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value)}
              className="w-full border border-gray-300 rounded-lg p-2"
            >
              <option value="ingreso">Ingreso</option>
              <option value="egreso">Egreso</option>
              <option value="transferencia">Transferencia</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Monto (NIO)</label>
            <input
              type="number"
              placeholder="0.00"
              className="w-full border border-gray-300 rounded-lg p-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Descripción</label>
            <textarea
              placeholder="Descripción de la transacción"
              className="w-full border border-gray-300 rounded-lg p-2"
              rows={4}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              Guardar Transacción
            </button>
            <Link
              href="/dashboard/caja-bancos"
              className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300"
            >
              Cancelar
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
