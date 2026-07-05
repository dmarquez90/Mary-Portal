'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getEmpresaIdActual } from '@/lib/supabase/empresa-actual'
import { Gift } from 'lucide-react'

interface Prestacion {
  id:                    string
  empleado_id:           string
  acum_vacaciones:       number
  acum_aguinaldo:        number
  acum_indemnizacion:    number
  dias_vacaciones_acum:  number
  dias_vacaciones_gozadas: number
  ultimo_periodo_mes?:   number
  ultimo_periodo_anio?:  number
  empleado: {
    primer_nombre: string
    primer_apellido: string
    salario_base: number
    fecha_ingreso: string
    estado: string
    cargo?: { nombre: string }
  }
}

const fmt = (n: number) => `C$ ${n.toLocaleString('es-NI', { minimumFractionDigits: 2 })}`
const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

export default function PrestacionesPage() {
  const [prestaciones, setPrestaciones] = useState<Prestacion[]>([])
  const [loading, setLoading]           = useState(true)
  const [empresaId, setEmpresaId]       = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      getEmpresaIdActual(supabase, user.id).then(eid => setEmpresaId(eid))
    })
  }, [])

  useEffect(() => {
    if (!empresaId) return
    const supabase = createClient()
    supabase
      .from('prestaciones_sociales')
      .select(`
        *,
        empleado:empleados(
          primer_nombre, primer_apellido, salario_base, fecha_ingreso, estado,
          cargo:cargos(nombre)
        )
      `)
      .eq('empresa_id', empresaId)
      .eq('empleado.estado', 'activo')
      .order('empleado(primer_apellido)')
      .then(({ data }) => {
        setPrestaciones((data || []).filter((p: any) => p.empleado))
        setLoading(false)
      })
  }, [empresaId])

  if (loading) return <div className="p-6 text-center text-gray-400">Cargando…</div>

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Prestaciones Sociales</h1>
        <p className="text-sm text-gray-500">
          Vacaciones · Aguinaldo · Indemnización — Código del Trabajo Nicaragua
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm">
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
          <p className="text-blue-600 font-semibold text-xs uppercase">Provisión Vacaciones</p>
          <p className="font-bold text-lg text-blue-800 mt-1">
            {fmt(prestaciones.reduce((s, p) => s + p.acum_vacaciones, 0))}
          </p>
          <p className="text-xs text-blue-600 mt-0.5">8.33% mensual · 30 días/año (CT Art. 76)</p>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-lg p-3">
          <p className="text-amber-600 font-semibold text-xs uppercase">Provisión Aguinaldo</p>
          <p className="font-bold text-lg text-amber-800 mt-1">
            {fmt(prestaciones.reduce((s, p) => s + p.acum_aguinaldo, 0))}
          </p>
          <p className="text-xs text-amber-600 mt-0.5">8.33% mensual · pago diciembre (CT Art. 93)</p>
        </div>
        <div className="bg-red-50 border border-red-100 rounded-lg p-3">
          <p className="text-red-600 font-semibold text-xs uppercase">Provisión Indemnización</p>
          <p className="font-bold text-lg text-red-800 mt-1">
            {fmt(prestaciones.reduce((s, p) => s + p.acum_indemnizacion, 0))}
          </p>
          <p className="text-xs text-red-600 mt-0.5">8.33% mensual · al retiro (CT Art. 45)</p>
        </div>
      </div>

      {prestaciones.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Gift size={40} className="mx-auto mb-3 text-gray-300" />
          <p>Sin datos. Procese al menos una planilla para ver prestaciones acumuladas.</p>
        </div>
      ) : (
        <div className="overflow-x-auto bg-white rounded-xl border">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-4 py-2 text-left font-semibold">Empleado</th>
                <th className="px-4 py-2 text-left font-semibold">Cargo</th>
                <th className="px-4 py-2 text-right font-semibold">Salario base</th>
                <th className="px-4 py-2 text-center font-semibold">Días vac. acum.</th>
                <th className="px-4 py-2 text-right font-semibold text-blue-600">Vacaciones</th>
                <th className="px-4 py-2 text-right font-semibold text-amber-600">Aguinaldo</th>
                <th className="px-4 py-2 text-right font-semibold text-red-600">Indemnización</th>
                <th className="px-4 py-2 text-center font-semibold">Último período</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {prestaciones.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">
                    {p.empleado.primer_nombre} {p.empleado.primer_apellido}
                  </td>
                  <td className="px-4 py-2 text-gray-500">{p.empleado.cargo?.nombre || '—'}</td>
                  <td className="px-4 py-2 text-right">{fmt(p.empleado.salario_base)}</td>
                  <td className="px-4 py-2 text-center">
                    <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">
                      {p.dias_vacaciones_acum.toFixed(1)} días
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right text-blue-700 font-semibold">{fmt(p.acum_vacaciones)}</td>
                  <td className="px-4 py-2 text-right text-amber-700 font-semibold">{fmt(p.acum_aguinaldo)}</td>
                  <td className="px-4 py-2 text-right text-red-700 font-semibold">{fmt(p.acum_indemnizacion)}</td>
                  <td className="px-4 py-2 text-center text-gray-400 text-xs">
                    {p.ultimo_periodo_mes
                      ? `${meses[p.ultimo_periodo_mes - 1]} ${p.ultimo_periodo_anio}`
                      : '—'}
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
