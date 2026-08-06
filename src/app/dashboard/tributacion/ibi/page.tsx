'use client'
import { useState, useEffect } from 'react'
import { Home, Plus, CheckCircle } from 'lucide-react'

interface DeclaracionIBI {
  id: string
  anio: number
  descripcion_inmueble?: string
  valor_catastral: number
  base_imponible: number
  tasa: number
  monto_ibi: number
  fecha_vencimiento_cuota1?: string
  fecha_vencimiento_cuota2?: string
  cuota1_pagada: boolean
  cuota2_pagada: boolean
  estado: 'pendiente' | 'pagado_parcial' | 'pagado'
}

const fmt = (n: number) => new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO' }).format(n ?? 0)

export default function IBIPage() {
  const [declaraciones, setDeclaraciones] = useState<DeclaracionIBI[]>([])
  const [loading, setLoading] = useState(true)
  const [empresaId, setEmpresaId] = useState('')
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [mostrarForm, setMostrarForm] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [descripcion, setDescripcion] = useState('')
  const [valorCatastral, setValorCatastral] = useState('')

  useEffect(() => {
    async function init() {
      const { createClient } = await import('@/lib/supabase/client')
      const { getEmpresaIdActual } = await import('@/lib/supabase/empresa-actual')
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const eid = await getEmpresaIdActual(supabase, user.id) ?? ''
      setEmpresaId(eid)
      if (eid) fetchDeclaraciones(eid, anio)
    }
    init()
  }, [])

  async function fetchDeclaraciones(eid: string, a: number) {
    setLoading(true)
    const r = await fetch(`/api/tributacion/ibi?empresa_id=${eid}&anio=${a}`)
    const d = await r.json()
    setDeclaraciones(Array.isArray(d) ? d : [])
    setLoading(false)
  }

  async function registrarInmueble() {
    if (!valorCatastral || Number(valorCatastral) <= 0) { alert('Ingresa el valor catastral (según certificado municipal o autoevalúo)'); return }
    setGuardando(true)
    const r = await fetch('/api/tributacion/ibi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        empresa_id: empresaId,
        anio,
        descripcion_inmueble: descripcion || 'Inmueble principal',
        valor_catastral: Number(valorCatastral),
      })
    })
    setGuardando(false)
    if (r.ok) {
      setMostrarForm(false)
      setDescripcion('')
      setValorCatastral('')
      fetchDeclaraciones(empresaId, anio)
    } else {
      const d = await r.json().catch(() => null)
      alert(d?.error ?? 'Error al registrar el inmueble')
    }
  }

  async function marcarCuotaPagada(id: string, cuota: 1 | 2) {
    const boleta = prompt(`Número de recibo de la cuota ${cuota} (opcional):`)
    const r = await fetch(`/api/tributacion/ibi?id=${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cuota, numero_recibo: boleta || undefined })
    })
    if (r.ok) fetchDeclaraciones(empresaId, anio)
    else alert('Error al actualizar el pago')
  }

  const totalAnual = declaraciones.reduce((s, d) => s + d.monto_ibi, 0)
  const totalPagado = declaraciones.reduce((s, d) => {
    const porCuota = d.monto_ibi / 2
    return s + (d.cuota1_pagada ? porCuota : 0) + (d.cuota2_pagada ? porCuota : 0)
  }, 0)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">IBI — Impuesto de Bienes Inmuebles</h1>
          <p className="text-sm text-gray-500 mt-1">Municipal · Decreto 3-95 · 1% sobre el 80% del valor catastral · Anual, en 2 cuotas</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            className="border rounded-lg px-3 py-2 text-sm"
            value={anio}
            onChange={e => { setAnio(parseInt(e.target.value)); fetchDeclaraciones(empresaId, parseInt(e.target.value)) }}
          >
            {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button
            onClick={() => setMostrarForm(v => !v)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
          >
            <Plus size={16} />
            Registrar Inmueble
          </button>
        </div>
      </div>

      {mostrarForm && (
        <div className="bg-white border rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Descripción del inmueble (opcional)</label>
              <input
                className="border rounded-lg px-3 py-2 text-sm w-full"
                placeholder="Ej. Local comercial, Bodega..."
                value={descripcion}
                onChange={e => setDescripcion(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Valor catastral (C$) — según certificado municipal</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="border rounded-lg px-3 py-2 text-sm w-full"
                placeholder="0.00"
                value={valorCatastral}
                onChange={e => setValorCatastral(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setMostrarForm(false)} className="px-4 py-2 text-sm text-gray-600 border rounded-lg">Cancelar</button>
            <button onClick={registrarInmueble} disabled={guardando} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-50">
              {guardando ? 'Guardando...' : 'Registrar'}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-green-50 rounded-xl p-4">
          <p className="text-sm text-gray-600">Total Pagado {anio}</p>
          <p className="text-2xl font-bold text-green-700">{fmt(totalPagado)}</p>
        </div>
        <div className="bg-amber-50 rounded-xl p-4">
          <p className="text-sm text-gray-600">Total IBI {anio}</p>
          <p className="text-2xl font-bold text-amber-700">{fmt(totalAnual)}</p>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        <strong>Base legal:</strong> Decreto N°. 3-95. Tasa 1% sobre el 80% del valor catastral (o autoevalúo, el mayor).
        Se paga en dos cuotas del 50% ante la Alcaldía — no ante la DGI, y no se declara por el VET.
        Este es un impuesto sobre la PROPIEDAD del inmueble, distinto del IMI (que grava la actividad económica mensual).
        El sistema no calcula el valor catastral automáticamente — captúralo del certificado municipal o autoevalúo.
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-400">Cargando...</div>
      ) : declaraciones.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <Home size={40} className="mx-auto mb-2 opacity-30" />
          <p>No hay inmuebles registrados para {anio}</p>
          <p className="text-xs mt-1">Usa &quot;Registrar Inmueble&quot; para capturar el valor catastral y calcular el IBI del año</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Inmueble', 'Valor Catastral', 'Base (80%)', 'IBI Anual', 'Cuota 1', 'Cuota 2', 'Estado'].map(h => (
                  <th key={h} className="px-3 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {declaraciones.map(d => (
                <tr key={d.id}>
                  <td className="px-3 py-3">{d.descripcion_inmueble ?? 'Inmueble principal'}</td>
                  <td className="px-3 py-3">{fmt(d.valor_catastral)}</td>
                  <td className="px-3 py-3">{fmt(d.base_imponible)}</td>
                  <td className="px-3 py-3 font-semibold">{fmt(d.monto_ibi)}</td>
                  <td className="px-3 py-3">
                    {d.cuota1_pagada
                      ? <span className="inline-flex items-center gap-1 text-green-700 text-xs"><CheckCircle size={14} /> Pagada</span>
                      : <button onClick={() => marcarCuotaPagada(d.id, 1)} className="text-xs text-blue-600 hover:underline">Marcar pagada</button>}
                  </td>
                  <td className="px-3 py-3">
                    {d.cuota2_pagada
                      ? <span className="inline-flex items-center gap-1 text-green-700 text-xs"><CheckCircle size={14} /> Pagada</span>
                      : <button onClick={() => marcarCuotaPagada(d.id, 2)} className="text-xs text-blue-600 hover:underline">Marcar pagada</button>}
                  </td>
                  <td className="px-3 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      d.estado === 'pagado' ? 'bg-green-100 text-green-700' :
                      d.estado === 'pagado_parcial' ? 'bg-amber-100 text-amber-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {d.estado === 'pagado' ? 'Pagado' : d.estado === 'pagado_parcial' ? 'Parcial' : 'Pendiente'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
