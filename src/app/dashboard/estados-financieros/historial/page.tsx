'use client'
// src/app/dashboard/estados-financieros/historial/page.tsx
// Siconic - Historial de estados financieros guardados

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ArrowLeft, FileText, Trash2, ExternalLink, Scale, TrendingUp,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getEmpresaIdActual } from '@/lib/supabase/empresa-actual'

interface EstadoGuardado {
  id: string
  tipo_estado: string
  fecha_inicio: string
  fecha_fin: string
  total_activos: number | null
  total_pasivos: number | null
  total_patrimonio: number | null
  total_ingresos: number | null
  utilidad_neta: number | null
  notas: string | null
  created_at: string
}

const TIPO_INFO: Record<string, { label: string; href: string; icon: typeof Scale }> = {
  balance_general:    { label: 'Balance General',       href: '/dashboard/estados-financieros/balance-general',    icon: Scale },
  estado_resultados:  { label: 'Estado de Resultados',  href: '/dashboard/estados-financieros/estado-resultados',  icon: TrendingUp },
  flujo_efectivo:     { label: 'Flujo de Efectivo',     href: '/dashboard/estados-financieros/flujo-efectivo',     icon: FileText },
  cambios_patrimonio: { label: 'Cambios en Patrimonio', href: '/dashboard/estados-financieros/cambios-patrimonio', icon: FileText },
}

const fmtC = (n: number | null) => n === null || n === undefined
  ? '—'
  : `C$ ${Number(n).toLocaleString('es-NI', { minimumFractionDigits: 2 })}`

const fmtFecha = (f: string) =>
  new Date(f.length === 10 ? f + 'T00:00:00' : f).toLocaleDateString('es-NI', {
    day: '2-digit', month: 'short', year: 'numeric',
  })

export default function HistorialEstadosPage() {
  const [items, setItems] = useState<EstadoGuardado[]>([])
  const [cargando, setCargando] = useState(true)

  const cargar = useCallback(async () => {
    setCargando(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setCargando(false); return }
    const empresaId = await getEmpresaIdActual(supabase, user.id)
    if (!empresaId) { setCargando(false); return }

    const { data, error } = await supabase
      .from('estados_financieros_guardados')
      .select('id, tipo_estado, fecha_inicio, fecha_fin, total_activos, total_pasivos, total_patrimonio, total_ingresos, utilidad_neta, notas, created_at')
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: false })
      .limit(100)

    if (error) toast.error('Error cargando historial: ' + error.message)
    setItems(data ?? [])
    setCargando(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  async function eliminar(item: EstadoGuardado) {
    if (!window.confirm(`¿Eliminar el ${TIPO_INFO[item.tipo_estado]?.label ?? item.tipo_estado} guardado del ${fmtFecha(item.fecha_fin)}?`)) return
    const supabase = createClient()
    const { error } = await supabase
      .from('estados_financieros_guardados')
      .delete()
      .eq('id', item.id)
    if (error) toast.error('No se pudo eliminar: ' + error.message)
    else { toast.success('Eliminado'); cargar() }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto">
          <Link
            href="/dashboard/estados-financieros"
            className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1 mb-2"
          >
            <ArrowLeft size={15} /> Estados Financieros
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileText className="text-blue-600" size={24} />
            Historial de Estados Guardados
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Estados financieros guardados como respaldo del período
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {cargando ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-7 h-7 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <FileText className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500 font-medium">Aún no hay estados guardados</p>
            <p className="text-gray-400 text-sm mt-1">
              Genera un Balance General o Estado de Resultados y usa el botón &quot;Guardar&quot;
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Período</th>
                  <th className="px-4 py-3 text-right">Totales clave</th>
                  <th className="px-4 py-3">Notas</th>
                  <th className="px-4 py-3">Guardado</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => {
                  const info = TIPO_INFO[item.tipo_estado]
                  const Icono = info?.icon ?? FileText
                  const esBalance = item.tipo_estado === 'balance_general'
                  const params = new URLSearchParams(
                    esBalance
                      ? { fecha_fin: item.fecha_fin }
                      : { fecha_inicio: item.fecha_inicio, fecha_fin: item.fecha_fin }
                  )
                  return (
                    <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-2 font-medium text-gray-800">
                          <Icono size={16} className="text-blue-500" />
                          {info?.label ?? item.tipo_estado}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {esBalance
                          ? `Al ${fmtFecha(item.fecha_fin)}`
                          : `${fmtFecha(item.fecha_inicio)} — ${fmtFecha(item.fecha_fin)}`}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-gray-700">
                        {esBalance ? (
                          <div>
                            <div>Activos: {fmtC(item.total_activos)}</div>
                            <div className="text-xs text-gray-400">Patrimonio: {fmtC(item.total_patrimonio)}</div>
                          </div>
                        ) : (
                          <div>
                            <div>Ingresos: {fmtC(item.total_ingresos)}</div>
                            <div className="text-xs text-gray-400">Utilidad: {fmtC(item.utilidad_neta)}</div>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">{item.notas ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{fmtFecha(item.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {info && (
                            <Link
                              href={`${info.href}?${params}`}
                              className="text-blue-600 hover:text-blue-700 flex items-center gap-1 text-xs font-medium"
                            >
                              <ExternalLink size={14} /> Regenerar
                            </Link>
                          )}
                          <button
                            onClick={() => eliminar(item)}
                            className="text-red-500 hover:text-red-600 p-1"
                            title="Eliminar"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
