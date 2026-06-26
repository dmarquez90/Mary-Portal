'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

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

export default function CajaBancosPage() {
  const empresaId = useEmpresaId()
  if (!empresaId) return <div className="p-6"><p>Cargando...</p></div>
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Caja y Bancos</h1>
          <p className="text-gray-600 mt-1">Gestión de efectivo y cuentas</p>
        </div>
        <Link href="/dashboard/caja-bancos/nueva-transaccion" className="bg-blue-600 text-white px-4 py-2 rounded-lg">Nueva Transacción</Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border p-4"><p className="text-xs text-gray-500 uppercase">Saldo NIO</p><p className="text-2xl font-bold mt-2 text-green-600">C$0.00</p></div>
        <div className="bg-white rounded-lg border p-4"><p className="text-xs text-gray-500 uppercase">Saldo USD</p><p className="text-2xl font-bold mt-2 text-blue-600">$0.00</p></div>
        <div className="bg-white rounded-lg border p-4"><p className="text-xs text-gray-500 uppercase">Cuentas</p><p className="text-2xl font-bold mt-2">0</p></div>
        <div className="bg-white rounded-lg border p-4"><p className="text-xs text-gray-500 uppercase">Transacciones</p><p className="text-2xl font-bold mt-2">0</p></div>
      </div>
      <div className="bg-white rounded-lg border p-6 mt-6"><p className="text-gray-600">Módulo Caja y Bancos listo</p></div>
    </div>
  )
}
