'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { getEmpresaIdActual } from '@/lib/supabase/empresa-actual'
import { Plus, Search, Edit, UserCheck, UserX } from 'lucide-react'

interface Empleado {
  id: string
  primer_nombre: string
  segundo_nombre?: string
  primer_apellido: string
  segundo_apellido?: string
  cedula?: string
  numero_inss?: string
  salario_base: number
  fecha_ingreso: string
  estado: string
  regimen_inss: string
  cargo?: { nombre: string; departamento?: string }
}

export default function EmpleadosPage() {
  const [empleados, setEmpleados]   = useState<Empleado[]>([])
  const [loading, setLoading]       = useState(true)
  const [busqueda, setBusqueda]     = useState('')
  const [filtroEstado, setFiltroEstado] = useState('activo')
  const [empresaId, setEmpresaId]   = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      getEmpresaIdActual(supabase, user.id).then(eid => setEmpresaId(eid))
    })
  }, [])

  useEffect(() => {
    if (!empresaId) return
    setLoading(true)
    fetch(`/api/nomina/empleados?empresa_id=${empresaId}&estado=${filtroEstado}`)
      .then(r => r.json())
      .then(d => { setEmpleados(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [empresaId, filtroEstado])

  const filtrados = empleados.filter(e => {
    const nombre = `${e.primer_nombre} ${e.primer_apellido}`.toLowerCase()
    return nombre.includes(busqueda.toLowerCase()) ||
           (e.cedula || '').includes(busqueda) ||
           (e.numero_inss || '').includes(busqueda)
  })

  const nombreCompleto = (e: Empleado) =>
    [e.primer_nombre, e.segundo_nombre, e.primer_apellido, e.segundo_apellido]
    .filter(Boolean).join(' ')

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Empleados</h1>
          <p className="text-sm text-gray-500">
            {filtrados.length} empleado{filtrados.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Link
          href="/dashboard/nomina/empleados/nuevo"
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm font-medium"
        >
          <Plus size={16} /> Nuevo empleado
        </Link>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, cédula o INSS…"
            className="pl-9 pr-3 py-2 border rounded-lg text-sm w-full"
          />
        </div>
        <select
          value={filtroEstado}
          onChange={e => setFiltroEstado(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm"
        >
          <option value="activo">Activos</option>
          <option value="inactivo">Inactivos</option>
          <option value="todos">Todos</option>
        </select>
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Cargando…</div>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          {busqueda ? 'Sin resultados para la búsqueda' : 'No hay empleados registrados'}
        </div>
      ) : (
        <div className="overflow-x-auto bg-white rounded-xl border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Empleado</th>
                <th className="px-4 py-3 text-left font-semibold">Cargo</th>
                <th className="px-4 py-3 text-left font-semibold">INSS</th>
                <th className="px-4 py-3 text-right font-semibold">Salario base</th>
                <th className="px-4 py-3 text-left font-semibold">Régimen</th>
                <th className="px-4 py-3 text-left font-semibold">Ingreso</th>
                <th className="px-4 py-3 text-center font-semibold">Estado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtrados.map(emp => (
                <tr key={emp.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{nombreCompleto(emp)}</p>
                    {emp.cedula && <p className="text-xs text-gray-500">Cédula: {emp.cedula}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {emp.cargo?.nombre || '—'}
                    {emp.cargo?.departamento && (
                      <p className="text-xs text-gray-400">{emp.cargo.departamento}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{emp.numero_inss || '—'}</td>
                  <td className="px-4 py-3 text-right font-medium">
                    C$ {emp.salario_base.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      emp.regimen_inss === 'integral'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {emp.regimen_inss === 'integral' ? 'Integral' :
                       emp.regimen_inss === 'ivm_rp'   ? 'IVM-RP' : 'Facultativo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(emp.fecha_ingreso).toLocaleDateString('es-NI')}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {emp.estado === 'activo' ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                        <UserCheck size={12} /> Activo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                        <UserX size={12} /> {emp.estado}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/dashboard/nomina/empleados/${emp.id}`}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      <Edit size={16} />
                    </Link>
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
