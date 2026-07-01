'use client'
// src/components/contabilidad/AlertasSaldoNegativo.tsx
// Panel de alertas: cuentas de activo (caja, bancos, CxC, inventario, etc.)
// que actualmente tienen saldo negativo. El bloqueo de NUEVOS movimientos
// que dejen una cuenta en negativo corre en la base de datos (trigger
// fn_validar_saldo_no_negativo); este panel muestra las cuentas que ya
// quedaron en negativo por movimientos históricos y que deben corregirse.
import { useEffect, useState } from 'react'

type Alerta = { cuenta_id: string; codigo: string; nombre: string; tipo: string; saldo: number }

export default function AlertasSaldoNegativo() {
  const [alertas, setAlertas] = useState<Alerta[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelado = false
    fetch('/api/alertas-contables')
      .then(r => r.json())
      .then(dat => { if (!cancelado) setAlertas(dat.alertas || []) })
      .finally(() => { if (!cancelado) setLoading(false) })
    return () => { cancelado = true }
  }, [])

  if (loading || alertas.length === 0) return null

  const fmt = (n: number) =>
    new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO', minimumFractionDigits: 2 }).format(n)

  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <span className="text-xl">⚠️</span>
        <div className="flex-1">
          <p className="font-semibold text-red-800 text-sm">
            {alertas.length === 1 ? '1 cuenta de activo con saldo negativo' : `${alertas.length} cuentas de activo con saldo negativo`}
          </p>
          <p className="text-xs text-red-700 mt-0.5">
            Un activo (caja, banco, cuentas por cobrar, etc.) no debería tener saldo negativo. Corrige el origen del movimiento antes de seguir operando esta cuenta.
          </p>
          <ul className="mt-2 space-y-1">
            {alertas.map(a => (
              <li key={a.cuenta_id} className="flex items-center justify-between text-sm bg-white/70 border border-red-100 rounded-lg px-3 py-1.5">
                <span className="text-gray-700"><span className="font-mono text-xs text-red-600 mr-2">{a.codigo}</span>{a.nombre}</span>
                <span className="font-semibold text-red-700">{fmt(a.saldo)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
