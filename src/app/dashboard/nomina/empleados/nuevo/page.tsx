'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft } from 'lucide-react'
import ComboCargo from '@/components/nomina/ComboCargo'

const DEPARTAMENTOS = [
  'Administración','Contabilidad','Ventas','Producción','Operaciones',
  'Recursos Humanos','Tecnología','Logística','Otro',
]

export default function NuevoEmpleadoPage() {
  const router  = useRouter()
  const [empresaId, setEmpresaId]   = useState<string | null>(null)
  const [guardando, setGuardando]   = useState(false)
  const [error, setError]           = useState('')
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
    fecha_ingreso:    new Date().toISOString().split('T')[0],
    salario_base:     '',
    tipo_pago:        'mensual',
    departamento:     '',
    numero_inss:      '',
    regimen_inss:     'integral',
    tipo_contrato:    'tiempo_indeterminado',
    cargo_id:         '',
  })
  const [cargoNombre, setCargoNombre] = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      Promise.all([
        supabase.from('empresas_persona_natural').select('id').eq('user_id', user.id).maybeSingle(),
        supabase.from('empresas_juridicas').select('id').eq('user_id', user.id).maybeSingle(),
      ]).then(([n, j]) => {
        const eid = (n.data || j.data)?.id
        setEmpresaId(eid || null)

      })
    })
  }, [])

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!empresaId) return
    if (!form.primer_nombre || !form.primer_apellido || !form.fecha_ingreso || !form.salario_base) {
      setError('Complete los campos obligatorios')
      return
    }
    setGuardando(true)
    setError('')
    try {
      const res = await fetch('/api/nomina/empleados', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          empresa_id:   empresaId,
          salario_base: parseFloat(form.salario_base),
          cargo_id:     form.cargo_id || null,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error || 'Error al guardar')
        return
      }
      router.push('/dashboard/nomina/empleados')
    } catch {
      setError('Error de conexión')
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
        required={required}
        className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
    </div>
  )

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Nuevo Empleado</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 bg-white rounded-xl border p-6">
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
            {campo('Salario base (C$)', 'salario_base', 'number', true)}
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
                {empresaId && (
                  <ComboCargo
                    empresaId={empresaId}
                    value={form.cargo_id}
                    inputValue={cargoNombre}
                    onChange={(id, nombre) => { set('cargo_id', id); setCargoNombre(nombre) }}
                  />
                )}
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
        </section>

        {/* INSS */}
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

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={() => router.back()}
            className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50">
            Cancelar
          </button>
          <button type="submit" disabled={guardando}
            className="flex-1 bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {guardando ? 'Guardando…' : 'Registrar empleado'}
          </button>
        </div>
      </form>
    </div>
  )
}
