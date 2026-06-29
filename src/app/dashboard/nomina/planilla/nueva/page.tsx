'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeft, Calculator } from 'lucide-react'
import { calcularEmpleadoPlanilla } from '@/lib/nomina/calculos'

interface Empleado {
  id: string
  primer_nombre: string
  segundo_nombre?: string
  primer_apellido: string
  segundo_apellido?: string
  salario_base: number
  regimen_inss: string
  numero_inss?: string
  cargo?: { nombre: string }
}

interface FilaPlanilla {
  empleado_id:     string
  nombre:          string
  salario_base:    number
  dias_trabajados: number
  horas_extra:     number
  comisiones:      number
  bonificaciones:  number
  otros_ingresos:  number
  adelantos:       number
  prestamos_inss:  number
  otros_descuentos: number
  regimen_inss:    string
  // calculados
  salario_bruto?:  number
  inss_laboral?:   number
  inss_patronal?:  number
  inatec?:         number
  ir_laboral?:     number
  neto_pagar?:     number
  prov_vacaciones?: number
  prov_aguinaldo?:  number
  prov_indemnizacion?: number
  // acumulados IR (se llenan al calcular, se envían al POST)
  acum_bruto_anteriores?: number
  acum_inss_anteriores?:  number
  acum_ir_anteriores?:    number
}

const fmt = (n?: number) => n !== undefined
  ? `C$ ${n.toLocaleString('es-NI', { minimumFractionDigits: 2 })}`
  : '—'

export default function NuevaPlanillaPage() {
  const router   = useRouter()
  const [empresaId, setEmpresaId] = useState<string | null>(null)
  const [empleados, setEmpleados] = useState<Empleado[]>([])
  const [filas, setFilas]         = useState<FilaPlanilla[]>([])
  const [calculado, setCalculado] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError]         = useState('')
  const now = new Date()
  const [periodo, setPeriodo] = useState({
    mes:  now.getMonth() + 1,
    anio: now.getFullYear(),
    fecha_pago: now.toISOString().split('T')[0],
  })

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

  useEffect(() => {
    if (!empresaId) return
    fetch(`/api/nomina/empleados?empresa_id=${empresaId}&estado=activo`)
      .then(r => r.json())
      .then((d: Empleado[]) => {
        setEmpleados(d)
        setFilas(d.map(e => ({
          empleado_id:     e.id,
          nombre:          [e.primer_nombre, e.primer_apellido].join(' '),
          salario_base:    e.salario_base,
          dias_trabajados: 30,
          horas_extra:     0,
          comisiones:      0,
          bonificaciones:  0,
          otros_ingresos:  0,
          adelantos:       0,
          prestamos_inss:  0,
          otros_descuentos: 0,
          regimen_inss:    e.regimen_inss,
        })))
      })
  }, [empresaId])

  async function calcular() {
    if (!empresaId) return
    const supabase = createClient()

    // Traer acumulados IR reales de meses anteriores al período seleccionado
    const { data: acums } = await supabase
      .from('ir_laboral_acumulado')
      .select('empleado_id, salario_bruto, inss_laboral, ir_retenido, mes')
      .eq('empresa_id', empresaId)
      .eq('anio_fiscal', periodo.anio)
      .lt('mes', periodo.mes)

    // Sumar acumulados por empleado (meses 1..periodo.mes-1)
    const acumMap: Record<string, { acumBruto: number; acumINSS: number; acumIR: number }> = {}
    for (const row of acums ?? []) {
      if (!acumMap[row.empleado_id]) {
        acumMap[row.empleado_id] = { acumBruto: 0, acumINSS: 0, acumIR: 0 }
      }
      acumMap[row.empleado_id].acumBruto += Number(row.salario_bruto)
      acumMap[row.empleado_id].acumINSS  += Number(row.inss_laboral)
      acumMap[row.empleado_id].acumIR    += Number(row.ir_retenido)
    }

    const filasCalc = filas.map(f => {
      const ac = acumMap[f.empleado_id] ?? { acumBruto: 0, acumINSS: 0, acumIR: 0 }
      const r = calcularEmpleadoPlanilla({
        empleadoId:          f.empleado_id,
        salarioBase:         f.salario_base,
        diasTrabajados:      f.dias_trabajados,
        horasExtra:          f.horas_extra,
        comisiones:          f.comisiones,
        bonificaciones:      f.bonificaciones,
        otrosIngresos:       f.otros_ingresos,
        adelantos:           f.adelantos,
        prestamosInss:       f.prestamos_inss,
        otrosDescuentos:     f.otros_descuentos,
        regimenInss:         f.regimen_inss as any,
        mesActual:           periodo.mes,
        acumBrutoAnteriores: ac.acumBruto,
        acumINSSAnteriores:  ac.acumINSS,
        acumIRAnteriores:    ac.acumIR,
      })
      return {
        ...f,
        acum_bruto_anteriores: ac.acumBruto,
        acum_inss_anteriores:  ac.acumINSS,
        acum_ir_anteriores:    ac.acumIR,
        salario_bruto:         r.salarioBruto,
        inss_laboral:          r.inssLaboral,
        inss_patronal:         r.inssPatronal,
        inatec:                r.inatec,
        ir_laboral:            r.irLaboral,
        neto_pagar:            r.netoPagar,
        prov_vacaciones:       r.provVacaciones,
        prov_aguinaldo:        r.provAguinaldo,
        prov_indemnizacion:    r.provIndemnizacion,
      }
    })
    setFilas(filasCalc)
    setCalculado(true)
  }

  const totales = calculado ? {
    bruto:    filas.reduce((s, f) => s + (f.salario_bruto || 0), 0),
    inssLab:  filas.reduce((s, f) => s + (f.inss_laboral || 0), 0),
    inssPatr: filas.reduce((s, f) => s + (f.inss_patronal || 0), 0),
    inatec:   filas.reduce((s, f) => s + (f.inatec || 0), 0),
    ir:       filas.reduce((s, f) => s + (f.ir_laboral || 0), 0),
    neto:     filas.reduce((s, f) => s + (f.neto_pagar || 0), 0),
    provVac:  filas.reduce((s, f) => s + (f.prov_vacaciones || 0), 0),
    provAgu:  filas.reduce((s, f) => s + (f.prov_aguinaldo || 0), 0),
    provInd:  filas.reduce((s, f) => s + (f.prov_indemnizacion || 0), 0),
  } : null

  async function guardar() {
    if (!calculado || !empresaId) return
    setGuardando(true)
    setError('')
    try {
      const res = await fetch('/api/nomina/planillas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          empresa_id:   empresaId,
          periodo_mes:  periodo.mes,
          periodo_anio: periodo.anio,
          fecha_pago:   periodo.fecha_pago,
          detalles:     filas,
        }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error || 'Error'); return }
      router.push(`/dashboard/nomina/planilla/${d.planilla.id}`)
    } catch {
      setError('Error de conexión')
    } finally {
      setGuardando(false)
    }
  }

  const updateFila = (idx: number, key: string, val: number) => {
    setFilas(f => f.map((r, i) => i === idx ? { ...r, [key]: val } : r))
    setCalculado(false)
  }

  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-500 hover:text-gray-700">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Nueva Planilla Salarial</h1>
      </div>

      {/* Período */}
      <div className="bg-white rounded-xl border p-4 flex gap-4 flex-wrap items-end">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Período</label>
          <div className="flex gap-2">
            <select value={periodo.mes} onChange={e => setPeriodo(p => ({ ...p, mes: +e.target.value }))}
              className="border rounded-lg px-3 py-2 text-sm">
              {meses.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
            </select>
            <input type="number" value={periodo.anio}
              onChange={e => setPeriodo(p => ({ ...p, anio: +e.target.value }))}
              className="border rounded-lg px-3 py-2 text-sm w-24" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de pago</label>
          <input type="date" value={periodo.fecha_pago}
            onChange={e => setPeriodo(p => ({ ...p, fecha_pago: e.target.value }))}
            className="border rounded-lg px-3 py-2 text-sm" />
        </div>
        <button onClick={calcular} disabled={filas.length === 0}
          className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-40">
          <Calculator size={16} /> Calcular planilla
        </button>
      </div>

      {filas.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          No hay empleados activos. <a href="/dashboard/nomina/empleados/nuevo" className="text-blue-600 underline">Registrar empleado</a>
        </div>
      ) : (
        <div className="overflow-x-auto bg-white rounded-xl border">
          <table className="min-w-max text-xs">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-3 py-2 text-left font-semibold sticky left-0 bg-gray-50">Empleado</th>
                <th className="px-3 py-2 text-right font-semibold">Salario base</th>
                <th className="px-3 py-2 text-center font-semibold">Días</th>
                <th className="px-3 py-2 text-right font-semibold">H. extra</th>
                <th className="px-3 py-2 text-right font-semibold">Comisiones</th>
                <th className="px-3 py-2 text-right font-semibold">Bonific.</th>
                <th className="px-3 py-2 text-right font-semibold bg-blue-50">S. Bruto</th>
                <th className="px-3 py-2 text-right font-semibold bg-red-50">INSS lab.</th>
                <th className="px-3 py-2 text-right font-semibold bg-orange-50">IR laboral</th>
                <th className="px-3 py-2 text-right font-semibold">Adelantos</th>
                <th className="px-3 py-2 text-right font-semibold bg-green-50">Neto pagar</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-400">INSS pat.</th>
                <th className="px-3 py-2 text-right font-semibold text-gray-400">INATEC</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filas.map((f, i) => (
                <tr key={f.empleado_id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium sticky left-0 bg-white">{f.nombre}</td>
                  <td className="px-3 py-2 text-right">
                    C$ {f.salario_base.toLocaleString('es-NI', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <input type="number" min="1" max="30" value={f.dias_trabajados}
                      onChange={e => updateFila(i, 'dias_trabajados', +e.target.value)}
                      className="w-12 border rounded px-1 py-0.5 text-center text-xs" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" min="0" value={f.horas_extra}
                      onChange={e => updateFila(i, 'horas_extra', +e.target.value)}
                      className="w-14 border rounded px-1 py-0.5 text-right text-xs" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" min="0" value={f.comisiones}
                      onChange={e => updateFila(i, 'comisiones', +e.target.value)}
                      className="w-20 border rounded px-1 py-0.5 text-right text-xs" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" min="0" value={f.bonificaciones}
                      onChange={e => updateFila(i, 'bonificaciones', +e.target.value)}
                      className="w-20 border rounded px-1 py-0.5 text-right text-xs" />
                  </td>
                  <td className="px-3 py-2 text-right font-semibold bg-blue-50">{fmt(f.salario_bruto)}</td>
                  <td className="px-3 py-2 text-right text-red-600 bg-red-50">{fmt(f.inss_laboral)}</td>
                  <td className="px-3 py-2 text-right text-orange-600 bg-orange-50">{fmt(f.ir_laboral)}</td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" min="0" value={f.adelantos}
                      onChange={e => updateFila(i, 'adelantos', +e.target.value)}
                      className="w-20 border rounded px-1 py-0.5 text-right text-xs" />
                  </td>
                  <td className="px-3 py-2 text-right font-bold text-green-700 bg-green-50">{fmt(f.neto_pagar)}</td>
                  <td className="px-3 py-2 text-right text-gray-400">{fmt(f.inss_patronal)}</td>
                  <td className="px-3 py-2 text-right text-gray-400">{fmt(f.inatec)}</td>
                </tr>
              ))}
            </tbody>
            {totales && (
              <tfoot className="bg-gray-100 font-bold text-xs border-t-2 border-gray-300">
                <tr>
                  <td className="px-3 py-2 sticky left-0 bg-gray-100">TOTALES</td>
                  <td></td><td></td><td></td><td></td><td></td>
                  <td className="px-3 py-2 text-right bg-blue-100">{fmt(totales.bruto)}</td>
                  <td className="px-3 py-2 text-right bg-red-100 text-red-700">{fmt(totales.inssLab)}</td>
                  <td className="px-3 py-2 text-right bg-orange-100 text-orange-700">{fmt(totales.ir)}</td>
                  <td></td>
                  <td className="px-3 py-2 text-right bg-green-100 text-green-800">{fmt(totales.neto)}</td>
                  <td className="px-3 py-2 text-right text-gray-500">{fmt(totales.inssPatr)}</td>
                  <td className="px-3 py-2 text-right text-gray-500">{fmt(totales.inatec)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {totales && (
        <div className="bg-gray-50 rounded-xl border p-4 grid grid-cols-3 gap-3 text-sm">
          <div><p className="text-gray-500 text-xs">Provisión vacaciones</p><p className="font-semibold">{fmt(totales.provVac)}</p></div>
          <div><p className="text-gray-500 text-xs">Provisión aguinaldo</p><p className="font-semibold">{fmt(totales.provAgu)}</p></div>
          <div><p className="text-gray-500 text-xs">Provisión indemnización</p><p className="font-semibold">{fmt(totales.provInd)}</p></div>
        </div>
      )}

      {!calculado && filas.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-700">
          Presione <strong>Calcular planilla</strong> para ver los valores antes de guardar.
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      <div className="flex gap-3">
        <button onClick={() => router.back()}
          className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2.5 text-sm font-medium hover:bg-gray-50">
          Cancelar
        </button>
        <button onClick={guardar} disabled={!calculado || guardando}
          className="flex-1 bg-emerald-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-emerald-700 disabled:opacity-40">
          {guardando ? 'Guardando…' : 'Guardar planilla'}
        </button>
      </div>
    </div>
  )
}
