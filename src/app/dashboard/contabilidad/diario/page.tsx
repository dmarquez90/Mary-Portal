'use client'
// src/app/dashboard/contabilidad/diario/page.tsx
import { useEffect, useState, useCallback } from 'react'

type Cuenta = { id: string; codigo: string; nombre: string; tipo: string; naturaleza: string }
type Linea = { cuenta_id: string; codigo_cuenta: string; nombre_cuenta: string; debe: string; haber: string; descripcion: string }
type Asiento = { id: string; numero: string; fecha: string; concepto: string; tipo: string; estado: string; total_debe: number; total_haber: number; referencia_num?: string }

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

const lineaVacia = (): Linea => ({ cuenta_id: '', codigo_cuenta: '', nombre_cuenta: '', debe: '', haber: '', descripcion: '' })

export default function LibroDiarioPage() {
  const anioActual = new Date().getFullYear()
  const mesActual = new Date().getMonth() + 1

  const [asientos, setAsientos] = useState<Asiento[]>([])
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [loading, setLoading] = useState(true)
  const [anio, setAnio] = useState(anioActual)
  const [mes, setMes] = useState(mesActual)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [asientoDetalle, setAsientoDetalle] = useState<any>(null)
  const [busquedaCuenta, setBusquedaCuenta] = useState<Record<number, string>>({})
  const [sugerencias, setSugerencias] = useState<Record<number, Cuenta[]>>({})

  // Formulario nuevo asiento
  const [form, setForm] = useState({
    fecha: new Date().toISOString().split('T')[0],
    concepto: '',
    tipo: 'manual',
    lineas: [lineaVacia(), lineaVacia()],
  })

  useEffect(() => { cargarTodo() }, [anio, mes])

  async function cargarTodo() {
    setLoading(true)
    const [resAsientos, resCuentas] = await Promise.all([
      fetch(`/api/asientos?anio=${anio}&mes=${mes}`),
      fetch('/api/plan-cuentas?permite_movimiento=true'),
    ])
    const datA = await resAsientos.json()
    const datC = await resCuentas.json()
    setAsientos(datA.asientos || [])
    setCuentas(datC.cuentas || [])
    setLoading(false)
  }

  function buscarCuenta(idx: number, texto: string) {
    setBusquedaCuenta(prev => ({ ...prev, [idx]: texto }))
    if (!texto) { setSugerencias(prev => ({ ...prev, [idx]: [] })); return }
    const filtradas = cuentas.filter(c =>
      c.codigo.toLowerCase().includes(texto.toLowerCase()) ||
      c.nombre.toLowerCase().includes(texto.toLowerCase())
    ).slice(0, 8)
    setSugerencias(prev => ({ ...prev, [idx]: filtradas }))
  }

  function seleccionarCuenta(idx: number, cuenta: Cuenta) {
    const nuevasLineas = [...form.lineas]
    nuevasLineas[idx] = {
      ...nuevasLineas[idx],
      cuenta_id: cuenta.id,
      codigo_cuenta: cuenta.codigo,
      nombre_cuenta: cuenta.nombre,
    }
    setForm({ ...form, lineas: nuevasLineas })
    setBusquedaCuenta(prev => ({ ...prev, [idx]: cuenta.codigo + ' — ' + cuenta.nombre }))
    setSugerencias(prev => ({ ...prev, [idx]: [] }))
  }

  function actualizarLinea(idx: number, campo: keyof Linea, valor: string) {
    const nuevasLineas = [...form.lineas]
    if (campo === 'debe' && valor) nuevasLineas[idx].haber = ''
    if (campo === 'haber' && valor) nuevasLineas[idx].debe = ''
    nuevasLineas[idx] = { ...nuevasLineas[idx], [campo]: valor }
    setForm({ ...form, lineas: nuevasLineas })
  }

  function agregarLinea() {
    setForm({ ...form, lineas: [...form.lineas, lineaVacia()] })
  }

  function eliminarLinea(idx: number) {
    if (form.lineas.length <= 2) return
    setForm({ ...form, lineas: form.lineas.filter((_, i) => i !== idx) })
    setBusquedaCuenta(prev => { const n = {...prev}; delete n[idx]; return n })
  }

  const totalDebe = form.lineas.reduce((s, l) => s + (parseFloat(l.debe) || 0), 0)
  const totalHaber = form.lineas.reduce((s, l) => s + (parseFloat(l.haber) || 0), 0)
  const cuadrado = Math.abs(totalDebe - totalHaber) < 0.01 && totalDebe > 0

  async function guardarAsiento(contabilizar: boolean) {
    setError('')
    if (!form.concepto) { setError('Ingresa el concepto del asiento'); return }
    if (!cuadrado) { setError(`El asiento no cuadra. Debe: ${totalDebe.toFixed(2)}, Haber: ${totalHaber.toFixed(2)}`); return }

    const lineasValidas = form.lineas.filter(l => l.cuenta_id && (parseFloat(l.debe) > 0 || parseFloat(l.haber) > 0))
    if (lineasValidas.length < 2) { setError('Se necesitan al menos 2 líneas con cuenta y monto'); return }

    setGuardando(true)
    const res = await fetch('/api/asientos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, lineas: lineasValidas, contabilizar }),
    })
    const dat = await res.json()
    if (!res.ok) { setError(dat.error || 'Error al guardar'); setGuardando(false); return }

    setMostrarForm(false)
    setForm({ fecha: new Date().toISOString().split('T')[0], concepto: '', tipo: 'manual', lineas: [lineaVacia(), lineaVacia()] })
    setBusquedaCuenta({})
    cargarTodo()
    setGuardando(false)
  }

  async function verDetalle(id: string) {
    const res = await fetch(`/api/asientos?id=${id}`)
    const dat = await res.json()
    setAsientoDetalle(dat)
  }

  async function accionAsiento(id: string, action: 'contabilizar' | 'anular') {
    if (!confirm(`¿${action === 'anular' ? 'Anular' : 'Contabilizar'} este asiento?`)) return
    await fetch('/api/asientos', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action }),
    })
    cargarTodo()
    if (asientoDetalle) setAsientoDetalle(null)
  }

  const fmt = (n: number) => new Intl.NumberFormat('es-NI', { minimumFractionDigits: 2 }).format(n)

  const ESTADO_COLORS: Record<string, string> = {
    borrador: 'bg-yellow-100 text-yellow-700',
    contabilizado: 'bg-green-100 text-green-700',
    anulado: 'bg-red-100 text-red-700',
  }

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Libro Diario</h1>
          <p className="text-sm text-gray-500">Asientos de partida doble — Requerido por Código Tributario Ley 562</p>
        </div>
        <button
          onClick={() => setMostrarForm(true)}
          className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 flex items-center gap-1"
        >
          + Nuevo asiento
        </button>
      </div>

      {/* Filtros período */}
      <div className="flex gap-2 flex-wrap">
        <select
          value={anio}
          onChange={e => setAnio(parseInt(e.target.value))}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
        >
          {[anioActual - 1, anioActual, anioActual + 1].map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <div className="flex gap-1 flex-wrap">
          {MESES.map((m, i) => (
            <button
              key={i}
              onClick={() => setMes(i + 1)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                mes === i + 1 ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla de asientos */}
      {loading ? (
        <div className="text-center py-16 text-gray-400">Cargando asientos...</div>
      ) : asientos.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">📝</p>
          <p>No hay asientos en {MESES[mes-1]} {anio}</p>
          <p className="text-sm mt-1">Los asientos automáticos se generan al registrar ventas y compras</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-gray-50 border-b text-xs text-gray-500 font-medium uppercase tracking-wider">
            <div className="col-span-2">Número</div>
            <div className="col-span-2">Fecha</div>
            <div className="col-span-4">Concepto</div>
            <div className="col-span-1 text-right">Debe</div>
            <div className="col-span-1 text-right">Haber</div>
            <div className="col-span-1">Estado</div>
            <div className="col-span-1" />
          </div>
          {asientos.map(a => (
            <div
              key={a.id}
              className="grid grid-cols-12 gap-2 px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer"
              onClick={() => verDetalle(a.id)}
            >
              <div className="col-span-2 font-mono text-xs text-gray-600">{a.numero}</div>
              <div className="col-span-2 text-sm text-gray-600">{a.fecha}</div>
              <div className="col-span-4 text-sm text-gray-800">
                {a.concepto}
                {a.referencia_num && <span className="text-xs text-gray-400 ml-1">· {a.referencia_num}</span>}
              </div>
              <div className="col-span-1 text-right text-sm text-gray-700 font-mono">{fmt(a.total_debe)}</div>
              <div className="col-span-1 text-right text-sm text-gray-700 font-mono">{fmt(a.total_haber)}</div>
              <div className="col-span-1">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ESTADO_COLORS[a.estado]}`}>
                  {a.estado}
                </span>
              </div>
              <div className="col-span-1 flex gap-1 justify-end">
                {a.estado === 'borrador' && (
                  <button
                    onClick={e => { e.stopPropagation(); accionAsiento(a.id, 'contabilizar') }}
                    className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded hover:bg-green-100"
                    title="Contabilizar"
                  >✓</button>
                )}
                {a.estado === 'contabilizado' && (
                  <button
                    onClick={e => { e.stopPropagation(); accionAsiento(a.id, 'anular') }}
                    className="text-xs px-2 py-1 bg-red-50 text-red-700 rounded hover:bg-red-100"
                    title="Anular"
                  >✕</button>
                )}
              </div>
            </div>
          ))}

          {/* Totales del período */}
          <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-gray-50 border-t border-gray-200">
            <div className="col-span-8 text-sm font-semibold text-gray-600">
              Totales del período — {MESES[mes-1]} {anio}
            </div>
            <div className="col-span-1 text-right text-sm font-bold text-gray-800 font-mono">
              {fmt(asientos.filter(a => a.estado !== 'anulado').reduce((s, a) => s + a.total_debe, 0))}
            </div>
            <div className="col-span-1 text-right text-sm font-bold text-gray-800 font-mono">
              {fmt(asientos.filter(a => a.estado !== 'anulado').reduce((s, a) => s + a.total_haber, 0))}
            </div>
            <div className="col-span-2" />
          </div>
        </div>
      )}

      {/* Modal detalle asiento */}
      {asientoDetalle && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-900">{asientoDetalle.asiento?.numero}</p>
                <p className="text-sm text-gray-500">{asientoDetalle.asiento?.fecha} · {asientoDetalle.asiento?.concepto}</p>
              </div>
              <button onClick={() => setAsientoDetalle(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="p-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b">
                    <th className="text-left pb-2">Cuenta</th>
                    <th className="text-right pb-2">Debe</th>
                    <th className="text-right pb-2">Haber</th>
                  </tr>
                </thead>
                <tbody>
                  {asientoDetalle.detalle?.map((l: any) => (
                    <tr key={l.id} className="border-b border-gray-50">
                      <td className="py-2">
                        <span className="font-mono text-xs text-gray-500 mr-2">{l.codigo_cuenta}</span>
                        {l.nombre_cuenta}
                        {l.descripcion && <span className="text-xs text-gray-400 block">{l.descripcion}</span>}
                      </td>
                      <td className="text-right font-mono">{l.debe > 0 ? fmt(l.debe) : '—'}</td>
                      <td className="text-right font-mono">{l.haber > 0 ? fmt(l.haber) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-semibold border-t border-gray-200">
                    <td className="pt-2">TOTALES</td>
                    <td className="text-right pt-2 font-mono">{fmt(asientoDetalle.asiento?.total_debe)}</td>
                    <td className="text-right pt-2 font-mono">{fmt(asientoDetalle.asiento?.total_haber)}</td>
                  </tr>
                </tfoot>
              </table>
              {asientoDetalle.asiento?.estado === 'borrador' && (
                <div className="mt-4 flex gap-2 justify-end">
                  <button
                    onClick={() => accionAsiento(asientoDetalle.asiento.id, 'anular')}
                    className="text-sm px-3 py-1.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
                  >Anular</button>
                  <button
                    onClick={() => accionAsiento(asientoDetalle.asiento.id, 'contabilizar')}
                    className="text-sm px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >Contabilizar</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal nuevo asiento */}
      {mostrarForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[95vh] overflow-y-auto">
            <div className="p-5 border-b flex items-center justify-between sticky top-0 bg-white z-10">
              <h2 className="font-semibold text-gray-900">Nuevo Asiento Contable</h2>
              <button onClick={() => setMostrarForm(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Fecha *</label>
                  <input type="date" value={form.fecha} onChange={e => setForm({...form, fecha: e.target.value})}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Tipo</label>
                  <select value={form.tipo} onChange={e => setForm({...form, tipo: e.target.value})}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm">
                    <option value="manual">Manual</option>
                    <option value="ajuste">Ajuste</option>
                    <option value="apertura">Apertura</option>
                    <option value="cierre">Cierre</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Concepto *</label>
                <input type="text" value={form.concepto} onChange={e => setForm({...form, concepto: e.target.value})}
                  placeholder="Ej: Registro venta de mercancías al contado"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>

              {/* Líneas de asiento */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs text-gray-500 font-medium uppercase tracking-wider">Líneas del asiento</label>
                  <div className={`text-xs font-mono px-2 py-0.5 rounded ${cuadrado ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                    {cuadrado ? '✓ Cuadrado' : `Δ ${Math.abs(totalDebe - totalHaber).toFixed(2)}`}
                  </div>
                </div>

                {/* Cabecera */}
                <div className="grid grid-cols-12 gap-1 text-xs text-gray-400 mb-1 px-1">
                  <div className="col-span-5">Cuenta</div>
                  <div className="col-span-2 text-right">Debe</div>
                  <div className="col-span-2 text-right">Haber</div>
                  <div className="col-span-2">Descripción</div>
                  <div className="col-span-1" />
                </div>

                {form.lineas.map((linea, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-1 mb-1 relative">
                    {/* Búsqueda de cuenta */}
                    <div className="col-span-5 relative">
                      <input
                        type="text"
                        value={busquedaCuenta[idx] ?? (linea.codigo_cuenta ? linea.codigo_cuenta + ' — ' + linea.nombre_cuenta : '')}
                        onChange={e => buscarCuenta(idx, e.target.value)}
                        onFocus={e => { if (!linea.cuenta_id) buscarCuenta(idx, '') }}
                        placeholder="Buscar cuenta..."
                        className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs"
                      />
                      {sugerencias[idx] && sugerencias[idx].length > 0 && (
                        <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto">
                          {sugerencias[idx].map(c => (
                            <button
                              key={c.id}
                              onClick={() => seleccionarCuenta(idx, c)}
                              className="w-full text-left px-3 py-1.5 hover:bg-blue-50 text-xs border-b border-gray-50"
                            >
                              <span className="font-mono text-gray-500 mr-2">{c.codigo}</span>
                              <span>{c.nombre}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="col-span-2">
                      <input type="number" value={linea.debe} onChange={e => actualizarLinea(idx, 'debe', e.target.value)}
                        placeholder="0.00" step="0.01" min="0"
                        className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs text-right font-mono" />
                    </div>
                    <div className="col-span-2">
                      <input type="number" value={linea.haber} onChange={e => actualizarLinea(idx, 'haber', e.target.value)}
                        placeholder="0.00" step="0.01" min="0"
                        className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs text-right font-mono" />
                    </div>
                    <div className="col-span-2">
                      <input type="text" value={linea.descripcion} onChange={e => actualizarLinea(idx, 'descripcion', e.target.value)}
                        placeholder="Nota" className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs" />
                    </div>
                    <div className="col-span-1 flex items-center justify-center">
                      {form.lineas.length > 2 && (
                        <button onClick={() => eliminarLinea(idx)} className="text-red-400 hover:text-red-600 text-sm">×</button>
                      )}
                    </div>
                  </div>
                ))}

                {/* Totales */}
                <div className="grid grid-cols-12 gap-1 mt-2 border-t border-gray-200 pt-2">
                  <div className="col-span-5 text-xs text-gray-500 font-medium flex items-center">TOTALES</div>
                  <div className={`col-span-2 text-right text-xs font-bold font-mono ${cuadrado ? 'text-green-700' : 'text-red-600'}`}>
                    {fmt(totalDebe)}
                  </div>
                  <div className={`col-span-2 text-right text-xs font-bold font-mono ${cuadrado ? 'text-green-700' : 'text-red-600'}`}>
                    {fmt(totalHaber)}
                  </div>
                  <div className="col-span-3" />
                </div>

                <button onClick={agregarLinea}
                  className="mt-2 text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1">
                  + Agregar línea
                </button>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">
                  {error}
                </div>
              )}
            </div>
            <div className="p-5 border-t flex justify-between items-center sticky bottom-0 bg-white">
              <button onClick={() => setMostrarForm(false)} className="text-sm text-gray-500 hover:text-gray-700">Cancelar</button>
              <div className="flex gap-2">
                <button
                  onClick={() => guardarAsiento(false)}
                  disabled={guardando}
                  className="text-sm px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                >
                  Guardar borrador
                </button>
                <button
                  onClick={() => guardarAsiento(true)}
                  disabled={guardando || !cuadrado}
                  className="text-sm px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {guardando ? 'Guardando...' : 'Contabilizar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
