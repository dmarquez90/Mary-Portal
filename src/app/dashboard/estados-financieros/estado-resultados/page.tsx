'use client'
// src/app/dashboard/estados-financieros/estado-resultados/page.tsx
// SARA - Estado de Resultados (Pérdidas y Ganancias)
// NIIF PYMES Sección 5 | LCT Art. 43-54

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { TrendingUp, Download, Printer, Save, AlertCircle, RefreshCw } from 'lucide-react'

interface FilaER {
  codigo: string
  descripcion: string
  valor: number
  valorAnterior?: number
  esSubtotal: boolean
  esTotal: boolean
  nivel: number
}

interface DatosER {
  empresa: { nombre: string; ruc: string }
  periodo: { inicio: string; fin: string }
  periodoAnterior?: { inicio: string; fin: string }
  filas: FilaER[]
  totales: {
    ventas_netas: number
    utilidad_bruta: number
    utilidad_operativa: number
    utilidad_antes_ir: number
    utilidad_neta: number
  }
  metadatos: { moneda: string; norma: string; referencia_fiscal: string }
}

function formatC(valor: number): string {
  if (valor === 0) return '-'
  const abs = Math.abs(valor)
  const f = abs.toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return valor < 0 ? `(${f})` : f
}

function ColorValor({ valor, esTotal }: { valor: number; esTotal: boolean }) {
  if (valor === 0) return <span className="text-gray-400">-</span>
  const negativo = valor < 0
  return (
    <span className={`${negativo ? 'text-red-600' : esTotal ? 'text-gray-900' : 'text-gray-700'} ${esTotal ? 'font-bold' : ''}`}>
      {formatC(valor)}
    </span>
  )
}

function EstadoResultadosPageContent() {
  const searchParams = useSearchParams()
  const [datos, setDatos] = useState<DatosER | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [comparativo, setComparativo] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const fechaInicio = searchParams.get('fecha_inicio') || '2024-01-01'
  const fechaFin = searchParams.get('fecha_fin') || '2024-12-31'
  const empresaId = searchParams.get('empresa_id') || ''

  const cargar = useCallback(async () => {
    setCargando(true)
    setError('')
    try {
      const params = new URLSearchParams({
        empresa_id: empresaId,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        comparativo: comparativo.toString(),
      })
      const res = await fetch(`/api/estados-financieros/estado-resultados?${params}`)
      if (!res.ok) throw new Error('Error al cargar datos')
      const json = await res.json()
      setDatos(json)
    } catch (e) {
      setError('No se pudo cargar el Estado de Resultados. Verifique que existan asientos contables.')
    } finally {
      setCargando(false)
    }
  }, [empresaId, fechaInicio, fechaFin, comparativo])

  useEffect(() => { cargar() }, [cargar])

  const guardar = async () => {
    setGuardando(true)
    try {
      await fetch('/api/estados-financieros/estado-resultados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresa_id: empresaId, fecha_inicio: fechaInicio, fecha_fin: fechaFin }),
      })
      alert('Estado de Resultados guardado correctamente')
    } catch {
      alert('Error al guardar')
    } finally {
      setGuardando(false)
    }
  }

  const imprimir = () => {
    const w = window.open('', '_blank')
    if (!w || !datos) return
    w.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Estado de Resultados - ${datos.empresa.nombre}</title>
        <style>
          body { font-family: Arial, sans-serif; font-size: 11px; margin: 20px; color: #1a1a1a; }
          h1 { font-size: 14px; text-align: center; margin: 0; }
          h2 { font-size: 12px; text-align: center; font-weight: normal; margin: 4px 0; }
          h3 { font-size: 11px; text-align: center; font-weight: normal; color: #555; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          td { padding: 3px 8px; }
          td:last-child { text-align: right; font-family: monospace; }
          .subtotal { font-weight: 600; background: #f5f5f5; border-top: 1px solid #ccc; }
          .total { font-weight: 700; background: #e8f0fe; border-top: 2px solid #1a56db; border-bottom: 2px solid #1a56db; }
          .negativo { color: #dc2626; }
          .indent-1 { padding-left: 20px; }
          .norma { font-size: 9px; color: #888; text-align: center; margin-top: 24px; }
          @page { margin: 15mm; }
        </style>
      </head>
      <body>
        <h1>${datos.empresa.nombre}</h1>
        <h2>RUC: ${datos.empresa.ruc}</h2>
        <h2 style="font-weight:700; margin-top:12px;">ESTADO DE RESULTADOS</h2>
        <h3>Del ${datos.periodo.inicio} al ${datos.periodo.fin}</h3>
        <h3>(Expresado en Córdobas C$)</h3>
        <table>
          <thead>
            <tr style="border-bottom: 2px solid #000; font-weight: 700;">
              <td>CONCEPTO</td>
              <td style="text-align:right;">PERÍODO ACTUAL</td>
              ${datos.periodoAnterior ? '<td style="text-align:right;">PERÍODO ANTERIOR</td>' : ''}
            </tr>
          </thead>
          <tbody>
            ${datos.filas.map(f => `
              <tr class="${f.esTotal ? 'total' : f.esSubtotal ? 'subtotal' : ''}">
                <td class="${f.nivel > 0 ? 'indent-1' : ''}">${f.descripcion}</td>
                <td class="${f.valor < 0 ? 'negativo' : ''}">${f.valor !== 0 ? formatC(f.valor) : '-'}</td>
                ${datos.periodoAnterior ? `<td>${f.valorAnterior !== undefined && f.valorAnterior !== 0 ? formatC(f.valorAnterior) : '-'}</td>` : ''}
              </tr>
            `).join('')}
          </tbody>
        </table>
        <p class="norma">NIIF PYMES Sección 5 · LCT Art. 43-54 · Formulario DGI 106 · Generado por SARA</p>
      </body>
      </html>
    `)
    w.document.close()
    w.print()
  }

  const formatFecha = (f: string) => new Date(f + 'T12:00:00').toLocaleDateString('es-NI', {
    day: '2-digit', month: 'long', year: 'numeric'
  })

  if (cargando) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <RefreshCw className="animate-spin text-blue-500 mx-auto mb-3" size={32} />
        <p className="text-gray-500 text-sm">Calculando Estado de Resultados...</p>
      </div>
    </div>
  )

  if (error) return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex items-start gap-3">
        <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={20} />
        <div>
          <p className="font-medium text-red-800">{error}</p>
          <button onClick={cargar} className="mt-2 text-sm text-red-600 underline">Reintentar</button>
        </div>
      </div>
    </div>
  )

  if (!datos) return null

  const { utilidad_neta, ventas_netas, utilidad_bruta } = datos.totales
  const margenNeto = ventas_netas !== 0 ? (utilidad_neta / ventas_netas * 100) : 0
  const margenBruto = ventas_netas !== 0 ? (utilidad_bruta / ventas_netas * 100) : 0

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 print:hidden">
        <div className="max-w-5xl mx-auto flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-50 rounded-lg p-2.5">
              <TrendingUp className="text-emerald-600" size={22} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Estado de Resultados</h1>
              <p className="text-xs text-gray-500">
                {formatFecha(fechaInicio)} — {formatFecha(fechaFin)} · NIIF PYMES § 5 · LCT Art. 43-54
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={comparativo}
                onChange={e => setComparativo(e.target.checked)}
                className="rounded"
              />
              Comparativo año anterior
            </label>
            <button
              onClick={guardar}
              disabled={guardando}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50"
            >
              <Save size={15} />
              {guardando ? 'Guardando...' : 'Guardar'}
            </button>
            <button
              onClick={imprimir}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-2"
            >
              <Printer size={15} />
              Imprimir
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 print:hidden">
          {[
            { label: 'Ventas Netas', valor: ventas_netas, color: 'text-gray-900' },
            { label: 'Utilidad Bruta', valor: utilidad_bruta, color: utilidad_bruta >= 0 ? 'text-emerald-600' : 'text-red-600' },
            { label: 'Margen Bruto', valor: margenBruto, color: margenBruto >= 0 ? 'text-blue-600' : 'text-red-600', esPct: true },
            { label: 'Utilidad Neta', valor: utilidad_neta, color: utilidad_neta >= 0 ? 'text-emerald-600' : 'text-red-600', destacado: true },
          ].map(kpi => (
            <div key={kpi.label} className={`bg-white rounded-xl border p-4 ${kpi.destacado ? 'border-emerald-200 shadow-sm' : 'border-gray-200'}`}>
              <p className="text-xs text-gray-500 mb-1">{kpi.label}</p>
              <p className={`text-xl font-bold ${kpi.color}`}>
                {kpi.esPct ? `${kpi.valor.toFixed(1)}%` : `C$ ${Math.abs(kpi.valor).toLocaleString('es-NI', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
              </p>
              {kpi.destacado && (
                <p className="text-xs text-gray-400 mt-1">Margen: {margenNeto.toFixed(1)}%</p>
              )}
            </div>
          ))}
        </div>

        {/* Estado de Resultados - Tabla formal */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Encabezado formal */}
          <div className="text-center py-6 border-b border-gray-100 bg-gray-50">
            <h2 className="text-lg font-bold text-gray-900 uppercase">{datos.empresa.nombre}</h2>
            <p className="text-sm text-gray-500">RUC: {datos.empresa.ruc}</p>
            <h3 className="text-base font-bold text-gray-800 mt-3 uppercase tracking-wide">
              Estado de Resultados
            </h3>
            <p className="text-sm text-gray-600">
              Del {formatFecha(fechaInicio)} al {formatFecha(fechaFin)}
            </p>
            <p className="text-xs text-gray-500">(Expresado en Córdobas C$)</p>
          </div>

          {/* Tabla */}
          <table className="w-full">
            <thead>
              <tr className="bg-gray-100 border-b border-gray-200">
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide w-12">
                  Cód.
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  Concepto
                </th>
                <th className="text-right px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  {fechaFin.substring(0, 4)}
                </th>
                {datos.periodoAnterior && (
                  <th className="text-right px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">
                    {datos.periodoAnterior.fin.substring(0, 4)}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {datos.filas.map((fila, idx) => {
                const bg = fila.esTotal
                  ? 'bg-blue-50 border-y-2 border-blue-200'
                  : fila.esSubtotal
                    ? 'bg-gray-50 border-y border-gray-200'
                    : 'hover:bg-gray-50'
                const textWeight = fila.esTotal || fila.esSubtotal ? 'font-semibold' : ''
                const indent = fila.nivel > 0 ? `pl-${8 + fila.nivel * 6}` : 'pl-4'

                return (
                  <tr key={idx} className={`${bg} transition-colors`}>
                    <td className="px-6 py-2.5 text-xs text-gray-400 font-mono">{fila.codigo}</td>
                    <td className={`${indent} py-2.5 text-sm ${textWeight} ${fila.esTotal ? 'text-blue-900' : fila.esSubtotal ? 'text-gray-700' : 'text-gray-600'}`}>
                      {fila.descripcion}
                    </td>
                    <td className={`px-6 py-2.5 text-right text-sm font-mono ${textWeight} ${fila.valor < 0 ? 'text-red-600' : fila.esTotal ? 'text-blue-900' : 'text-gray-700'}`}>
                      {fila.valor !== 0 ? formatC(fila.valor) : <span className="text-gray-300">—</span>}
                    </td>
                    {datos.periodoAnterior && (
                      <td className={`px-6 py-2.5 text-right text-sm font-mono ${(fila.valorAnterior ?? 0) < 0 ? 'text-red-500' : 'text-gray-500'}`}>
                        {fila.valorAnterior !== undefined && fila.valorAnterior !== 0
                          ? formatC(fila.valorAnterior)
                          : <span className="text-gray-200">—</span>}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Pie */}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
            <p className="text-xs text-gray-400">
              {datos.metadatos.norma} · {datos.metadatos.referencia_fiscal} · Generado por SARA el {new Date().toLocaleDateString('es-NI')}
            </p>
          </div>
        </div>

        {/* Alerta IR */}
        {utilidad_neta > 0 && (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-2">
            <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              <strong>IR estimado (Art. 52 LCT):</strong> Persona Jurídica: C$ {(utilidad_neta * 0.30).toLocaleString('es-NI', { minimumFractionDigits: 2 })} (30% sobre renta neta gravable).
              Verificar deducciones permitidas antes de declarar en Formulario 106.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

import { Suspense } from 'react'

export default function EstadoResultadosPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500 text-sm">Cargando...</p>
      </div>
    }>
      <EstadoResultadosPageContent />
    </Suspense>
  )
}
