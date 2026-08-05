'use client'
// src/app/dashboard/estados-financieros/cambios-patrimonio/page.tsx
// Siconic - Estado de Cambios en el Patrimonio
// NIIF PYMES Sección 6 | Código de Comercio Nicaragua

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { BarChart3, RefreshCw, AlertCircle, Printer } from 'lucide-react'

interface FilaPatrimonio {
  concepto: string
  capital: number
  reserva: number
  utilidades_retenidas: number
  utilidad_ejercicio: number
  total: number
  esTotal?: boolean
  esResultado?: boolean
}

interface DatosPatrimonio {
  empresa: { nombre: string; ruc: string }
  periodo: { inicio: string; fin: string }
  columnas: string[]
  filas: FilaPatrimonio[]
  totales: { patrimonio_inicio: number; patrimonio_fin: number; variacion: number }
}

function fmtC(v: number) {
  if (v === 0) return '—'
  const abs = Math.abs(v).toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return v < 0 ? `(${abs})` : abs
}

const COLS = ['capital', 'reserva', 'utilidades_retenidas', 'utilidad_ejercicio', 'total'] as const

function CambiosPatrimonioPageContent() {
  const searchParams = useSearchParams()
  const [datos, setDatos] = useState<DatosPatrimonio | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const fechaInicio = searchParams.get('fecha_inicio') || '2024-01-01'
  const fechaFin = searchParams.get('fecha_fin') || '2024-12-31'
  const empresaId = searchParams.get('empresa_id') || ''

  const cargar = useCallback(async () => {
    setCargando(true)
    setError('')
    try {
      const params = new URLSearchParams({ empresa_id: empresaId, fecha_inicio: fechaInicio, fecha_fin: fechaFin })
      const res = await fetch(`/api/estados-financieros/cambios-patrimonio?${params}`)
      if (!res.ok) throw new Error()
      setDatos(await res.json())
    } catch { setError('Error al cargar el Estado de Cambios en el Patrimonio.') }
    finally { setCargando(false) }
  }, [empresaId, fechaInicio, fechaFin])

  useEffect(() => { cargar() }, [cargar])

  const formatFecha = (f: string) => new Date(f + 'T12:00:00').toLocaleDateString('es-NI', {
    day: '2-digit', month: 'long', year: 'numeric'
  })

  if (cargando) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <RefreshCw className="animate-spin text-orange-500 mx-auto mb-3" size={32} />
        <p className="text-gray-500 text-sm">Calculando Cambios en Patrimonio...</p>
      </div>
    </div>
  )

  if (error) return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="bg-red-50 border border-red-200 rounded-xl p-6">
        <p className="text-red-800">{error}</p>
        <button onClick={cargar} className="mt-2 text-sm text-red-600 underline">Reintentar</button>
      </div>
    </div>
  )

  if (!datos) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-orange-50 rounded-lg p-2.5">
              <BarChart3 className="text-orange-600" size={22} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Cambios en el Patrimonio</h1>
              <p className="text-xs text-gray-500">NIIF PYMES § 6 · {formatFecha(fechaInicio)} — {formatFecha(fechaFin)}</p>
            </div>
          </div>
          <button
            onClick={() => window.print()}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-2"
          >
            <Printer size={15} />Imprimir
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6">
        {/* KPI variación */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Patrimonio al Inicio', valor: datos.totales.patrimonio_inicio, color: 'text-gray-700' },
            { label: 'Variación del Período', valor: datos.totales.variacion, color: datos.totales.variacion >= 0 ? 'text-emerald-600' : 'text-red-600' },
            { label: 'Patrimonio al Final', valor: datos.totales.patrimonio_fin, color: 'text-blue-700' },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-1">{k.label}</p>
              <p className={`text-xl font-bold ${k.color}`}>
                C$ {Math.abs(k.valor).toLocaleString('es-NI', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </p>
            </div>
          ))}
        </div>

        {/* Tabla de cambios */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="text-center py-5 bg-gray-50 border-b border-gray-100">
            <h2 className="font-bold text-gray-900 text-lg uppercase">{datos.empresa.nombre}</h2>
            <p className="text-sm text-gray-500">RUC: {datos.empresa.ruc}</p>
            <h3 className="font-bold text-gray-800 mt-3 uppercase">Estado de Cambios en el Patrimonio Neto</h3>
            <p className="text-sm text-gray-600">Del {formatFecha(fechaInicio)} al {formatFecha(fechaFin)}</p>
            <p className="text-xs text-gray-500">(Expresado en Córdobas C$)</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-700 text-white">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide w-48">CONCEPTO</th>
                  {datos.columnas.map(c => (
                    <th key={c} className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {datos.filas.map((fila, i) => {
                  const bg = fila.esTotal
                    ? 'bg-blue-50 border-y-2 border-blue-200 font-bold'
                    : fila.esResultado
                      ? 'bg-emerald-50 font-semibold'
                      : 'hover:bg-gray-50'
                  return (
                    <tr key={i} className={bg}>
                      <td className="px-4 py-2.5 text-gray-700">{fila.concepto}</td>
                      {COLS.map(col => (
                        <td key={col} className={`px-4 py-2.5 text-right font-mono ${(fila[col] as number) < 0 ? 'text-red-600' : 'text-gray-700'} ${fila.esTotal ? 'text-blue-900 font-bold' : ''}`}>
                          {fmtC(fila[col] as number)}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
            <p className="text-xs text-gray-400">
              NIIF PYMES Sección 6 · Reserva Legal: 25% conforme Código de Comercio Nicaragua ·
              Generado por Siconic el {new Date().toLocaleDateString('es-NI')}
            </p>
          </div>
        </div>

        {/* Nota sobre Reserva Legal */}
        <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
          <p className="text-xs text-blue-800">
            <strong>Nota — Reserva Legal:</strong> El Código de Comercio de Nicaragua exige constituir una Reserva Legal
            del 5% de las utilidades netas de cada ejercicio hasta alcanzar el 25% del capital social.
            Una vez constituida, debe mantenerse en todo momento y solo puede usarse para absorber pérdidas.
          </p>
        </div>
      </div>
    </div>
  )
}

import { Suspense } from 'react'

export default function CambiosPatrimonioPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500 text-sm">Cargando...</p>
      </div>
    }>
      <CambiosPatrimonioPageContent />
    </Suspense>
  )
}
