'use client'
// src/app/dashboard/contabilidad/page.tsx
// Dashboard de Contabilidad — resumen de los 4 módulos
import { useEffect, useState } from 'react'
import Link from 'next/link'

const MODULOS = [
  {
    href: '/dashboard/contabilidad/plan-cuentas',
    icon: '📋',
    titulo: 'Plan de Cuentas',
    desc: 'Catálogo de cuentas NIIF PYMES Nicaragua',
    color: 'bg-blue-50 border-blue-200',
    badge: 'Catálogo',
  },
  {
    href: '/dashboard/contabilidad/diario',
    icon: '📝',
    titulo: 'Libro Diario',
    desc: 'Asientos contables de partida doble',
    color: 'bg-green-50 border-green-200',
    badge: 'Asientos',
  },
  {
    href: '/dashboard/contabilidad/mayor',
    icon: '📚',
    titulo: 'Libro Mayor',
    desc: 'Movimientos y saldos por cuenta',
    color: 'bg-purple-50 border-purple-200',
    badge: 'Mayor',
  },
  {
    href: '/dashboard/contabilidad/balance',
    icon: '⚖️',
    titulo: 'Balance de Comprobación',
    desc: 'Verificación partida doble — Debe = Haber',
    color: 'bg-amber-50 border-amber-200',
    badge: 'Control',
  },
]

export default function ContabilidadPage() {
  const [resumen, setResumen] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [cuentasCount, setCuentasCount] = useState<number | null>(null)
  const [planIniciado, setPlanIniciado] = useState(false)
  const [iniciando, setIniciando] = useState(false)

  const anio = new Date().getFullYear()

  useEffect(() => {
    async function cargar() {
      // Verificar si ya tiene plan de cuentas
      const resCuentas = await fetch('/api/plan-cuentas')
      const datCuentas = await resCuentas.json()
      const count = datCuentas.cuentas?.length ?? 0
      setCuentasCount(count)
      setPlanIniciado(count > 0)

      if (count > 0) {
        // Cargar resumen contable
        const res = await fetch(`/api/mayor?anio=${anio}`)
        const dat = await res.json()
        setResumen(dat.resumen)
      }
      setLoading(false)
    }
    cargar()
  }, [anio])

  async function iniciarPlanCuentas() {
    setIniciando(true)
    const res = await fetch('/api/plan-cuentas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'seed' }),
    })
    if (res.ok) {
      setPlanIniciado(true)
      window.location.reload()
    }
    setIniciando(false)
  }

  const fmt = (n: number) =>
    new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO', minimumFractionDigits: 2 }).format(Math.abs(n))

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Contabilidad General</h1>
        <p className="text-sm text-gray-500 mt-1">
          Ley 822 LCT · Código Tributario · NIIF PYMES Nicaragua — Período fiscal {anio}
        </p>
      </div>

      {/* Aviso si no tiene plan de cuentas */}
      {!loading && !planIniciado && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="text-3xl">📋</div>
          <div className="flex-1">
            <p className="font-semibold text-amber-800">Módulo de Contabilidad sin configurar</p>
            <p className="text-sm text-amber-700 mt-1">
              Para empezar, inicializa el Plan de Cuentas predeterminado basado en NIIF PYMES adaptado a Nicaragua.
              Incluye <strong>70+ cuentas</strong> con referencias a la Ley 822.
            </p>
          </div>
          <button
            onClick={iniciarPlanCuentas}
            disabled={iniciando}
            className="shrink-0 bg-amber-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-60 transition-colors"
          >
            {iniciando ? 'Inicializando...' : 'Inicializar Plan de Cuentas'}
          </button>
        </div>
      )}

      {/* Resumen financiero (si ya tiene datos) */}
      {resumen && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {[
            { label: 'Activos', value: resumen.activo, color: 'text-blue-700' },
            { label: 'Pasivos', value: resumen.pasivo * -1, color: 'text-red-600' },
            { label: 'Patrimonio', value: resumen.patrimonio * -1, color: 'text-purple-700' },
            { label: 'Ingresos', value: resumen.ingreso * -1, color: 'text-green-700' },
            { label: 'Costos', value: resumen.costo, color: 'text-orange-600' },
            { label: 'Gastos', value: resumen.gasto, color: 'text-gray-700' },
          ].map((item) => (
            <div key={item.label} className="bg-white border border-gray-100 rounded-xl p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider">{item.label}</p>
              <p className={`text-lg font-semibold mt-1 ${item.color}`}>{fmt(item.value)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Módulos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {MODULOS.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className={`flex items-start gap-4 p-5 rounded-xl border ${m.color} hover:shadow-sm transition-shadow`}
          >
            <span className="text-3xl">{m.icon}</span>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold text-gray-900">{m.titulo}</p>
                <span className="text-xs px-2 py-0.5 bg-white/70 rounded-full text-gray-600 border border-gray-200">
                  {m.badge}
                </span>
              </div>
              <p className="text-sm text-gray-600 mt-0.5">{m.desc}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Info legal */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs text-gray-500 space-y-1">
        <p>📌 <strong>Requerido por DGI:</strong> El Código Tributario (Ley 562) exige que todo contribuyente lleve libros contables actualizados — Diario y Mayor — para efectos de auditoría fiscal.</p>
        <p>📌 <strong>Partida doble:</strong> Cada transacción afecta al menos 2 cuentas. El total de débitos siempre debe ser igual al total de créditos.</p>
        <p>📌 <strong>Período fiscal Nicaragua:</strong> Del 1 de enero al 31 de diciembre (Ley 822 art. 51).</p>
      </div>
    </div>
  )
}
