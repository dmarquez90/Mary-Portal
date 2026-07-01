'use client'
// src/app/dashboard/contabilidad/mayor/page.tsx
import { useEffect, useState } from 'react'
import AlertasSaldoNegativo from '@/components/contabilidad/AlertasSaldoNegativo'

type Cuenta = { id: string; codigo: string; nombre: string; tipo: string }

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const TIPO_COLORS: Record<string, string> = {
  activo: 'text-blue-700', pasivo: 'text-red-600', patrimonio: 'text-purple-700',
  ingreso: 'text-green-700', costo: 'text-orange-600', gasto: 'text-gray-600',
}

export default function LibroMayorPage() {
  const anioActual = new Date().getFullYear()
  const mesActual = new Date().getMonth() + 1

  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [cuentaSeleccionada, setCuentaSeleccionada] = useState<Cuenta | null>(null)
  const [busquedaCuenta, setBusquedaCuenta] = useState('')
  const [anio, setAnio] = useState(anioActual)
  const [mes, setMes] = useState(mesActual)
  const [loading, setLoading] = useState(false)
  const [mayor, setMayor] = useState<any>(null)

  useEffect(() => { cargarCuentas() }, [])
  useEffect(() => {
    if (cuentaSeleccionada) cargarMayor()
  }, [cuentaSeleccionada, anio, mes])

  async function cargarCuentas() {
    const res = await fetch('/api/plan-cuentas?permite_movimiento=true')
    const dat = await res.json()
    setCuentas(dat.cuentas || [])
  }

  async function cargarMayor() {
    if (!cuentaSeleccionada) return
    setLoading(true)
    const res = await fetch(
      `/api/mayor?tipo=mayor&cuenta_id=${cuentaSeleccionada.id}&anio=${anio}&mes=${mes}`
    )
    const dat = await res.json()
    setMayor(dat)
    setLoading(false)
  }

  const cuentasFiltradas = cuentas.filter(c =>
    c.codigo.toLowerCase().includes(busquedaCuenta.toLowerCase()) ||
    c.nombre.toLowerCase().includes(busquedaCuenta.toLowerCase())
  )

  const fmt = (n: number) => new Intl.NumberFormat('es-NI', { minimumFractionDigits: 2 }).format(n)

  // Calcular saldo acumulado por línea
  function calcularMovimientos() {
    if (!mayor?.movimientos) return []
    const cuenta = cuentaSeleccionada
    let saldoAcum = mayor.saldo_inicial_debe - mayor.saldo_inicial_haber

    return mayor.movimientos.map((mov: any) => {
      const asiento = mov.asientos_contables
      saldoAcum += mov.debe - mov.haber
      return {
        fecha: asiento.fecha,
        numero: asiento.numero,
        concepto: asiento.concepto,
        debe: mov.debe,
        haber: mov.haber,
        saldo: saldoAcum,
      }
    })
  }

  const movimientos = calcularMovimientos()
  const saldoInicial = mayor ? (major => major.saldo_inicial_debe - major.saldo_inicial_haber)(mayor) : 0
  const totalDebe = mayor?.movimientos?.reduce((s: number, m: any) => s + m.debe, 0) ?? 0
  const totalHaber = mayor?.movimientos?.reduce((s: number, m: any) => s + m.haber, 0) ?? 0
  const saldoFinal = saldoInicial + totalDebe - totalHaber

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Libro Mayor</h1>
        <p className="text-sm text-gray-500">Movimientos y saldos acumulados por cuenta contable</p>
      </div>

      <div className="mb-6">
        <AlertasSaldoNegativo />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

        {/* Panel izquierdo — lista de cuentas */}
        <div className="lg:col-span-1">
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden sticky top-4">
            <div className="p-3 border-b border-gray-100">
              <input
                type="text"
                placeholder="Buscar cuenta..."
                value={busquedaCuenta}
                onChange={e => setBusquedaCuenta(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
              />
            </div>
            <div className="max-h-96 overflow-y-auto">
              {cuentasFiltradas.map(c => (
                <button
                  key={c.id}
                  onClick={() => setCuentaSeleccionada(c)}
                  className={`w-full text-left px-3 py-2.5 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                    cuentaSeleccionada?.id === c.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''
                  }`}
                >
                  <p className={`text-xs font-mono ${TIPO_COLORS[c.tipo]}`}>{c.codigo}</p>
                  <p className="text-xs text-gray-700 mt-0.5 leading-tight">{c.nombre}</p>
                </button>
              ))}
              {cuentasFiltradas.length === 0 && (
                <p className="text-xs text-gray-400 p-3">No hay cuentas</p>
              )}
            </div>
          </div>
        </div>

        {/* Panel derecho — mayor de la cuenta */}
        <div className="lg:col-span-3 space-y-4">
          {!cuentaSeleccionada ? (
            <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400">
              <p className="text-3xl mb-3">📚</p>
              <p>Selecciona una cuenta del panel izquierdo</p>
            </div>
          ) : (
            <>
              {/* Header cuenta */}
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className={`text-xs font-mono font-bold ${TIPO_COLORS[cuentaSeleccionada.tipo]}`}>
                      {cuentaSeleccionada.codigo}
                    </span>
                    <h2 className="text-lg font-semibold text-gray-900">{cuentaSeleccionada.nombre}</h2>
                  </div>
                  <div className="flex gap-2">
                    <select value={anio} onChange={e => setAnio(parseInt(e.target.value))}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
                      {[anioActual-1, anioActual, anioActual+1].map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                    <select value={mes} onChange={e => setMes(parseInt(e.target.value))}
                      className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm">
                      {MESES.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Tabla del mayor */}
              {loading ? (
                <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-gray-400">Cargando...</div>
              ) : (
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left px-4 py-2.5 text-xs text-gray-500 font-medium uppercase tracking-wider">Fecha</th>
                        <th className="text-left px-4 py-2.5 text-xs text-gray-500 font-medium uppercase tracking-wider">Asiento</th>
                        <th className="text-left px-4 py-2.5 text-xs text-gray-500 font-medium uppercase tracking-wider">Concepto</th>
                        <th className="text-right px-4 py-2.5 text-xs text-gray-500 font-medium uppercase tracking-wider">Debe</th>
                        <th className="text-right px-4 py-2.5 text-xs text-gray-500 font-medium uppercase tracking-wider">Haber</th>
                        <th className="text-right px-4 py-2.5 text-xs text-gray-500 font-medium uppercase tracking-wider">Saldo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Saldo inicial */}
                      <tr className="bg-blue-50 border-b border-blue-100">
                        <td className="px-4 py-2 text-xs text-blue-600" colSpan={3}>
                          Saldo inicial al {MESES[mes-2] || 'inicio'} {anio}
                        </td>
                        <td className="px-4 py-2 text-right text-xs font-mono text-blue-700">
                          {saldoInicial > 0 ? fmt(saldoInicial) : '—'}
                        </td>
                        <td className="px-4 py-2 text-right text-xs font-mono text-blue-700">
                          {saldoInicial < 0 ? fmt(Math.abs(saldoInicial)) : '—'}
                        </td>
                        <td className="px-4 py-2 text-right text-xs font-mono font-bold text-blue-800">
                          {fmt(saldoInicial)}
                        </td>
                      </tr>

                      {movimientos.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">
                            Sin movimientos en {MESES[mes-1]} {anio}
                          </td>
                        </tr>
                      ) : movimientos.map((m: any, idx: number) => (
                        <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="px-4 py-2 text-xs text-gray-500">{m.fecha}</td>
                          <td className="px-4 py-2 text-xs font-mono text-gray-500">{m.numero}</td>
                          <td className="px-4 py-2 text-xs text-gray-700">{m.concepto}</td>
                          <td className="px-4 py-2 text-right font-mono text-xs text-gray-700">
                            {m.debe > 0 ? fmt(m.debe) : '—'}
                          </td>
                          <td className="px-4 py-2 text-right font-mono text-xs text-gray-700">
                            {m.haber > 0 ? fmt(m.haber) : '—'}
                          </td>
                          <td className={`px-4 py-2 text-right font-mono text-xs font-medium ${
                            m.saldo >= 0 ? 'text-gray-800' : 'text-red-600'
                          }`}>
                            {fmt(m.saldo)}
                          </td>
                        </tr>
                      ))}

                      {/* Totales */}
                      <tr className="bg-gray-50 border-t border-gray-200 font-semibold">
                        <td className="px-4 py-2.5 text-xs" colSpan={3}>
                          Totales — {MESES[mes-1]} {anio}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-sm text-gray-800">{fmt(totalDebe)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-sm text-gray-800">{fmt(totalHaber)}</td>
                        <td className={`px-4 py-2.5 text-right font-mono text-sm font-bold ${
                          saldoFinal >= 0 ? 'text-gray-900' : 'text-red-600'
                        }`}>
                          {fmt(saldoFinal)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
