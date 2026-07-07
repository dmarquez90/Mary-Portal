'use client'
// src/app/dashboard/estados-financieros/balance-general/page.tsx
// SARA - Balance General (Estado de Situación Financiera)
// NIIF PYMES Sección 4 | LCT Nicaragua

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { Scale, Printer, Save, AlertCircle, CheckCircle, RefreshCw } from 'lucide-react'

interface FilaBG {
  codigo: string
  descripcion: string
  valor: number
  valorAnterior?: number
  esSubtotal: boolean
  esTotal: boolean
  nivel: number
}

interface DatosBG {
  empresa: { nombre: string; ruc: string }
  fecha_corte: string
  activos: FilaBG[]
  pasivos: FilaBG[]
  patrimonio: FilaBG[]
  totales: {
    total_activos: number
    total_pasivos: number
    total_patrimonio: number
    diferencia_cuadre: number
  }
  cuadrado: boolean
  alerta_cuadre?: string
  metadatos: any
}

function formatC(valor: number) {
  if (valor === 0) return <span className="text-gray-300">—</span>
  const abs = Math.abs(valor)
  const f = abs.toLocaleString('es-NI', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const texto = valor < 0 ? `(${f})` : f
  return <span className={valor < 0 ? 'text-red-600' : ''}>{texto}</span>
}

function SeccionBalance({
  titulo,
  filas,
  colorHeader,
}: {
  titulo: string
  filas: FilaBG[]
  colorHeader: string
}) {
  return (
    <div>
      <div className={`${colorHeader} px-6 py-2.5`}>
        <h3 className="text-sm font-bold text-white uppercase tracking-wide">{titulo}</h3>
      </div>
      {filas.map((fila, idx) => {
        const bg = fila.esTotal
          ? 'bg-slate-100 border-y-2 border-slate-300'
          : fila.esSubtotal
            ? 'bg-gray-50 border-t border-gray-200'
            : ''
        const indent = fila.nivel > 0 ? 'pl-10' : 'pl-6'
        const weight = fila.esTotal || fila.esSubtotal ? 'font-semibold' : ''

        return (
          <div
            key={idx}
            className={`flex justify-between items-center ${bg} px-6 py-2 hover:bg-gray-50 transition-colors border-b border-gray-100`}
          >
            <span className={`${indent} text-sm ${weight} ${fila.esTotal ? 'text-slate-800' : fila.esSubtotal ? 'text-gray-700' : 'text-gray-600'}`}>
              {fila.descripcion}
            </span>
            <span className={`text-sm font-mono ${weight} min-w-[140px] text-right`}>
              {fila.valor !== 0 ? formatC(fila.valor) : <span className="text-gray-200">—</span>}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function BalanceGeneralPageContent() {
  const searchParams = useSearchParams()
  const [datos, setDatos] = useState<DatosBG | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const fechaCorte = searchParams.get('fecha_fin') || new Date().toISOString().split('T')[0]
  const empresaId = searchParams.get('empresa_id') || ''

  const cargar = useCallback(async () => {
    setCargando(true)
    setError('')
    try {
      const params = new URLSearchParams({ empresa_id: empresaId, fecha_corte: fechaCorte })
      const res = await fetch(`/api/estados-financieros/balance-general?${params}`)
      if (!res.ok) throw new Error()
      setDatos(await res.json())
    } catch {
      setError('Error al cargar el Balance General.')
    } finally {
      setCargando(false)
    }
  }, [empresaId, fechaCorte])

  useEffect(() => { cargar() }, [cargar])

  const guardar = async () => {
    setGuardando(true)
    try {
      await fetch('/api/estados-financieros/balance-general', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ empresa_id: empresaId, fecha_corte: fechaCorte }),
      })
      alert('Balance General guardado')
    } catch { alert('Error al guardar') } finally { setGuardando(false) }
  }

  const imprimir = () => {
    if (!datos) return
    const w = window.open('', '_blank')
    if (!w) return
    const montoStr = (v: number) => {
      if (v === 0) return '-'
      const abs = Math.abs(v).toLocaleString('es-NI', { minimumFractionDigits: 2 })
      return v < 0 ? `(${abs})` : abs
    }
    const filaHtml = (f: FilaBG) => `
      <tr class="${f.esTotal ? 'total' : f.esSubtotal ? 'subtotal' : ''}">
        <td class="${f.nivel > 0 ? 'indent' : ''}">${f.descripcion}</td>
        <td class="monto">${montoStr(f.valor)}</td>
      </tr>`

    w.document.write(`
      <!DOCTYPE html><html><head>
      <title>Balance General - ${datos.empresa.nombre}</title>
      <style>
        body{font-family:Arial,sans-serif;font-size:11px;margin:20px}
        h1,h2,h3{text-align:center;margin:2px 0}
        h1{font-size:14px} h2{font-size:12px;font-weight:normal}
        .col{width:48%;vertical-align:top;display:inline-block}
        table{width:100%;border-collapse:collapse;margin-top:8px}
        td{padding:2px 6px}
        .monto{text-align:right;font-family:monospace}
        .subtotal{font-weight:600;background:#f0f0f0;border-top:1px solid #ccc}
        .total{font-weight:700;background:#dbeafe;border-top:2px solid #1d4ed8;border-bottom:2px solid #1d4ed8}
        .indent{padding-left:18px}
        .section-header{background:#1e3a5f;color:white;padding:4px 8px;font-weight:700;margin-top:10px}
        .cuadre{text-align:center;margin-top:12px;font-size:10px;color:green}
        @page{margin:15mm}
      </style></head><body>
      <h1>${datos.empresa.nombre}</h1>
      <h2>RUC: ${datos.empresa.ruc}</h2>
      <h2 style="font-weight:700;margin-top:10px">BALANCE GENERAL</h2>
      <h3>Al ${new Date(datos.fecha_corte + 'T12:00:00').toLocaleDateString('es-NI', { day:'2-digit', month:'long', year:'numeric' })}</h3>
      <h3 style="color:#666">(Expresado en Córdobas C$)</h3>
      <div class="col">
        <div class="section-header">ACTIVOS</div>
        <table><tbody>${datos.activos.map(filaHtml).join('')}</tbody></table>
      </div>
      <div class="col" style="margin-left:4%">
        <div class="section-header">PASIVOS</div>
        <table><tbody>${datos.pasivos.map(filaHtml).join('')}</tbody></table>
        <div class="section-header" style="margin-top:16px">PATRIMONIO NETO</div>
        <table><tbody>${datos.patrimonio.map(filaHtml).join('')}</tbody></table>
      </div>
      <p class="cuadre">${datos.cuadrado ? '✓ Balance cuadrado correctamente' : '⚠ ' + datos.alerta_cuadre}</p>
      <p style="font-size:9px;color:#999;text-align:center;margin-top:12px">NIIF PYMES Sección 4 · LCT Art. 103-110 · Generado por SARA</p>
      </body></html>`)
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
        <p className="text-gray-500 text-sm">Calculando Balance General...</p>
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

  const pct = (v: number, t: number) => t !== 0 ? (v / t * 100).toFixed(1) + '%' : '—'

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 print:hidden">
        <div className="max-w-6xl mx-auto flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-blue-50 rounded-lg p-2.5">
              <Scale className="text-blue-600" size={22} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Balance General</h1>
              <p className="text-xs text-gray-500">Al {formatFecha(fechaCorte)} · NIIF PYMES § 4</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {datos.cuadrado ? (
              <span className="flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                <CheckCircle size={12} /> Balance cuadrado
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-red-700 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full">
                <AlertCircle size={12} /> {datos.alerta_cuadre}
              </span>
            )}
            <button onClick={guardar} disabled={guardando}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50">
              <Save size={15} />{guardando ? 'Guardando...' : 'Guardar'}
            </button>
            <button onClick={imprimir}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 flex items-center gap-2">
              <Printer size={15} />Imprimir
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* KPIs */}
        <div className="grid grid-cols-3 gap-4 mb-6 print:hidden">
          {[
            { label: 'Total Activos', valor: datos.totales.total_activos, color: 'text-gray-900', bg: 'bg-white' },
            { label: 'Total Pasivos', valor: datos.totales.total_pasivos, color: 'text-red-600', bg: 'bg-white', sub: `${pct(datos.totales.total_pasivos, datos.totales.total_activos)} del activo` },
            { label: 'Patrimonio Neto', valor: datos.totales.total_patrimonio, color: 'text-blue-700', bg: 'bg-blue-50', sub: `${pct(datos.totales.total_patrimonio, datos.totales.total_activos)} del activo` },
          ].map(k => (
            <div key={k.label} className={`${k.bg} rounded-xl border border-gray-200 p-4`}>
              <p className="text-xs text-gray-500 mb-1">{k.label}</p>
              <p className={`text-xl font-bold ${k.color}`}>
                C$ {Math.abs(k.valor).toLocaleString('es-NI', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </p>
              {k.sub && <p className="text-xs text-gray-400 mt-1">{k.sub}</p>}
            </div>
          ))}
        </div>

        {/* Balance en dos columnas */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ACTIVOS */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="text-center py-4 border-b border-gray-100 bg-gray-50">
              <p className="text-xs text-gray-500">{datos.empresa.nombre} · RUC {datos.empresa.ruc}</p>
              <h2 className="font-bold text-gray-900 uppercase">ACTIVOS</h2>
              <p className="text-xs text-gray-500">Al {formatFecha(fechaCorte)}</p>
            </div>
            <SeccionBalance titulo="ACTIVOS" filas={datos.activos} colorHeader="bg-slate-700" />
          </div>

          {/* PASIVOS + PATRIMONIO */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="text-center py-4 border-b border-gray-100 bg-gray-50">
              <p className="text-xs text-gray-500">{datos.empresa.nombre} · RUC {datos.empresa.ruc}</p>
              <h2 className="font-bold text-gray-900 uppercase">PASIVOS Y PATRIMONIO</h2>
              <p className="text-xs text-gray-500">Al {formatFecha(fechaCorte)}</p>
            </div>
            <SeccionBalance titulo="PASIVOS" filas={datos.pasivos} colorHeader="bg-red-700" />
            <div className="border-t-2 border-gray-200 mt-2">
              <SeccionBalance titulo="PATRIMONIO NETO" filas={datos.patrimonio} colorHeader="bg-blue-700" />
            </div>
          </div>
        </div>

        {/* Nota impuestos */}
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <p className="text-xs text-amber-800">
            <strong>Nota fiscal:</strong> IVA por Pagar (Art. 104 LCT), Retenciones IR (Art. 44 Reglamento LCT),
            INSS Patronal 22.5% + Laboral 7% (Ley 539), INATEC 2%. Las prestaciones sociales incluyen
            indemnización, vacaciones y décimo tercer mes según Código del Trabajo.
          </p>
        </div>
      </div>
    </div>
  )
}

import { Suspense } from 'react'

export default function BalanceGeneralPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500 text-sm">Cargando...</p>
      </div>
    }>
      <BalanceGeneralPageContent />
    </Suspense>
  )
}
