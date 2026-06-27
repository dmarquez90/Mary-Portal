'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Lock, Unlock, AlertTriangle, CheckCircle,
  TrendingUp, TrendingDown, ChevronRight, RefreshCw
} from 'lucide-react'

interface Periodo {
  id: string
  nombre: string
  fecha_inicio: string
  fecha_fin: string
  estado: string
  bloqueado: boolean
  fecha_cierre?: string
  anio: number
  mes: number
  asiento_cierre_id?: string
}

interface ResultadoCierre {
  ok: boolean
  error?: string
  pendientes?: number
  mensaje?: string
  periodo_cerrado?: string
  total_ingresos?: number
  total_costos?: number
  total_gastos?: number
  utilidad_neta?: number
  asiento_cierre_id?: string
  periodo_siguiente?: string
}

const fmt = (n: number) =>
  new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO' }).format(n ?? 0)

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

export default function CierreContablePage() {
  const [periodos,   setPeriodos]   = useState<Periodo[]>([])
  const [loading,    setLoading]    = useState(true)
  const [empresaId,  setEmpresaId]  = useState('')
  const [cerrando,   setCerrando]   = useState<string | null>(null)
  const [resultado,  setResultado]  = useState<ResultadoCierre | null>(null)
  const [confirming, setConfirming] = useState<Periodo | null>(null)

  // Diagnóstico por período
  const [diagnostico, setDiagnostico] = useState<Record<string, {
    totalAsientos: number, borradores: number, sinPeriodo: number,
    ingresos: number, costos: number, gastos: number
  }>>({})

  const fetchPeriodos = useCallback(async (eid: string) => {
    setLoading(true)
    const r = await fetch(`/api/cierre-contable?empresa_id=${eid}`)
    const d = await r.json()
    setPeriodos(Array.isArray(d) ? d : [])
    setLoading(false)
  }, [])

  useEffect(() => {
    async function boot() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const [{ data: en }, { data: ej }] = await Promise.all([
        supabase.from('empresas_persona_natural').select('id').eq('user_id', user.id).maybeSingle(),
        supabase.from('empresas_juridicas').select('id').eq('user_id', user.id).maybeSingle(),
      ])
      const eid = en?.id ?? ej?.id ?? ''
      setEmpresaId(eid)
      if (eid) fetchPeriodos(eid)
    }
    boot()
  }, [fetchPeriodos])

  // Cargar diagnóstico contable por período
  useEffect(() => {
    if (!empresaId || periodos.length === 0) return
    async function loadDiag() {
      const supabase = createClient()
      const diag: typeof diagnostico = {}
      for (const p of periodos.filter(p => !p.bloqueado)) {
        const [{ data: asientos }, { data: borradores }] = await Promise.all([
          supabase.from('asientos_contables')
            .select('id', { count: 'exact', head: true })
            .eq('empresa_id', empresaId).eq('periodo_id', p.id).neq('estado','anulado'),
          supabase.from('asientos_contables')
            .select('id', { count: 'exact', head: true })
            .eq('empresa_id', empresaId).eq('periodo_id', p.id).eq('estado','borrador'),
        ])
        diag[p.id] = {
          totalAsientos: (asientos as unknown as { count?: number })?.count ?? 0,
          borradores: (borradores as unknown as { count?: number })?.count ?? 0,
          sinPeriodo: 0,
          ingresos: 0, costos: 0, gastos: 0,
        }
      }
      setDiagnostico(diag)
    }
    loadDiag()
  }, [empresaId, periodos])

  async function ejecutarCierre(periodo: Periodo) {
    setConfirming(null)
    setCerrando(periodo.id)
    setResultado(null)

    const r = await fetch('/api/cierre-contable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ periodo_id: periodo.id }),
    })
    const d: ResultadoCierre = await r.json()
    setResultado(d)
    setCerrando(null)

    if (d.ok) fetchPeriodos(empresaId)
  }

  const periodoActivo  = periodos.find(p => !p.bloqueado)
  const periodosCerrados = periodos.filter(p => p.bloqueado)

  return (
    <div className="p-6 space-y-6 max-w-4xl">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Cierre Contable</h1>
        <p className="text-sm text-gray-500 mt-1">
          Bloqueo de períodos · Asiento de cierre automático · Apertura del período siguiente
        </p>
      </div>

      {/* Resultado del cierre */}
      {resultado && (
        <div className={`rounded-xl border p-5 ${resultado.ok ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          {resultado.ok ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-green-800 font-semibold text-base">
                <CheckCircle className="w-5 h-5" />
                Cierre ejecutado exitosamente
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white rounded-lg p-3 border border-green-100">
                  <p className="text-xs text-gray-500">Ingresos del período</p>
                  <p className="font-bold text-gray-900">{fmt(resultado.total_ingresos ?? 0)}</p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-green-100">
                  <p className="text-xs text-gray-500">Costos</p>
                  <p className="font-bold text-gray-900">{fmt(resultado.total_costos ?? 0)}</p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-green-100">
                  <p className="text-xs text-gray-500">Gastos</p>
                  <p className="font-bold text-gray-900">{fmt(resultado.total_gastos ?? 0)}</p>
                </div>
                <div className={`rounded-lg p-3 border ${(resultado.utilidad_neta ?? 0) >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                  <p className="text-xs text-gray-500">Resultado neto</p>
                  <div className="flex items-center gap-1">
                    {(resultado.utilidad_neta ?? 0) >= 0
                      ? <TrendingUp className="w-4 h-4 text-emerald-600" />
                      : <TrendingDown className="w-4 h-4 text-red-600" />}
                    <p className={`font-bold ${(resultado.utilidad_neta ?? 0) >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                      {fmt(resultado.utilidad_neta ?? 0)}
                    </p>
                  </div>
                </div>
              </div>
              <div className="text-xs text-green-700 space-y-1">
                <p>✓ Período <strong>{resultado.periodo_cerrado}</strong> bloqueado</p>
                {resultado.asiento_cierre_id && resultado.asiento_cierre_id !== 'sin movimientos' && (
                  <p>✓ Asiento de cierre generado en el Libro Diario</p>
                )}
                <p>✓ Período <strong>{resultado.periodo_siguiente}</strong> creado y disponible</p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 text-red-800">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">No se pudo ejecutar el cierre</p>
                <p className="text-sm mt-1">{resultado.error}</p>
                {resultado.pendientes && resultado.pendientes > 0 && (
                  <p className="text-sm mt-1">
                    Tienes <strong>{resultado.pendientes} asiento(s)</strong> en borrador.
                    Ve al Libro Diario y apruébalos antes de cerrar.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Info proceso */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
        <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800">
          <p className="font-semibold mb-2">Qué hace el cierre contable:</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
            <div className="flex items-start gap-2">
              <span className="text-amber-500 font-bold mt-0.5">1.</span>
              <span>Verifica que no haya asientos en borrador</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-amber-500 font-bold mt-0.5">2.</span>
              <span>Genera el asiento de cierre de resultados (ingresos y gastos → utilidad/pérdida)</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-amber-500 font-bold mt-0.5">3.</span>
              <span>Bloquea el período — ningún asiento nuevo puede entrar</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-amber-500 font-bold mt-0.5">4.</span>
              <span>Crea el período siguiente automáticamente</span>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
          Cargando períodos...
        </div>
      ) : (
        <div className="space-y-4">

          {/* Período activo */}
          {periodoActivo && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Período activo</p>
              <div className="border-2 border-blue-200 rounded-xl p-5 bg-blue-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="p-2 rounded-lg bg-blue-100">
                      <Unlock size={20} className="text-blue-600" />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 text-base">{periodoActivo.nombre}</p>
                      <p className="text-sm text-gray-500">{periodoActivo.fecha_inicio} → {periodoActivo.fecha_fin}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs px-3 py-1 rounded-full bg-blue-200 text-blue-800 font-medium">
                      ABIERTO
                    </span>
                  </div>
                </div>

                {/* Diagnóstico del período */}
                {diagnostico[periodoActivo.id] && (
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <div className="bg-white rounded-lg p-3 border border-blue-100 text-center">
                      <p className="text-2xl font-bold text-gray-900">{diagnostico[periodoActivo.id].totalAsientos}</p>
                      <p className="text-xs text-gray-500">asientos aprobados</p>
                    </div>
                    <div className={`rounded-lg p-3 border text-center ${diagnostico[periodoActivo.id].borradores > 0 ? 'bg-orange-50 border-orange-200' : 'bg-white border-blue-100'}`}>
                      <p className={`text-2xl font-bold ${diagnostico[periodoActivo.id].borradores > 0 ? 'text-orange-600' : 'text-gray-900'}`}>
                        {diagnostico[periodoActivo.id].borradores}
                      </p>
                      <p className="text-xs text-gray-500">en borrador</p>
                    </div>
                    <div className={`rounded-lg p-3 border text-center ${diagnostico[periodoActivo.id].borradores > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
                      <p className={`text-xs font-medium ${diagnostico[periodoActivo.id].borradores > 0 ? 'text-red-700' : 'text-green-700'}`}>
                        {diagnostico[periodoActivo.id].borradores > 0
                          ? '⚠ Aprueba los borradores antes de cerrar'
                          : '✓ Listo para cerrar'}
                      </p>
                    </div>
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-blue-200 flex justify-end">
                  <button
                    onClick={() => setConfirming(periodoActivo)}
                    disabled={cerrando === periodoActivo.id || (diagnostico[periodoActivo.id]?.borradores ?? 0) > 0}
                    className="flex items-center gap-2 px-5 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Lock size={14} />
                    {cerrando === periodoActivo.id ? 'Ejecutando cierre...' : 'Ejecutar cierre del período'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {!periodoActivo && periodosCerrados.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <p className="font-medium">No hay períodos contables registrados</p>
              <p className="text-sm mt-1">Los períodos se crean automáticamente al ejecutar el primer cierre.</p>
            </div>
          )}

          {/* Períodos cerrados */}
          {periodosCerrados.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Histórico de períodos cerrados
              </p>
              <div className="space-y-2">
                {periodosCerrados.map(p => (
                  <div key={p.id} className="border border-gray-200 rounded-xl p-4 bg-gray-50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-gray-200">
                        <Lock size={16} className="text-gray-500" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-700">{p.nombre}</p>
                        <p className="text-xs text-gray-400">{p.fecha_inicio} → {p.fecha_fin}</p>
                        {p.fecha_cierre && (
                          <p className="text-xs text-gray-400">Cerrado el {p.fecha_cierre}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {p.asiento_cierre_id && (
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <CheckCircle size={12} className="text-green-500" />
                          Asiento de cierre generado
                        </span>
                      )}
                      <span className="text-xs px-3 py-1 rounded-full bg-gray-200 text-gray-600 font-medium">
                        CERRADO
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Nota legal */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        <p><strong>Nota legal:</strong> Los períodos cerrados cumplen con el principio de <em>período contable</em> (NIIF PYMES §3.10)
        y facilitan auditorías de la DGI. Para correcciones en períodos cerrados, usa asientos de ajuste
        en el período actual — el sistema las registrará en la fecha actual sin afectar el período bloqueado.</p>
      </div>

      {/* Modal de confirmación */}
      {confirming && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3 text-red-700">
              <div className="p-2 bg-red-100 rounded-full">
                <Lock size={20} />
              </div>
              <h3 className="font-bold text-lg">Confirmar cierre</h3>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800 space-y-2">
              <p>Estás a punto de cerrar el período <strong>{confirming.nombre}</strong>.</p>
              <p>Esta acción:</p>
              <ul className="list-disc list-inside space-y-1 ml-1">
                <li>Genera el asiento de cierre de resultados</li>
                <li><strong>Bloquea permanentemente</strong> el período</li>
                <li>No se puede revertir fácilmente</li>
                <li>Crea el período {
                  (() => {
                    const mes = confirming.mes === 12 ? 1 : confirming.mes + 1
                    const anio = confirming.mes === 12 ? confirming.anio + 1 : confirming.anio
                    return `${anio}-${String(mes).padStart(2,'0')}`
                  })()
                } automáticamente</li>
              </ul>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setConfirming(null)}
                className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => ejecutarCierre(confirming)}
                className="flex-1 bg-red-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-red-700 flex items-center justify-center gap-2"
              >
                <Lock size={14} />
                Confirmar cierre
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
