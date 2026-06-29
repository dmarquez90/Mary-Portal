'use client'
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Save, UserX, UserCheck, History } from 'lucide-react'

interface Cargo { id: string; nombre: string; departamento?: string }

interface HistorialSalario {
  id: string
  fecha_cambio: string
  salario_anterior: number
  salario_nuevo: number
  motivo: string
}

const DEPARTAMENTOS = [
  'Administración', 'Contabilidad', 'Ventas', 'Producción', 'Operaciones',
  'Recursos Humanos', 'Tecnología', 'Logística', 'Otro',
]

const fmt = (n: number) =>
  `C$ ${n.toLocaleString('es-NI', { minimumFractionDigits: 2 })}`

export default function EditarEmpleadoPage() {
  const router   = useRouter()
  const params   = useParams()
  const id       = params.id as string

  const [empresaId, setEmpresaId]   = useState<string | null>(null)
  const [cargos, setCargos]         = useState<Cargo[]>([])
  const [historial, setHistorial]   = useState<HistorialSalario[]>([])
  const [loading, setLoading]       = useState(true)
  const [guardando, setGuardando]   = useState(false)
  const [error, setError]           = useState('')
  const [success, setSuccess]       = useState('')
  const [tab, setTab]               = useState<'datos' | 'historial'>('datos')

  const [form, setForm] = useState({
    primer_nombre:    '',
    segundo_nombre:   '',
    primer_apellido:  '',
    segundo_apellido: '',
    cedula:           '',
    fecha_nacimiento: '',
    sexo:             'M',
    direccion:        '',
    telefono:         '',
    correo:           '',
    fecha_ingreso:    '',
    salario_base:     '',
    tipo_pago:        'mensual',
    departamento:     '',
    numero_inss:      '',
    regimen_inss:     'integral',
    tipo_contrato:    'tiempo_indeterminado',
    cargo_id:         '',
    estado:           'activo',
    motivo_cambio_salario: '',
  })

  const [salarioOriginal, setSalarioOriginal] = useState<number>(0)

  // Obtener empresa_id
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      Promise.all([
        supabase.from('empresas_persona_natural').select('id').eq('user_id', user.id).maybeSingle(),
        supabase.from('empresas_juridicas').select('id').eq('user_id', user.id).maybeSingle(),
      ]).then(([n, j]) => {
        const eid = (n.data || j.data)?.id || null
        setEmpresaId(eid)
        if (eid) {
          fetch(`/api/nomina/cargos?empresa_id=${eid}`)
            .then(r => r.json())
            .then(d => setCargos(Array.isArray(d) ? d : []))
        }
      })
    })
  }, [])

  // Cargar datos del empleado
  useEffect(() => {
    if (!id) return
    fetch(`/api/nomina/empleados/${id}`)
      .then(r => {
        if (!r.ok) throw new Error('Empleado no encontrado')
        return r.json()
      })
      .then(d => {
        setSalarioOriginal(Number(d.salario_base))
        setForm({
          primer_nombre:    d.primer_nombre    || '',
          segundo_nombre:   d.segundo_nombre   || '',
          primer_apellido:  d.primer_apellido  || '',
          segundo_apellido: d.segundo_apellido || '',
          cedula:           d.cedula           || '',
          fecha_nacimiento: d.fecha_nacimiento || '',
          sexo:             d.sexo             || 'M',
          direccion:        d.direccion        || '',
          telefono:         d.telefono         || '',
          correo:           d.correo           || '',
          fecha_ingreso:    d.fecha_ingreso    || '',
          salario_base:     String(d.salario_base || ''),
          tipo_pago:        d.tipo_pago        || 'mensual',
          departamento:     d.departamento     || '',
          numero_inss:      d.numero_inss      || '',
          regimen_inss:     d.regimen_inss     || 'integral',
          tipo_contrato:    d.tipo_contrato    || 'tiempo_indeterminado',
          cargo_id:         d.cargo_id         || '',
          estado:           d.estado           || 'activo',
          motivo_cambio_salario: '',
        })
        setLoading(false)
      })
      .catch(() => {
        setError('No se pudo cargar el empleado')
        setLoading(false)
      })
  }, [id])

  // Cargar historial salarial
  useEffect(() => {
    if (!empresaId || !id) return
    const supabase = createClient()
    supabase
      .from('historial_salarial')
      .select('*')
      .eq('empresa_id', empresaId)
      .eq('empleado_id', id)
      .order('fecha_cambio', { ascending: false })
      .then(({ data }) => setHistorial(data || []))
  }, [empresaId, id])

  const set = (k: string, v: string) => {
    setForm(f => ({ ...f, [k]: v }))
    setSuccess('')
  }

  const salarioCambiado = parseFloat(form.salario_base) !== salarioOriginal

  async function handleGuardar() {
    if (!empresaId) return
    if (!form.primer_nombre || !form.primer_apellido || !form.fecha_ingreso || !form.salario_base) {
      setError('Complete los campos obligatorios')
      return
    }
    if (salarioCambiado && !form.motivo_cambio_salario.trim()) {
      setError('Ingrese el motivo del cambio de salario')
      return
    }
    setGuardando(true)
    setError('')
    setSuccess('')
    try {
      const res = await fetch(`/api/nomina/empleados/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          empresa_id:   empresaId,
          salario_base: parseFloat(form.salario_base),
          cargo_id:     form.cargo_id || null,
        }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'Error al guardar'); return }
      setSalarioOriginal(parseFloat(form.salario_base))
      setForm(f => ({ ...f, motivo_cambio_salario: '' }))
      setSuccess('Cambios guardados correctamente')
      // Refrescar historial si cambió el salario
      if (salarioCambiado) {
        const supabase = createClient()
        supabase
          .from('historial_salarial')
          .select('*')
          .eq('empresa_id', empresaId)
          .eq('empleado_id', id)
          .order('fecha_cambio', { ascending: false })
          .then(({ data }) => setHistorial(data || []))
      }
    } catch {
      setError('Error de conexión')
    } finally {
      setGuardando(false)
    }
  }

  async function toggleEstado() {
    if (!empresaId) return
    const nuevoEstado = form.estado === 'activo' ? 'inactivo' : 'activo'
    const confirmar = confirm(
      nuevoEstado === 'inactivo'
        ? '¿Inactivar este empleado? No aparecerá en nuevas planillas.'
        : '¿Reactivar este empleado?'
    )
    if (!confirmar) return
    setGuardando(true)
    try {
      const res = await fetch(`/api/nomina/empleados/${id}`, {
        method: nuevoEstado === 'inactivo' ? 'DELETE' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        ...(nuevoEstado === 'activo' && {
          body: JSON.stringify({ empresa_id: empresaId, estado: 'activo' }),
        }),
      })
      if (res.ok) {
        setForm(f => ({ ...f, estado: nuevoEstado }))
        setSuccess(nuevoEstado === 'activo' ? 'Empleado reactivado' : 'Empleado inactivado')
      }
    } catch {
      setError('Error al cambiar estado')
    } finally {
      setGuardando(false)
    }
  }

  const campo = (label: string, key: string, type = 'text', required = false) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={(form as any)[key]}
        onChange={e => set(key, e.target.value)}
        className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
    </div>
  )

  if (loading) {
    return <div className="p-6 text-center text-gray-400">Cargando empleado…</div>
  }

  const nombreCompleto = [form.primer_nombre, form.segundo_nombre, form.primer_apellido, form.segundo_apellido]
    .filter(Boolean).join(' ')

  return (
    <div className="p-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">{nombreCompleto || 'Empleado'}</h1>
          <p className="text-sm text-gray-500">
            {form.estado === 'activo' ? (
              <span className="text-green-600 font-medium">● Activo</span>
            ) : (
              <span className="text-gray-400 font-medium">● Inactivo</span>
            )}
          </p>
        </div>
        <button
          onClick={toggleEstado}
          disabled={guardando}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
            form.estado === 'activo'
              ? 'border-red-200 text-red-600 hover:bg-red-50'
              : 'border-green-200 text-green-600 hover:bg-green-50'
          }`}
        >
          {form.estado === 'activo'
            ? <><UserX size={15} /> Inactivar</>
            : <><UserCheck size={15} /> Reactivar</>
          }
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b">
        {(['datos', 'historial'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'datos' ? 'Datos del empleado' : (
              <span className="flex items-center gap-1.5">
                <History size={14} /> Historial salarial
                {historial.length > 0 && (
                  <span className="bg-gray-200 text-gray-600 text-xs px-1.5 py-0.5 rounded-full">
                    {historial.length}
                  </span>
                )}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Alertas */}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
          {success}
        </div>
      )}

      {/* Tab: Datos */}
      {tab === 'datos' && (
        <div className="space-y-6 bg-white rounded-xl border p-6">

          {/* Datos personales */}
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Datos Personales
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {campo('Primer nombre', 'primer_nombre', 'text', true)}
              {campo('Segundo nombre', 'segundo_nombre')}
              {campo('Primer apellido', 'primer_apellido', 'text', true)}
              {campo('Segundo apellido', 'segundo_apellido')}
              {campo('Cédula de identidad', 'cedula')}
              {campo('Fecha de nacimiento', 'fecha_nacimiento', 'date')}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sexo</label>
                <select value={form.sexo} onChange={e => set('sexo', e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="M">Masculino</option>
                  <option value="F">Femenino</option>
                </select>
              </div>
              {campo('Teléfono', 'telefono')}
              {campo('Correo electrónico', 'correo', 'email')}
            </div>
            <div className="mt-4">
              {campo('Dirección', 'direccion')}
            </div>
          </section>

          {/* Datos laborales */}
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Datos Laborales
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {campo('Fecha de ingreso', 'fecha_ingreso', 'date', true)}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Salario base (C$) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={form.salario_base}
                  onChange={e => set('salario_base', e.target.value)}
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 ${
                    salarioCambiado ? 'border-amber-400 bg-amber-50' : ''
                  }`}
                />
                {salarioCambiado && salarioOriginal > 0 && (
                  <p className="text-xs text-amber-600 mt-1">
                    Anterior: {fmt(salarioOriginal)} → Nuevo: {fmt(parseFloat(form.salario_base) || 0)}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de pago</label>
                <select value={form.tipo_pago} onChange={e => set('tipo_pago', e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="mensual">Mensual</option>
                  <option value="quincenal">Quincenal</option>
                  <option value="semanal">Semanal</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cargo</label>
                <select value={form.cargo_id} onChange={e => set('cargo_id', e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">— Sin cargo —</option>
                  {cargos.map(c => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Departamento</label>
                <select value={form.departamento} onChange={e => set('departamento', e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">— Seleccionar —</option>
                  {DEPARTAMENTOS.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de contrato</label>
                <select value={form.tipo_contrato} onChange={e => set('tipo_contrato', e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="tiempo_indeterminado">Tiempo indeterminado</option>
                  <option value="tiempo_determinado">Tiempo determinado</option>
                  <option value="obra_determinada">Obra determinada</option>
                  <option value="servicios_profesionales">Servicios profesionales</option>
                </select>
              </div>
            </div>

            {/* Motivo cambio salario — solo aparece si cambió */}
            {salarioCambiado && (
              <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <label className="block text-sm font-medium text-amber-800 mb-1">
                  Motivo del cambio de salario <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.motivo_cambio_salario}
                  onChange={e => set('motivo_cambio_salario', e.target.value)}
                  placeholder="Ej: Ajuste anual, aumento por mérito…"
                  className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-amber-400"
                />
                <p className="text-xs text-amber-600 mt-1">
                  Se registrará en el historial salarial del empleado.
                </p>
              </div>
            )}
          </section>

          {/* Seguridad Social */}
          <section>
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Seguridad Social
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {campo('Número de INSS', 'numero_inss')}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Régimen INSS <span className="text-gray-400 font-normal">(Ley 539)</span>
                </label>
                <select value={form.regimen_inss} onChange={e => set('regimen_inss', e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="integral">Integral (7% lab · 22.5% pat)</option>
                  <option value="ivm_rp">IVM-RP (4% lab · 16.5% pat)</option>
                  <option value="facultativo">Facultativo</option>
                </select>
              </div>
            </div>
            <div className="mt-3 p-3 bg-blue-50 rounded-lg text-xs text-blue-700">
              <strong>Régimen Integral:</strong> Incluye enfermedad, maternidad, invalidez, vejez, muerte y riesgos profesionales.
              <strong className="ml-2">IVM-RP:</strong> Solo invalidez, vejez, muerte y riesgos profesionales.
            </div>
          </section>

          {/* Botones */}
          <div className="flex gap-3 pt-2">
            <button onClick={() => router.back()}
              className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50">
              Cancelar
            </button>
            <button onClick={handleGuardar} disabled={guardando}
              className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              <Save size={15} />
              {guardando ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      )}

      {/* Tab: Historial salarial */}
      {tab === 'historial' && (
        <div className="bg-white rounded-xl border">
          {historial.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <History size={36} className="mx-auto mb-3 text-gray-300" />
              <p>Sin cambios salariales registrados.</p>
              <p className="text-xs mt-1">Los cambios de salario se registran automáticamente al guardar.</p>
            </div>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Fecha</th>
                  <th className="px-4 py-3 text-right font-semibold">Salario anterior</th>
                  <th className="px-4 py-3 text-right font-semibold">Salario nuevo</th>
                  <th className="px-4 py-3 text-right font-semibold">Variación</th>
                  <th className="px-4 py-3 text-left font-semibold">Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {historial.map(h => {
                  const variacion = Number(h.salario_nuevo) - Number(h.salario_anterior)
                  const pct = ((variacion / Number(h.salario_anterior)) * 100).toFixed(1)
                  return (
                    <tr key={h.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-600">
                        {new Date(h.fecha_cambio).toLocaleDateString('es-NI')}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500">
                        {fmt(Number(h.salario_anterior))}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {fmt(Number(h.salario_nuevo))}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          variacion > 0
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {variacion > 0 ? '+' : ''}{pct}%
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{h.motivo || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
