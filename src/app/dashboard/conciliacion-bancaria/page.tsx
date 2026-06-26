'use client'
import { useState, useEffect } from 'react'
import { GitMerge, Upload, CheckCircle } from 'lucide-react'

interface Cuenta { id: string; nombre: string; banco: string; numero_cuenta: string; saldo_actual: number }
interface Extracto { id: string; fecha: string; descripcion: string; tipo: 'credito'|'debito'; monto: number; referencia?: string; conciliado: boolean }
interface Transaccion { id: string; fecha: string; descripcion: string; tipo: string; monto: number; referencia?: string; estado: string }

const fmt = (n: number) => new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO' }).format(n ?? 0)

export default function ConciliacionPage() {
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [cuentaId, setCuentaId] = useState('')
  const [extractos, setExtractos] = useState<Extracto[]>([])
  const [transacciones, setTransacciones] = useState<Transaccion[]>([])
  const [loading, setLoading] = useState(false)
  const [empresaId, setEmpresaId] = useState('')
  const [saldoBanco, setSaldoBanco] = useState('')
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [mes, setMes] = useState(new Date().getMonth() + 1)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    const eid = localStorage.getItem('empresa_id') || ''
    setEmpresaId(eid)
    if (eid) fetchCuentas(eid)
  }, [])

  async function fetchCuentas(eid: string) {
    const r = await fetch(`/api/caja-bancos/cuentas-banco?empresa_id=${eid}`)
    const d = await r.json()
    setCuentas(Array.isArray(d) ? d : [])
  }

  async function fetchExtractos(cid: string) {
    setLoading(true)
    const r = await fetch(`/api/conciliacion-bancaria/extractos?empresa_id=${empresaId}&cuenta_banco_id=${cid}&conciliado=false`)
    const d = await r.json()
    setExtractos(Array.isArray(d) ? d : [])

    const r2 = await fetch(`/api/caja-bancos/transacciones?empresa_id=${empresaId}&cuenta_banco_id=${cid}`)
    const d2 = await r2.json()
    setTransacciones(Array.isArray(d2) ? d2.filter((t: Transaccion) => t.estado !== 'conciliado') : [])
    setLoading(false)
  }

  async function conciliarLinea(extractoId: string, transaccionId: string) {
    await fetch('/api/conciliacion-bancaria/extractos', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ extracto_id: extractoId, transaccion_id: transaccionId })
    })
    fetchExtractos(cuentaId)
  }

  async function guardarConciliacion() {
    setGuardando(true)
    const cuenta = cuentas.find(c => c.id === cuentaId)
    const saldoLibros = cuenta?.saldo_actual ?? 0
    const saldoBancoNum = parseFloat(saldoBanco)

    await fetch('/api/conciliacion-bancaria', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        empresa_id: empresaId,
        cuenta_banco_id: cuentaId,
        anio, mes,
        fecha_corte: new Date(anio, mes - 1, new Date(anio, mes, 0).getDate()).toISOString().split('T')[0],
        saldo_segun_banco: saldoBancoNum,
        saldo_segun_libros: saldoLibros,
      })
    })
    setGuardando(false)
    alert('Conciliación guardada exitosamente')
  }

  const totalNoConciliado = extractos.filter(e => !e.conciliado).length

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Conciliación Bancaria</h1>
        <p className="text-sm text-gray-500 mt-1">Matching extracto bancario vs. movimientos SARA — Requerido para auditoría DGI</p>
      </div>

      {/* Selección cuenta y período */}
      <div className="bg-white border rounded-xl p-4 space-y-4">
        <h2 className="font-semibold text-gray-700">Configurar Conciliación</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Cuenta Bancaria</label>
            <select className="w-full border rounded-lg px-3 py-2 text-sm"
              value={cuentaId} onChange={e => { setCuentaId(e.target.value); if (e.target.value) fetchExtractos(e.target.value) }}>
              <option value="">Seleccionar...</option>
              {cuentas.map(c => <option key={c.id} value={c.id}>{c.nombre} — {c.banco}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Año</label>
            <select className="w-full border rounded-lg px-3 py-2 text-sm" value={anio} onChange={e => setAnio(parseInt(e.target.value))}>
              {[2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Mes</label>
            <select className="w-full border rounded-lg px-3 py-2 text-sm" value={mes} onChange={e => setMes(parseInt(e.target.value))}>
              {Array.from({length:12},(_,i) => i+1).map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Saldo Según Banco (C$)</label>
            <input type="number" step="0.01" className="w-full border rounded-lg px-3 py-2 text-sm"
              placeholder="Del estado de cuenta" value={saldoBanco} onChange={e => setSaldoBanco(e.target.value)} />
          </div>
        </div>
        {cuentaId && saldoBanco && (
          <div className="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
            <div className="text-sm space-y-0.5">
              <p>Saldo según banco: <strong>{fmt(parseFloat(saldoBanco))}</strong></p>
              <p>Saldo según libros: <strong>{fmt(cuentas.find(c => c.id === cuentaId)?.saldo_actual ?? 0)}</strong></p>
              <p className={`font-bold ${Math.abs(parseFloat(saldoBanco) - (cuentas.find(c => c.id === cuentaId)?.saldo_actual ?? 0)) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
                Diferencia: {fmt(parseFloat(saldoBanco) - (cuentas.find(c => c.id === cuentaId)?.saldo_actual ?? 0))}
              </p>
            </div>
            <button onClick={guardarConciliacion} disabled={guardando}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50">
              <CheckCircle size={16} />
              {guardando ? 'Guardando...' : 'Guardar Conciliación'}
            </button>
          </div>
        )}
      </div>

      {cuentaId && (
        loading ? (
          <div className="text-center py-8 text-gray-400">Cargando...</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Extracto bancario */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-gray-700">Extracto Bancario</h2>
                <span className="text-xs text-gray-500">{totalNoConciliado} pendiente(s)</span>
              </div>
              {extractos.length === 0 ? (
                <div className="border-2 border-dashed rounded-xl p-8 text-center text-gray-400">
                  <Upload size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No hay líneas de extracto cargadas</p>
                  <p className="text-xs mt-1">Use la API para cargar líneas del estado de cuenta</p>
                </div>
              ) : (
                <div className="border rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-3 py-2 text-left">Fecha</th>
                        <th className="px-3 py-2 text-left">Descripción</th>
                        <th className="px-3 py-2 text-right">Monto</th>
                        <th className="px-3 py-2 text-center">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {extractos.map(e => (
                        <tr key={e.id} className={e.conciliado ? 'bg-green-50' : 'hover:bg-gray-50'}>
                          <td className="px-3 py-2">{e.fecha}</td>
                          <td className="px-3 py-2">{e.descripcion}</td>
                          <td className={`px-3 py-2 text-right font-medium ${e.tipo === 'credito' ? 'text-green-600' : 'text-red-600'}`}>
                            {e.tipo === 'credito' ? '+' : '-'}{fmt(e.monto)}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {e.conciliado ? (
                              <span className="text-green-600"><CheckCircle size={14} className="inline" /></span>
                            ) : (
                              <select className="text-xs border rounded px-1 py-0.5"
                                onChange={ev => { if (ev.target.value) conciliarLinea(e.id, ev.target.value) }}>
                                <option value="">Vincular...</option>
                                {transacciones.map(t => (
                                  <option key={t.id} value={t.id}>{t.fecha} — {fmt(t.monto)}</option>
                                ))}
                              </select>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Transacciones SARA sin conciliar */}
            <div>
              <h2 className="font-semibold text-gray-700 mb-3">Transacciones SARA sin Conciliar</h2>
              {transacciones.length === 0 ? (
                <div className="border-2 border-dashed rounded-xl p-8 text-center text-gray-400">
                  <GitMerge size={32} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Todas las transacciones están conciliadas</p>
                </div>
              ) : (
                <div className="border rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-3 py-2 text-left">Fecha</th>
                        <th className="px-3 py-2 text-left">Descripción</th>
                        <th className="px-3 py-2 text-right">Monto</th>
                        <th className="px-3 py-2 text-center">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {transacciones.map(t => (
                        <tr key={t.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2">{t.fecha}</td>
                          <td className="px-3 py-2">{t.descripcion}</td>
                          <td className="px-3 py-2 text-right font-medium">{fmt(t.monto)}</td>
                          <td className="px-3 py-2 text-center">
                            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">pendiente</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )
      )}
    </div>
  )
}
