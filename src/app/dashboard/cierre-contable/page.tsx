'use client'
import { useState, useEffect } from 'react'
import { Lock, Unlock, AlertTriangle, CheckCircle } from 'lucide-react'

interface Periodo {
  id: string
  nombre: string
  fecha_inicio: string
  fecha_fin: string
  estado: string
  bloqueado: boolean
  fecha_cierre?: string
}

export default function CierreContablePage() {
  const [periodos, setPeriodos] = useState<Periodo[]>([])
  const [loading, setLoading] = useState(true)
  const [empresaId, setEmpresaId] = useState('')
  const [cerrando, setCerrando] = useState<string | null>(null)

  useEffect(() => {
    const eid = localStorage.getItem('empresa_id') || ''
    setEmpresaId(eid)
    if (eid) fetchPeriodos(eid)
  }, [])

  async function fetchPeriodos(eid: string) {
    setLoading(true)
    const r = await fetch(`/api/cierre-contable?empresa_id=${eid}`)
    const d = await r.json()
    setPeriodos(Array.isArray(d) ? d : [])
    setLoading(false)
  }

  async function cerrarPeriodo(periodoId: string, nombre: string) {
    if (!confirm(`¿Cerrar el período "${nombre}"?\n\nEsta acción bloquea el período e impide nuevos asientos. No se puede revertir fácilmente.`)) return

    setCerrando(periodoId)
    const r = await fetch('/api/cierre-contable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ periodo_id: periodoId })
    })
    const d = await r.json()
    setCerrando(null)

    if (!r.ok || d.error) alert('Error: ' + (d.error || 'No se pudo cerrar el período'))
    else {
      alert(d.mensaje)
      fetchPeriodos(empresaId)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Cierre Contable</h1>
        <p className="text-sm text-gray-500 mt-1">Bloqueo de períodos — Previene modificaciones retroactivas — Obligatorio para auditoría</p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex gap-3">
        <AlertTriangle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800">
          <p className="font-semibold mb-1">Proceso de cierre:</p>
          <ol className="list-decimal list-inside space-y-0.5">
            <li>Verificar que todos los asientos del período estén <strong>aprobados</strong></li>
            <li>Calcular y contabilizar la depreciación mensual</li>
            <li>Ejecutar el cierre — el período queda bloqueado</li>
            <li>Iniciar el nuevo período contable</li>
          </ol>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-400">Cargando períodos...</div>
      ) : periodos.length === 0 ? (
        <div className="text-center py-8 text-gray-400">No hay períodos contables registrados</div>
      ) : (
        <div className="space-y-3">
          {periodos.map(p => (
            <div key={p.id} className={`border rounded-xl p-5 flex items-center justify-between ${p.bloqueado ? 'bg-gray-50 border-gray-200' : 'bg-white border-gray-300'}`}>
              <div className="flex items-center gap-4">
                <div className={`p-2 rounded-lg ${p.bloqueado ? 'bg-gray-200' : 'bg-green-100'}`}>
                  {p.bloqueado ? <Lock size={20} className="text-gray-600" /> : <Unlock size={20} className="text-green-600" />}
                </div>
                <div>
                  <p className="font-semibold text-gray-800">{p.nombre}</p>
                  <p className="text-sm text-gray-500">{p.fecha_inicio} → {p.fecha_fin}</p>
                  {p.fecha_cierre && (
                    <p className="text-xs text-gray-400 mt-0.5">Cerrado el {p.fecha_cierre}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className={`text-xs px-3 py-1 rounded-full ${
                  p.bloqueado ? 'bg-gray-200 text-gray-600' :
                  p.estado === 'abierto' ? 'bg-green-100 text-green-700' :
                  'bg-blue-100 text-blue-700'
                }`}>
                  {p.bloqueado ? 'CERRADO' : p.estado.toUpperCase()}
                </span>

                {!p.bloqueado && p.estado === 'abierto' && (
                  <button
                    onClick={() => cerrarPeriodo(p.id, p.nombre)}
                    disabled={cerrando === p.id}
                    className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50"
                  >
                    <Lock size={14} />
                    {cerrando === p.id ? 'Cerrando...' : 'Cerrar Período'}
                  </button>
                )}

                {p.bloqueado && (
                  <div className="flex items-center gap-1 text-sm text-green-600">
                    <CheckCircle size={16} />
                    <span>Período cerrado</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        <p><strong>Nota legal:</strong> Los períodos cerrados quedan protegidos para cumplir con el
        principio contable de <em>período contable</em> y facilitar auditorías de la DGI.
        Para correcciones en períodos cerrados, se deben usar asientos de ajuste en el período actual.</p>
      </div>
    </div>
  )
}
