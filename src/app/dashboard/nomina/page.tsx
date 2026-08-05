'use client'
import Link from 'next/link'
import { Users, FileText, Gift, BarChart2, CalendarDays } from 'lucide-react'

const modulos = [
  {
    href:        '/dashboard/nomina/empleados',
    icon:        Users,
    titulo:      'Empleados y Cargos',
    descripcion: 'Ficha del empleado, salarios, INSS, régimen laboral',
    color:       'bg-blue-50 border-blue-200 text-blue-700',
    iconColor:   'text-blue-600',
  },
  {
    href:        '/dashboard/nomina/planilla',
    icon:        FileText,
    titulo:      'Planilla Salarial',
    descripcion: 'Generar planilla mensual · INSS · INATEC · IR Laboral',
    color:       'bg-emerald-50 border-emerald-200 text-emerald-700',
    iconColor:   'text-emerald-600',
  },
  {
    href:        '/dashboard/nomina/prestaciones',
    icon:        Gift,
    titulo:      'Prestaciones Sociales',
    descripcion: 'Vacaciones · Aguinaldo · Indemnización · Liquidaciones',
    color:       'bg-amber-50 border-amber-200 text-amber-700',
    iconColor:   'text-amber-600',
  },
  {
    href:        '/dashboard/nomina/ausencias',
    icon:        CalendarDays,
    titulo:      'Vacaciones y Enfermedad',
    descripcion: 'Días descansados, pagados sin descanso e incapacidades',
    color:       'bg-cyan-50 border-cyan-200 text-cyan-700',
    iconColor:   'text-cyan-600',
  },
  {
    href:        '/dashboard/nomina/reportes',
    icon:        BarChart2,
    titulo:      'Reportes INSS / INATEC / IR',
    descripcion: 'Autodeterminación INSS · Factura INATEC · IR laboral VET',
    color:       'bg-purple-50 border-purple-200 text-purple-700',
    iconColor:   'text-purple-600',
  },
]

export default function NominaPage() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Nómina y Planilla</h1>
        <p className="text-sm text-gray-500 mt-1">
          Ley 539 INSS · LCT Art. 23 · Código del Trabajo Nicaragua — vence día 17 de cada mes
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {modulos.map((m) => (
          <Link
            key={m.href}
            href={m.href}
            className={`flex items-start gap-4 p-5 rounded-xl border-2 hover:shadow-md transition-shadow ${m.color}`}
          >
            <m.icon size={28} className={`mt-0.5 flex-shrink-0 ${m.iconColor}`} />
            <div>
              <p className="font-semibold text-base">{m.titulo}</p>
              <p className="text-sm opacity-80 mt-0.5">{m.descripcion}</p>
            </div>
          </Link>
        ))}
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-sm text-yellow-800">
          <span className="font-semibold">⚠ Fecha límite:</span> Las declaraciones INSS e INATEC
          vencen el <strong>día 17</strong> de cada mes. El incumplimiento genera multas del 3% mensual
          más intereses moratorios (Ley 539, Art. 57).
        </p>
      </div>
    </div>
  )
}
