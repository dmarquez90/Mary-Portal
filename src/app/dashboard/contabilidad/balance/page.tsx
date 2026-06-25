'use client'
// src/app/dashboard/contabilidad/balance/page.tsx
import { useEffect, useState } from 'react'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const TIPO_LABELS: Record<string, string> = {
  activo: 'Activo', pasivo: 'Pasivo', patrimonio: 'Patrimonio',
  ingreso: 'Ingreso', costo: 'Costo', gasto: 'Gasto',
}
const TIPO_COLORS: Record<string, string> = {
  activo: 'bg-blue-50 text-blue-700 border-blue-100',
  pasivo: 'bg-red-50 text-red-700 border-red-100',
  patrimonio: 'bg-purple-50 text-purple-700 border-purple-100',
  ingreso: 'bg-green-50 text-green-700 border-green-100',
  costo: 'bg-orange-50 text-orange-700 border-orange-100',
  gasto: 'bg-gray-50 text-gray-600 border-gray-200',
}

type CuentaBalance = {
  cuenta_id: string
  codigo_cuenta: string
  nombre: string
  tipo: string
  naturaleza: string
  nivel: number
  total_debe: number
  total_haber: number
  saldo_deudor: number
  saldo_acreedor: number
}

export default function BalanceComprobacionPage() {
  const anioActual = new Date().getFullYear()
  const [anio, setAnio] = useState(anioActual)
  const [mes, setMes] = useState<number | null>(null) // null = todo el año
  const [loading, setLoading] = useState(false)
  const [cuentas, setCuentas] = useState<CuentaBalance[]>([])
  const [totales, setTotales] = useState<{ debe: number; haber: number; cuadrado: boolean } | null>(null)
  const [filtroTipo, setFiltroTipo] = useState('')
  const [soloConMovimiento, setSoloConMovimiento] = useState(true)

  useEffect(() => { cargarBalance() }, [anio, mes])

  async function cargarBalance() {
    setLoading(true)
    const params = new URLSearchParams({ tipo: 'balance', anio: String(anio) })
    if (mes) params.set('mes', String(mes))
    const res = await fetch(`/api/mayor?${params}`)
    const dat = await res.json()
    setCuentas(dat.cuentas || [])
    setTotales(dat.totales || null)
    setLoading(false)
  }

  function exportarCSV() {
    const filas = [
      ['Código', 'Nombre', 'Tipo', 'Total Debe', 'Total Haber', 'Saldo Deudor', 'Saldo Acreedor'],
      ...cuentasFiltradas.map(c => [
        c.codigo_cuenta, c.nombre, TIPO_LABELS[c.tipo] || c.tipo,
        c.total_debe.toFixed(2), c.total_haber.toFixed(2),
        c.saldo_deudor.toFixed(2), c.saldo_acreedor.toFixed(2),
      ]),
      ['', '', 'TOTALES', totales?.debe.toFixed(2), totales?.haber.toFixed(2), '', ''],
    ]
    const csv = filas.map(f => f.join(',')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `balance-comprobacion-${anio}${mes ? '-' + mes : ''}.csv`
    a.click()
  }

  const cuentasFiltradas = cuentas.filter(c => {
    const matchTipo = !filtroTipo || c.tipo === filtroTipo
    const matchMov = !soloConMovimiento || c.total_debe > 0 || c.total_haber > 0
    return matchTipo && matchMov
  })

  const fmt = (n: number) => new Intl.NumberFormat('es-NI', { minimumFractionDigits: 2 }).format(n)

  // Agrupar por tipo para vista visual
  const porTipo = Object.keys(TIPO_LABELS).map(tipo => ({
    tipo,
    cuentas: cuentasFiltradas.filter(c => c.tipo === tipo),
  })).filter(g => g.cuentas.length > 0)

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Balance de Comprobación</h1>
          <p className="text-sm text-gray-500">
            Verificación de partida doble · Suma de Débitos = Suma de Créditos
          </p>
        </div>
        <button
          onClick={exportarCSV}
          disabled={cuentasFiltradas.length === 0}
          className="flex items-center gap-2 border border-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-40"
        >
          ↓ Exportar CSV
        </button>
      </div>

      {/* Indicador de cuadre */}
      {totales && (
        <div className={`rounded-xl border px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          totales.cuadrado
            ? 'bg-green-50 border-green-200'
            : 'bg-red-50 border-red-200'
        }`}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">{totales.cuadrado ? '✅' : '❌'}</span>
            <div>
              <p className={`font-semibold ${totales.cuadrado ? 'text-green-800' : 'text-red-800'}`}>
                {totales.cuadrado ? 'Contabilidad cuadrada — Partida doble correcta' : 'Error: Los totales no cuadran'}
              </p>
              <p className="text-sm text-gray-600">
                Total Débitos: <strong className="font-mono">{fmt(totales.debe)}</strong>
                {' · '}
                Total Créditos: <strong className="font-mono">{fmt(totales.haber)}</strong>
                {!totales.cuadrado && (
                  <span className="text-red-600 ml-2">Diferencia: {fmt(Math.abs(totales.debe - totales.haber))}</span>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Controles */}
      <div className="flex flex-wrap gap-2 items-center">
        <select value={anio} onChange={e => setAnio(parseInt(e.target.value))}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm">
          {[anioActual-1, anioActual, anioActual+1].map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select
          value={mes ?? ''}
          onChange={e => setMes(e.target.value ? parseInt(e.target.value) : null)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
        >
          <option value="">Todo el año</option>
          {MESES.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
        </select>
        <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm">
          <option value="">Todos los tipos</option>
          {Object.entries(TIPO_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={soloConMovimiento}
            onChange={e => setSoloConMovimiento(e.target.checked)}
            className="rounded"
          />
          Solo con movimiento
        </label>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">Cargando balance...</div>
      ) : cuentasFiltradas.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-3xl mb-3">⚖️</p>
          <p>No hay movimientos contabilizados para este período</p>
        </div>
      ) : (
        <>
          {/* Tabla principal */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium uppercase tracking-wider w-24">Código</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium uppercase tracking-wider">Cuenta</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium uppercase tracking-wider w-24">Tipo</th>
                    <th className="text-right px-4 py-3 text-xs text-gray-500 font-medium uppercase tracking-wider w-32">Total Debe</th>
                    <th className="text-right px-4 py-3 text-xs text-gray-500 font-medium uppercase tracking-wider w-32">Total Haber</th>
                    <th className="text-right px-4 py-3 text-xs text-gray-500 font-medium uppercase tracking-wider w-32 bg-yellow-50 text-yellow-700">Saldo Deudor</th>
                    <th className="text-right px-4 py-3 text-xs text-gray-500 font-medium uppercase tracking-wider w-32 bg-yellow-50 text-yellow-700">Saldo Acreedor</th>
                  </tr>
                </thead>
                <tbody>
                  {porTipo.map(({ tipo, cuentas: cuentasTipo }) => (
                    <>
                      {/* Separador por tipo */}
                      <tr key={`sep-${tipo}`} className="border-b border-gray-100">
                        <td colSpan={7} className="px-4 py-1.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${TIPO_COLORS[tipo]}`}>
                            {TIPO_LABELS[tipo] || tipo}
                          </span>
                        </td>
                      </tr>
                      {cuentasTipo.map(c => (
                        <tr key={c.cuenta_id} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="px-4 py-2 font-mono text-xs text-gray-500">{c.codigo_cuenta}</td>
                          <td className="px-4 py-2 text-sm text-gray-800">{c.nombre}</td>
                          <td className="px-4 py-2">
                            <span className={`text-xs px-1.5 py-0.5 rounded border ${TIPO_COLORS[c.tipo]}`}>
                              {TIPO_LABELS[c.tipo]}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-sm text-gray-700">
                            {c.total_debe > 0 ? fmt(c.total_debe) : '—'}
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-sm text-gray-700">
                            {c.total_haber > 0 ? fmt(c.total_haber) : '—'}
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-sm bg-yellow-50/30 text-gray-700">
                            {c.saldo_deudor > 0 ? fmt(c.saldo_deudor) : '—'}
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-sm bg-yellow-50/30 text-gray-700">
                            {c.saldo_acreedor > 0 ? fmt(c.saldo_acreedor) : '—'}
                          </td>
                        </tr>
                      ))}
                      {/* Subtotal por tipo */}
                      <tr key={`total-${tipo}`} className="border-b border-gray-200 bg-gray-50/80">
                        <td colSpan={3} className="px-4 py-2 text-xs font-semibold text-gray-600">
                          Subtotal {TIPO_LABELS[tipo]}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-xs font-bold text-gray-700">
                          {fmt(cuentasTipo.reduce((s, c) => s + c.total_debe, 0))}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-xs font-bold text-gray-700">
                          {fmt(cuentasTipo.reduce((s, c) => s + c.total_haber, 0))}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-xs font-bold text-gray-700 bg-yellow-50/30">
                          {fmt(cuentasTipo.reduce((s, c) => s + c.saldo_deudor, 0))}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-xs font-bold text-gray-700 bg-yellow-50/30">
                          {fmt(cuentasTipo.reduce((s, c) => s + c.saldo_acreedor, 0))}
                        </td>
                      </tr>
                    </>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-900 text-white">
                    <td colSpan={3} className="px-4 py-3 font-bold text-sm">
                      TOTALES GENERALES
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-sm">
                      {fmt(totales?.debe ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-sm">
                      {fmt(totales?.haber ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-sm bg-yellow-900/30">
                      {fmt(cuentasFiltradas.reduce((s, c) => s + c.saldo_deudor, 0))}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-sm bg-yellow-900/30">
                      {fmt(cuentasFiltradas.reduce((s, c) => s + c.saldo_acreedor, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Nota legal */}
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 text-xs text-gray-500">
            <p>⚖️ <strong>Partida doble:</strong> Si la columna "Total Debe" es igual a "Total Haber", la contabilidad está cuadrada y cumple con el principio fundamental de partida doble requerido por el Código Tributario (Ley 562) y las NIIF para PYMES.</p>
            <p className="mt-1">📄 Este reporte es el soporte principal para preparar los <strong>Estados Financieros</strong> y la <strong>Declaración Anual de IR (Formulario 106)</strong> de la DGI.</p>
          </div>
        </>
      )}
    </div>
  )
}
