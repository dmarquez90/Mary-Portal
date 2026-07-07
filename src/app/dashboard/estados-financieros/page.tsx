'use client'
// src/app/dashboard/estados-financieros/page.tsx
// SARA - Hub de Estados Financieros
// Módulo 3 - Fase 3

import { useState } from 'react'
import Link from 'next/link'
import {
  BarChart3, TrendingUp, Scale, ArrowLeftRight, FileText,
  Calendar, ChevronRight, BookOpen
} from 'lucide-react'

const ESTADOS = [
  {
    id: 'estado-resultados',
    titulo: 'Estado de Resultados',
    subtitulo: 'Pérdidas y Ganancias',
    descripcion: 'Ingresos, costos y gastos del período. Base para IR Anual (Formulario 106).',
    norma: 'NIIF PYMES § 5 | LCT Art. 43-54',
    icono: TrendingUp,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    borde: 'border-emerald-200',
    href: '/dashboard/estados-financieros/estado-resultados',
  },
  {
    id: 'balance-general',
    titulo: 'Balance General',
    subtitulo: 'Situación Financiera',
    descripcion: 'Activos, pasivos y patrimonio al cierre del período. Refleja IVA, IR y INSS por pagar.',
    norma: 'NIIF PYMES § 4 | LCT Art. 103-110',
    icono: Scale,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    borde: 'border-blue-200',
    href: '/dashboard/estados-financieros/balance-general',
  },
  {
    id: 'flujo-efectivo',
    titulo: 'Flujo de Efectivo',
    subtitulo: 'Método Indirecto',
    descripcion: 'Movimiento de efectivo en actividades operativas, de inversión y financiamiento.',
    norma: 'NIIF PYMES § 7',
    icono: ArrowLeftRight,
    color: 'text-purple-600',
    bg: 'bg-purple-50',
    borde: 'border-purple-200',
    href: '/dashboard/estados-financieros/flujo-efectivo',
  },
  {
    id: 'cambios-patrimonio',
    titulo: 'Cambios en el Patrimonio',
    subtitulo: 'Capital y Reservas',
    descripcion: 'Variaciones en capital social, reserva legal (25%) y utilidades retenidas.',
    norma: 'NIIF PYMES § 6 | Código de Comercio',
    icono: BarChart3,
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    borde: 'border-orange-200',
    href: '/dashboard/estados-financieros/cambios-patrimonio',
  },
]

// Períodos rápidos relativos al año en curso (período fiscal calendario,
// art. 50 LCT: 1 de enero al 31 de diciembre)
const ANIO_ACTUAL = new Date().getFullYear()
const PERIODOS_RAPIDOS = [
  { label: `Enero - Diciembre ${ANIO_ACTUAL}`, inicio: `${ANIO_ACTUAL}-01-01`, fin: `${ANIO_ACTUAL}-12-31` },
  { label: `Enero - Junio ${ANIO_ACTUAL}`, inicio: `${ANIO_ACTUAL}-01-01`, fin: `${ANIO_ACTUAL}-06-30` },
  { label: `Julio - Diciembre ${ANIO_ACTUAL}`, inicio: `${ANIO_ACTUAL}-07-01`, fin: `${ANIO_ACTUAL}-12-31` },
  { label: `Enero - Diciembre ${ANIO_ACTUAL - 1}`, inicio: `${ANIO_ACTUAL - 1}-01-01`, fin: `${ANIO_ACTUAL - 1}-12-31` },
]

export default function EstadosFinancierosPage() {
  const [periodoInicio, setPeriodoInicio] = useState(`${ANIO_ACTUAL}-01-01`)
  const [periodoFin, setPeriodoFin] = useState(`${ANIO_ACTUAL}-12-31`)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <BookOpen className="text-blue-600" size={26} />
              Estados Financieros
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              NIIF PYMES · Ley 822 LCT Nicaragua · Período Fiscal
            </p>
          </div>
          <Link
            href="/dashboard/estados-financieros/historial"
            className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
          >
            <FileText size={15} />
            Ver historial
          </Link>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Selector de período */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
          <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <Calendar size={16} className="text-blue-500" />
            Período de Reporte
          </h2>

          {/* Períodos rápidos */}
          <div className="flex flex-wrap gap-2 mb-4">
            {PERIODOS_RAPIDOS.map(p => (
              <button
                key={p.label}
                onClick={() => { setPeriodoInicio(p.inicio); setPeriodoFin(p.fin) }}
                className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                  periodoInicio === p.inicio && periodoFin === p.fin
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Fechas personalizadas */}
          <div className="flex gap-4 items-center">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Fecha inicio</label>
              <input
                type="date"
                value={periodoInicio}
                onChange={e => setPeriodoInicio(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Fecha fin</label>
              <input
                type="date"
                value={periodoFin}
                onChange={e => setPeriodoFin(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Grid de estados financieros */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {ESTADOS.map(estado => {
            const Icono = estado.icono
            const params = new URLSearchParams({
              fecha_inicio: periodoInicio,
              fecha_fin: periodoFin,
            })
            return (
              <Link
                key={estado.id}
                href={`${estado.href}?${params}`}
                className={`bg-white rounded-xl border ${estado.borde} p-6 hover:shadow-md transition-all group`}
              >
                <div className="flex items-start justify-between">
                  <div className={`${estado.bg} rounded-lg p-3 mb-4`}>
                    <Icono className={estado.color} size={24} />
                  </div>
                  <ChevronRight
                    size={18}
                    className="text-gray-400 group-hover:text-gray-700 transition-colors mt-1"
                  />
                </div>

                <h3 className="font-semibold text-gray-900 text-lg">{estado.titulo}</h3>
                <p className="text-sm text-gray-500 mb-2">{estado.subtitulo}</p>
                <p className="text-sm text-gray-600 mb-4">{estado.descripcion}</p>

                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${estado.bg} ${estado.color}`}>
                    {estado.norma}
                  </span>
                </div>
              </Link>
            )
          })}
        </div>

        {/* Nota legal */}
        <div className="mt-8 bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-xs text-amber-800">
            <strong>Base Legal:</strong> Estados financieros elaborados conforme a NIIF PYMES adoptadas en Nicaragua,
            Ley 822 (Ley de Concertación Tributaria), Ley 539 (INSS), Código de Comercio y disposiciones de la DGI.
            El período fiscal en Nicaragua es del 1 de enero al 31 de diciembre (art. 52 Reglamento LCT).
          </p>
        </div>
      </div>
    </div>
  )
}
