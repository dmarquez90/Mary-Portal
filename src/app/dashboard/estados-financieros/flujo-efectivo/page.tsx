'use client'
// src/app/dashboard/estados-financieros/flujo-efectivo/page.tsx
// Siconic - Estado de Flujo de Efectivo (Método Indirecto)
// NIIF PYMES Sección 7

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { ArrowLeftRight, CheckCircle, AlertCircle, RefreshCw, Printer, Save } from 'lucide-react'

interface SeccionFlujo {
  titulo: string
  referencia: string
  items: { descripcion: string; valor: number | null; ajuste: boolean; esEncabezado?: boolean }[]
  subtotal: number
  subtotalLabel: string
}

interface DatosFlujo {
  empresa: { nombre: string; ruc: string }
  periodo: { inicio: string; fin: string }
  secciones: SeccionFlujo[]
  totales: {
    operativas: number
    inversiones: number
    financiamiento: number
    variacion_neta: number
    efectivo_inicio: number
    efectivo_fin: number
    conciliacion: number
  }
  conciliado: boolean
  alerta_conciliacion?: string
}

function fmtC(v: number) {
  const abs = Math.abs(v).toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return v < 0 ? `(${abs})` : abs
}

const COLORES_SECCION = ['bg-emerald-700', 'bg-purple-700', 'bg-orange-700']

function FlujoEfectivoPageContent() {
  const searchParams = useSearchParams()
  const [datos, setDatos] = useState<DatosFlujo | null>(null)
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
      const res = await fetch(`/api/estados-financieros/flujo-efectivo?${params}`)
      if (!res.ok) throw new Error()
      setDatos(await res.json())
    } catch { setError('Error al cargar el Flujo de Efectivo.') }
    finally { setCargando(false) }
  }, [empresaId, fechaInicio, fechaFin])

  useEffect(() => { cargar() }, [cargar])

  const formatFecha = (f: string) => new Date(f + 'T12:00:00').toLocaleDateString('es-NI', { day: '2-digit', month: 'long', year: 'numeric' })

  if (cargando) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <RefreshCw className="animate-spin text-purple-500 mx-auto mb-3" size={32} />
        <p className="text-gray-500 text-sm">Calculando Flujo de Efectivo...</p>
      </div>
    </div>
  )

  if (error) return (
    <div className="max-w-4xl mx-auto px-6 py-8">
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
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-purple-50 rounded-lg p-2.5">
              <ArrowLeftRight className="text-purple-600" size={22} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Flujo de Efectivo</h1>
              <p className="text-xs text-gray-500">Método Indirecto · NIIF PYMES § 7 · {formatFecha(fechaInicio)} — {formatFecha(fechaFin)}</p>
            </div>
          </div>
          {datos.conciliado ? (
            <span className="flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
              <CheckCircle size={12} /> Conciliado
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-red-700 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full">
              <AlertCircle size={12} /> {datos.alerta_conciliacion}
            </span>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6">
        {/* KPIs */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Actividades Operativas', valor: datos.totales.operativas, color: 'text-emerald-600' },
            { label: 'Actividades de Inversión', valor: datos.totales.inversiones, color: 'text-purple-600' },
            { label: 'Actividades de Financiamiento', valor: datos.totales.financiamiento, color: 'text-orange-600' },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500 mb-1">{k.label}</p>
              <p className={`text-lg font-bold ${k.valor < 0 ? 'text-red-600' : k.color}`}>
                C$ {fmtC(k.valor)}
              </p>
            </div>
          ))}
        </div>

        {/* Estado formal */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="text-center py-5 bg-gray-50 border-b border-gray-100">
            <h2 className="font-bold text-gray-900 text-lg uppercase">{datos.empresa.nombre}</h2>
            <p className="text-sm text-gray-500">RUC: {datos.empresa.ruc}</p>
            <h3 className="font-bold text-gray-800 mt-3 uppercase">Estado de Flujo de Efectivo</h3>
            <p className="text-sm text-gray-600">Del {formatFecha(fechaInicio)} al {formatFecha(fechaFin)}</p>
            <p className="text-xs text-gray-500">(Método Indirecto — Expresado en Córdobas C$)</p>
          </div>

          <div className="divide-y divide-gray-100">
            {datos.secciones.map((sec, si) => (
              <div key={si}>
                {/* Encabezado de sección */}
                <div className={`${COLORES_SECCION[si]} px-6 py-2.5`}>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-white">{sec.titulo}</span>
                    <span className="text-xs text-white/70">{sec.referencia}</span>
                  </div>
                </div>

                {/* Items */}
                {sec.items.map((item, ii) => {
                  if (item.esEncabezado) return (
                    <div key={ii} className="px-6 py-1.5 bg-gray-50">
                      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{item.descripcion}</span>
                    </div>
                  )
                  return (
                    <div key={ii} className="flex justify-between px-6 py-2 hover:bg-gray-50 border-b border-gray-50">
                      <span className={`text-sm text-gray-600 ${item.ajuste ? 'pl-4' : ''}`}>{item.descripcion}</span>
                      {item.valor !== null && (
                        <span className={`text-sm font-mono ${item.valor < 0 ? 'text-red-600' : 'text-gray-700'} min-w-[120px] text-right`}>
                          {fmtC(item.valor)}
                        </span>
                      )}
                    </div>
                  )
                })}

                {/* Subtotal de sección */}
                <div className="flex justify-between px-6 py-3 bg-gray-100 border-y border-gray-200">
                  <span className="text-sm font-bold text-gray-800">{sec.subtotalLabel}</span>
                  <span className={`text-sm font-bold font-mono min-w-[120px] text-right ${sec.subtotal < 0 ? 'text-red-700' : 'text-gray-900'}`}>
                    C$ {fmtC(sec.subtotal)}
                  </span>
                </div>
              </div>
            ))}

            {/* Resumen final */}
            <div className="p-6 bg-slate-50 space-y-2">
              <div className="flex justify-between text-sm font-semibold text-gray-700 border-t border-gray-300 pt-3">
                <span>AUMENTO / (DISMINUCIÓN) NETA EN EFECTIVO</span>
                <span className={`font-mono ${datos.totales.variacion_neta < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                  C$ {fmtC(datos.totales.variacion_neta)}
                </span>
              </div>
              <div className="flex justify-between text-sm text-gray-600">
                <span>Efectivo al inicio del período</span>
                <span className="font-mono">C$ {fmtC(datos.totales.efectivo_inicio)}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-gray-900 border-t-2 border-gray-400 pt-2">
                <span>EFECTIVO AL FINAL DEL PERÍODO</span>
                <span className="font-mono">C$ {fmtC(datos.totales.efectivo_fin)}</span>
              </div>
              {datos.conciliado && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-600 mt-2">
                  <CheckCircle size={12} />
                  El saldo de efectivo concilia con el Balance General
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

import { Suspense } from 'react'

export default function FlujoEfectivoPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500 text-sm">Cargando...</p>
      </div>
    }>
      <FlujoEfectivoPageContent />
    </Suspense>
  )
}
