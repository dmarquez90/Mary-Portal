'use client'
import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getEmpresaIdActual } from '@/lib/supabase/empresa-actual'
import { CalendarDays, Plus, AlertTriangle, XCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface Empleado {
  id: string
  primer_nombre: string
  primer_apellido: string
  salario_base: number
}

interface Prestacion {
  acum_vacaciones: number
  dias_vacaciones_acum: number
  dias_vacaciones_gozadas: number
  dias_vacaciones_pagadas: number
}

interface Ausencia {
  id: string
  empleado_id: string
  tipo: 'vacacion_descanso' | 'vacacion_pagada' | 'incapacidad_enfermedad'
  fecha_inicio: string
  fecha_fin: string
  dias: number
  monto: number
  subsidio_inss: number
  dias_cubiertos_empresa: number
  certificado_numero: string | null
  estado: 'registrado' | 'pagado' | 'anulado'
  notas: string | null
  empleado?: { primer_nombre: string; primer_apellido: string }
}

const fmt = (n: number) => `C$ ${Number(n ?? 0).toLocaleString('es-NI', { minimumFractionDigits: 2 })}`

const TIPOS = [
  { value: 'vacacion_descanso',      label: 'Vacación descansada' },
  { value: 'vacacion_pagada',        label: 'Vacación pagada (sin descanso)' },
  { value: 'incapacidad_enfermedad', label: 'Incapacidad por enfermedad' },
] as const

const FORM_INIT = {
  empleado_id: '',
  tipo: 'vacacion_descanso' as Ausencia['tipo'],
  fecha_inicio: new Date().toISOString().split('T')[0],
  fecha_fin: new Date().toISOString().split('T')[0],
  dias_cubiertos_empresa: 0,
  tasa_pago_dias_espera: 0,
  certificado_numero: '',
  notas: '',
}

export default function AusenciasPage() {
  const [empresaId, setEmpresaId] = useState('')
  const [empleados, setEmpleados] = useState<Empleado[]>([])
  const [ausencias, setAusencias] = useState<Ausencia[]>([])
  const [prestacion, setPrestacion] = useState<Prestacion | null>(null)
  const [empleadoFiltro, setEmpleadoFiltro] = useState('')
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(FORM_INIT)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    async function init() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const eid = (await getEmpresaIdActual(supabase, user.id)) ?? ''
      setEmpresaId(eid)
      if (eid) {
        const r = await fetch(`/api/nomina/empleados?empresa_id=${eid}&estado=activo`)
        setEmpleados(await r.json())
      }
    }
    init()
  }, [])

  const fetchAusencias = useCallback(async (eid: string, empId?: string) => {
    setLoading(true)
    let url = `/api/nomina/ausencias?empresa_id=${eid}`
    if (empId) url += `&empleado_id=${empId}`
    const r = await fetch(url)
    const d = await r.json()
    setAusencias(Array.isArray(d) ? d : [])
    setLoading(false)
  }, [])

  useEffect(() => {
    if (empresaId) fetchAusencias(empresaId, empleadoFiltro || undefined)
  }, [empresaId, empleadoFiltro, fetchAusencias])

  async function cargarPrestacion(empId: string) {
    if (!empId) { setPrestacion(null); return }
    const supabase = createClient()
    const { data } = await supabase
      .from('prestaciones_sociales')
      .select('acum_vacaciones, dias_vacaciones_acum, dias_vacaciones_gozadas, dias_vacaciones_pagadas')
      .eq('empresa_id', empresaId)
      .eq('empleado_id', empId)
      .maybeSingle()
    setPrestacion(data as Prestacion | null)
  }

  const diasCalculados = form.fecha_inicio && form.fecha_fin
    ? Math.max(0, Math.round((new Date(form.fecha_fin).getTime() - new Date(form.fecha_inicio).getTime()) / 86400000) + 1)
    : 0

  const diasDisponibles = prestacion
    ? round2(prestacion.dias_vacaciones_acum - prestacion.dias_vacaciones_gozadas - prestacion.dias_vacaciones_pagadas)
    : null

  function round2(n: number) { return Math.round(n * 100) / 100 }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const r = await fetch('/api/nomina/ausencias', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        empresa_id: empresaId,
        empleado_id: form.empleado_id,
        tipo: form.tipo,
        fecha_inicio: form.fecha_inicio,
        fecha_fin: form.fecha_fin,
        dias_cubiertos_empresa: form.tipo === 'incapacidad_enfermedad' ? Number(form.dias_cubiertos_empresa) : undefined,
        tasa_pago_dias_espera: form.tipo === 'incapacidad_enfermedad' ? Number(form.tasa_pago_dias_espera) : undefined,
        certificado_numero: form.certificado_numero || undefined,
        notas: form.notas || undefined,
      }),
    })
    const d = await r.json()
    setSaving(false)
    if (!r.ok) { setError(d.error || 'Error al registrar'); return }
    toast.success('Ausencia registrada')
    setShowForm(false)
    setForm(FORM_INIT)
    setPrestacion(null)
    fetchAusencias(empresaId, empleadoFiltro || undefined)
  }

  async function anular(id: string) {
    if (!confirm('¿Anular esta ausencia? Esto revierte su efecto en los acumulados de prestaciones.')) return
    const r = await fetch(`/api/nomina/ausencias/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: 'anular' }),
    })
    const d = await r.json()
    if (!r.ok) { toast.error(d.error || 'Error al anular'); return }
    toast.success('Ausencia anulada')
    fetchAusencias(empresaId, empleadoFiltro || undefined)
  }

  const nombreEmpleado = (id: string) => {
    const e = empleados.find(x => x.id === id)
    return e ? `${e.primer_nombre} ${e.primer_apellido}` : '—'
  }

  const badgeTipo = (tipo: Ausencia['tipo']) => {
    if (tipo === 'vacacion_descanso') return 'bg-blue-100 text-blue-700'
    if (tipo === 'vacacion_pagada') return 'bg-amber-100 text-amber-700'
    return 'bg-rose-100 text-rose-700'
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Vacaciones y Enfermedad</h1>
          <p className="text-sm text-gray-500 mt-1">
            Días descansados, pagados sin descanso e incapacidades — CT Art. 76-80 · Reglamento Ley 539
          </p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg text-sm hover:bg-cyan-700"
        >
          <Plus size={16} /> Registrar
        </button>
      </div>

      {/* Filtro por empleado */}
      <div className="flex items-center gap-3">
        <select
          className="border rounded-lg px-3 py-2 text-sm min-w-[240px]"
          value={empleadoFiltro}
          onChange={e => setEmpleadoFiltro(e.target.value)}
        >
          <option value="">Todos los empleados</option>
          {empleados.map(e => (
            <option key={e.id} value={e.id}>{e.primer_nombre} {e.primer_apellido}</option>
          ))}
        </select>
      </div>

      {/* Modal de registro */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 space-y-4">
              <h2 className="text-lg font-bold">Registrar Ausencia</h2>
              {error && <div className="bg-red-50 text-red-700 px-4 py-2 rounded text-sm">{error}</div>}

              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Empleado *</label>
                  <select
                    required
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={form.empleado_id}
                    onChange={e => { setForm({ ...form, empleado_id: e.target.value }); cargarPrestacion(e.target.value) }}
                  >
                    <option value="">Selecciona un empleado</option>
                    {empleados.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.primer_nombre} {emp.primer_apellido}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Tipo *</label>
                  <select
                    required
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={form.tipo}
                    onChange={e => setForm({ ...form, tipo: e.target.value as Ausencia['tipo'] })}
                  >
                    {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>

                {form.tipo === 'vacacion_pagada' && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 flex gap-2">
                    <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                    <span>
                      El Código del Trabajo (Art. 76-80) exige que las vacaciones se tomen como descanso.
                      Pagarlas sin descanso solo es plenamente libre en la liquidación final del contrato;
                      hacerlo durante el empleo activo puede generar responsabilidad frente al MITRAB.
                      El sistema lo permite, pero la decisión y el riesgo son tuyos.
                    </span>
                  </div>
                )}

                {(form.tipo === 'vacacion_descanso' || form.tipo === 'vacacion_pagada') && prestacion && (
                  <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-600">
                    Días de vacaciones disponibles: <strong>{diasDisponibles?.toFixed(2)}</strong>
                    {diasDisponibles !== null && diasCalculados > diasDisponibles && (
                      <p className="text-red-600 mt-1">Los días solicitados ({diasCalculados}) superan los disponibles.</p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Fecha inicio *</label>
                    <input required type="date" className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={form.fecha_inicio} onChange={e => setForm({ ...form, fecha_inicio: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Fecha fin *</label>
                    <input required type="date" className="w-full border rounded-lg px-3 py-2 text-sm"
                      value={form.fecha_fin} onChange={e => setForm({ ...form, fecha_fin: e.target.value })} />
                  </div>
                </div>
                <p className="text-xs text-slate-500">Días calculados: <strong>{diasCalculados}</strong></p>

                {form.tipo === 'incapacidad_enfermedad' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium mb-1">N° de certificado / reposo INSS</label>
                      <input className="w-full border rounded-lg px-3 py-2 text-sm"
                        value={form.certificado_numero} onChange={e => setForm({ ...form, certificado_numero: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium mb-1">Días de espera cubiertos por la empresa</label>
                        <input type="number" min="0" max="3" className="w-full border rounded-lg px-3 py-2 text-sm"
                          value={form.dias_cubiertos_empresa}
                          onChange={e => setForm({ ...form, dias_cubiertos_empresa: Number(e.target.value) })} />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">% de pago esos días</label>
                        <input type="number" min="0" max="1" step="0.05" className="w-full border rounded-lg px-3 py-2 text-sm"
                          value={form.tasa_pago_dias_espera}
                          onChange={e => setForm({ ...form, tasa_pago_dias_espera: Number(e.target.value) })} />
                      </div>
                    </div>
                    <p className="text-xs text-slate-400">
                      Los primeros 3 días de incapacidad no tienen una obligación legal única de pago por parte
                      del empleador; a partir del 4to día el INSS subsidia el 60% del salario. Ajusta según tu política interna.
                    </p>
                  </>
                )}

                <div>
                  <label className="block text-sm font-medium mb-1">Notas</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => { setShowForm(false); setError(''); setForm(FORM_INIT) }}
                    className="px-4 py-2 border rounded-lg text-sm">Cancelar</button>
                  <button type="submit" disabled={saving}
                    className="px-4 py-2 bg-cyan-600 text-white rounded-lg text-sm hover:bg-cyan-700 disabled:opacity-50 flex items-center gap-2">
                    {saving && <Loader2 size={14} className="animate-spin" />}
                    Registrar
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Tabla */}
      {loading ? (
        <div className="text-center py-8 text-gray-400">Cargando…</div>
      ) : ausencias.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <CalendarDays size={40} className="mx-auto mb-2 opacity-30" />
          <p>Sin ausencias registradas</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Empleado', 'Tipo', 'Del', 'Al', 'Días', 'Monto', 'Subsidio INSS', 'Estado', ''].map(h => (
                  <th key={h} className="px-3 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {ausencias.map(a => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-3 py-3">{a.empleado ? `${a.empleado.primer_nombre} ${a.empleado.primer_apellido}` : nombreEmpleado(a.empleado_id)}</td>
                  <td className="px-3 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${badgeTipo(a.tipo)}`}>
                      {TIPOS.find(t => t.value === a.tipo)?.label ?? a.tipo}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-xs">{a.fecha_inicio}</td>
                  <td className="px-3 py-3 text-xs">{a.fecha_fin}</td>
                  <td className="px-3 py-3 text-center">{a.dias}</td>
                  <td className="px-3 py-3 text-right">{fmt(a.monto)}</td>
                  <td className="px-3 py-3 text-right text-rose-700">{a.tipo === 'incapacidad_enfermedad' ? fmt(a.subsidio_inss) : '—'}</td>
                  <td className="px-3 py-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      a.estado === 'anulado' ? 'bg-gray-100 text-gray-500' :
                      a.estado === 'pagado' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
                    }`}>{a.estado.toUpperCase()}</span>
                  </td>
                  <td className="px-3 py-3">
                    {a.estado !== 'anulado' && (
                      <button onClick={() => anular(a.id)} title="Anular" className="text-gray-400 hover:text-red-600">
                        <XCircle size={16} />
                      </button>
                    )}
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
