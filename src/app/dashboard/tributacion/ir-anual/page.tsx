'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { FileText, Calculator, CheckCircle, ArrowLeft, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react'
import Link from 'next/link'

interface DeclaracionIR {
  id: string
  anio_fiscal: number
  renta_bruta_actividades: number
  otras_rentas_gravables: number
  costo_ventas: number
  gastos_administracion: number
  gastos_ventas: number
  gastos_financieros: number
  depreciacion_fiscal: number
  gastos_nomina: number
  otros_gastos_deducibles: number
  ir_30_pct: number
  pago_minimo_definitivo: number
  ir_a_pagar: number
  anticipos_pagados: number
  retenciones_recibidas: number
  ir_neto_pagar: number
  estado: string
  fecha_presentacion?: string
  fecha_pago?: string
  numero_declaracion?: string
  notas?: string
}

const fmt  = (n: number) => new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO' }).format(n ?? 0)

export default function IrAnualPage() {
  const [declaraciones, setDeclaraciones] = useState<DeclaracionIR[]>([])
  const [loading,       setLoading]       = useState(true)
  const [empresaId,     setEmpresaId]     = useState('')
  const [calculando,    setCalculando]    = useState(false)
  const [anioCalculo,   setAnioCalculo]   = useState(new Date().getFullYear() - 1)
  const [accionModal,   setAccionModal]   = useState<{ decl: DeclaracionIR; tipo: 'presentar'|'pagar' } | null>(null)
  const [numDecl,       setNumDecl]       = useState('')
  const [fechaAccion,   setFechaAccion]   = useState(new Date().toISOString().split('T')[0])
  const [formaPago,     setFormaPago]     = useState<'banco'|'caja'>('banco')
  const [procesando,    setProcesando]    = useState(false)

  const fetchDeclaraciones = useCallback(async (eid: string) => {
    setLoading(true)
    const r = await fetch(`/api/tributacion/ir-anual?empresa_id=${eid}`)
    const d = await r.json()
    setDeclaraciones(Array.isArray(d) ? d : [])
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
      if (eid) fetchDeclaraciones(eid)
    }
    boot()
  }, [fetchDeclaraciones])

  async function calcularAutomatico() {
    setCalculando(true)
    const r = await fetch('/api/tributacion/ir-anual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ empresa_id: empresaId, anio_fiscal: anioCalculo, calcular_automatico: true }),
    })
    setCalculando(false)
    if (r.ok) fetchDeclaraciones(empresaId)
    else { const d = await r.json(); alert('Error: ' + d.error) }
  }

  async function ejecutarAccion() {
    if (!accionModal) return
    setProcesando(true)
    const r = await fetch('/api/tributacion/ir-anual', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id:                 accionModal.decl.id,
        empresa_id:         empresaId,
        accion:             accionModal.tipo,
        fecha_presentacion: accionModal.tipo === 'presentar' ? fechaAccion : undefined,
        fecha_pago:         accionModal.tipo === 'pagar'     ? fechaAccion : undefined,
        numero_declaracion: numDecl || undefined,
        forma_pago:         formaPago,
      }),
    })
    const d = await r.json()
    setProcesando(false)
    if (r.ok) { setAccionModal(null); setNumDecl(''); fetchDeclaraciones(empresaId) }
    else { alert('Error: ' + d.error) }
  }

  const totalCostosGastos = (d: DeclaracionIR) =>
    d.costo_ventas + d.gastos_administracion + d.gastos_ventas +
    d.gastos_financieros + d.depreciacion_fiscal + d.gastos_nomina + d.otros_gastos_deducibles

  // ── CLAVE: renta neta puede ser negativa (pérdida) ────────────
  const rentaNetaReal = (d: DeclaracionIR) =>
    (d.renta_bruta_actividades + (d.otras_rentas_gravables ?? 0)) - totalCostosGastos(d)

  const hayPerdida = (d: DeclaracionIR) => rentaNetaReal(d) < 0

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/tributacion" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">IR Anual — Formulario 106</h1>
            <p className="text-sm text-gray-500 mt-0.5">LCT Art. 52–55 · Vence 28 febrero del año siguiente · Portal VET DGI</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select value={anioCalculo} onChange={e => setAnioCalculo(parseInt(e.target.value))}
            className="border rounded-lg px-3 py-2 text-sm">
            {[2022,2023,2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={calcularAutomatico} disabled={calculando}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50">
            <Calculator size={16} />
            {calculando ? 'Calculando...' : `Calcular IR ${anioCalculo}`}
          </button>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        El cálculo automático lee <strong>facturas emitidas/pagadas</strong>, <strong>compras recibidas/pagadas</strong>,
        <strong> planillas aprobadas</strong>, <strong>depreciaciones</strong> e <strong>IMI pagado</strong> del año fiscal seleccionado.
        Ajusta gastos adicionales manualmente antes de presentar en VET.
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Cargando...</div>
      ) : declaraciones.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <FileText size={48} className="mx-auto mb-3 opacity-30" />
          <p>No hay declaraciones. Use <strong>Calcular IR</strong> para generar la primera.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {declaraciones.map(d => {
            const rng      = rentaNetaReal(d)       // puede ser negativo
            const tcg      = totalCostosGastos(d)
            const perdida  = hayPerdida(d)
            const usaPMD   = !perdida && d.pago_minimo_definitivo > d.ir_30_pct

            return (
              <div key={d.id} className="border rounded-xl bg-white shadow-sm overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 bg-gray-50 border-b">
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-bold text-gray-900">IR Anual {d.anio_fiscal}</h2>
                    <span className={`text-xs px-3 py-1 rounded-full font-medium ${
                      d.estado === 'pagada'    ? 'bg-green-100 text-green-700' :
                      d.estado === 'presentada'? 'bg-blue-100  text-blue-700'  :
                                                 'bg-gray-100  text-gray-600'
                    }`}>{d.estado.toUpperCase()}</span>
                    {perdida && (
                      <span className="text-xs px-3 py-1 rounded-full font-medium bg-orange-100 text-orange-700 flex items-center gap-1">
                        <AlertTriangle size={12} /> PÉRDIDA FISCAL
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {d.estado === 'borrador' && (
                      <button onClick={() => setAccionModal({ decl: d, tipo: 'presentar' })}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                        Presentar en VET
                      </button>
                    )}
                    {d.estado === 'presentada' && d.ir_neto_pagar > 0 && (
                      <button onClick={() => setAccionModal({ decl: d, tipo: 'pagar' })}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700">
                        Registrar Pago
                      </button>
                    )}
                  </div>
                </div>

                <div className="p-6 space-y-5">
                  {/* Banner de pérdida fiscal */}
                  {perdida && (
                    <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex gap-3">
                      <AlertTriangle size={20} className="text-orange-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="font-semibold text-orange-800 text-sm">Pérdida fiscal del período</p>
                        <p className="text-orange-700 text-sm mt-1">
                          Los gastos deducibles superan los ingresos en{' '}
                          <strong>{fmt(Math.abs(rng))}</strong>.
                          La renta neta es negativa, por lo que el IR 30% es C$ 0.00.
                        </p>
                        <p className="text-orange-600 text-xs mt-2">
                          LCT Art. 46 — Esta pérdida puede trasladarse y deducirse en los próximos 3 años fiscales.
                          Sin embargo, el Pago Mínimo Definitivo del 1% sobre ingresos brutos sigue siendo obligatorio
                          si hubo ventas (Art. 61 LCT). Consulte con su asesor fiscal.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Ingresos */}
                  <div>
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">INGRESOS</h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-blue-50 rounded-lg p-3">
                        <p className="text-xs text-blue-600">Renta Bruta de Actividades</p>
                        <p className="font-bold text-blue-800 text-lg">{fmt(d.renta_bruta_actividades)}</p>
                      </div>
                      {d.otras_rentas_gravables > 0 && (
                        <div className="bg-blue-50 rounded-lg p-3">
                          <p className="text-xs text-blue-600">Otras Rentas Gravables</p>
                          <p className="font-bold text-blue-800">{fmt(d.otras_rentas_gravables)}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Costos y Gastos */}
                  <div>
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">COSTOS Y GASTOS DEDUCIBLES</h3>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {[
                        { label: 'Costo de Mercancías Vendidas', val: d.costo_ventas },
                        { label: 'Gastos de Administración',     val: d.gastos_administracion },
                        { label: 'Gastos de Ventas / IMI',       val: d.gastos_ventas },
                        { label: 'Gastos Financieros',           val: d.gastos_financieros },
                        { label: 'Depreciación Fiscal',          val: d.depreciacion_fiscal },
                        { label: 'Gastos de Nómina',             val: d.gastos_nomina },
                        { label: 'Otros Gastos Deducibles',      val: d.otros_gastos_deducibles },
                      ].filter(r => r.val > 0).map(r => (
                        <div key={r.label} className="bg-gray-50 rounded-lg p-2.5">
                          <p className="text-xs text-gray-500">{r.label}</p>
                          <p className="font-semibold text-gray-700">{fmt(r.val)}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 bg-gray-100 rounded-lg p-2.5 flex justify-between items-center">
                      <span className="text-sm font-medium text-gray-600">Total Costos y Gastos</span>
                      <span className="font-bold text-gray-800">{fmt(tcg)}</span>
                    </div>
                  </div>

                  {/* Renta Neta — con soporte de pérdida */}
                  <div className={`rounded-xl p-4 text-white ${perdida ? 'bg-orange-700' : 'bg-slate-800'}`}>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-xs opacity-70">Renta Neta {perdida ? '(Pérdida)' : 'Gravable'}</p>
                        <p className={`text-xl font-bold ${perdida ? 'text-orange-200' : 'text-white'}`}>
                          {perdida ? `(${fmt(Math.abs(rng))})` : fmt(rng)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs opacity-70">IR 30% sobre Renta Neta</p>
                        <p className={`text-lg font-semibold ${
                          perdida ? 'text-orange-300 line-through' :
                          usaPMD  ? 'opacity-50 line-through' : 'text-yellow-300'
                        }`}>
                          {fmt(d.ir_30_pct)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs opacity-70">Pago Mínimo Definitivo 1%</p>
                        <p className={`text-lg font-semibold ${
                          (usaPMD || perdida) && d.pago_minimo_definitivo > 0 ? 'text-yellow-300' : 'opacity-50 line-through'
                        }`}>
                          {fmt(d.pago_minimo_definitivo)}
                        </p>
                      </div>
                    </div>
                    {usaPMD && !perdida && (
                      <p className="text-center text-xs text-yellow-300 mt-2">
                        ⚠ Aplica Pago Mínimo Definitivo — el 1% supera el IR del 30% (LCT Art. 61)
                      </p>
                    )}
                    {perdida && d.pago_minimo_definitivo > 0 && (
                      <p className="text-center text-xs text-orange-200 mt-2">
                        ⚠ Hay pérdida fiscal, pero el PMD 1% sobre ingresos brutos puede aplicar (Art. 61 LCT). Verifique con su asesor.
                      </p>
                    )}
                  </div>

                  {/* Liquidación */}
                  <div>
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">LIQUIDACIÓN</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">
                          {perdida
                            ? 'IR a Pagar (PMD 1% — aplica aun con pérdida)'
                            : 'IR a Pagar (el mayor entre IR30% y PMD)'}
                        </span>
                        <span className="font-semibold">{fmt(d.ir_a_pagar)}</span>
                      </div>
                      {d.anticipos_pagados > 0 && (
                        <div className="flex justify-between text-sm text-green-700">
                          <span>(-) Anticipos IR pagados durante {d.anio_fiscal}</span>
                          <span className="font-semibold">- {fmt(d.anticipos_pagados)}</span>
                        </div>
                      )}
                      {d.retenciones_recibidas > 0 && (
                        <div className="flex justify-between text-sm text-green-700">
                          <span>(-) Retenciones IR recibidas de clientes</span>
                          <span className="font-semibold">- {fmt(d.retenciones_recibidas)}</span>
                        </div>
                      )}
                      <div className="border-t pt-2 flex justify-between items-center">
                        <span className="font-bold text-gray-800">IR Neto a Pagar</span>
                        <div className="flex items-center gap-2">
                          {d.ir_neto_pagar > 0
                            ? <TrendingUp size={18} className="text-red-600" />
                            : <TrendingDown size={18} className="text-green-600" />
                          }
                          <span className={`text-2xl font-bold ${d.ir_neto_pagar > 0 ? 'text-red-700' : 'text-green-700'}`}>
                            {fmt(d.ir_neto_pagar)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {d.ir_neto_pagar <= 0 && !perdida && (
                      <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3 flex gap-2 text-sm text-green-800">
                        <CheckCircle size={16} className="flex-shrink-0 mt-0.5" />
                        Los anticipos pagados cubren el IR anual completo. No hay saldo adicional.
                      </div>
                    )}

                    {perdida && d.ir_neto_pagar <= 0 && (
                      <div className="mt-3 bg-orange-50 border border-orange-200 rounded-lg p-3 flex gap-2 text-sm text-orange-800">
                        <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold">Pérdida fiscal — sin IR neto a pagar</p>
                          <p className="text-xs mt-1">
                            Presente el F-106 en ceros en VET. Documente la pérdida para trasladarla a los próximos períodos (LCT Art. 46, máx. 3 años).
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Nota de pérdida guardada en DB */}
                    {d.notas && d.notas.includes('PÉRDIDA') && (
                      <div className="mt-2 text-xs text-orange-600 bg-orange-50 rounded-lg px-3 py-2">
                        📋 {d.notas}
                      </div>
                    )}

                    {d.ir_neto_pagar > 0 && (
                      <div className="mt-2 text-xs text-gray-500">
                        Vence: 28 de febrero {d.anio_fiscal + 1}
                        {d.numero_declaracion && <span className="ml-3">Nº Declaración: {d.numero_declaracion}</span>}
                        {d.fecha_presentacion && <span className="ml-3">Presentada: {d.fecha_presentacion}</span>}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal Presentar / Pagar */}
      {accionModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="font-bold text-lg">
              {accionModal.tipo === 'presentar' ? 'Presentar Declaración en VET' : 'Registrar Pago IR Anual'}
            </h3>

            <div className="bg-gray-50 rounded-lg p-3 text-sm">
              <p className="font-medium">IR Anual {accionModal.decl.anio_fiscal}</p>
              <p className="text-gray-600">
                {accionModal.tipo === 'presentar'
                  ? `IR a pagar: ${fmt(accionModal.decl.ir_a_pagar)}`
                  : `Saldo neto: ${fmt(accionModal.decl.ir_neto_pagar)}`
                }
              </p>
              {hayPerdida(accionModal.decl) && (
                <p className="text-orange-600 text-xs mt-1 flex items-center gap-1">
                  <AlertTriangle size={12} /> Período con pérdida fiscal — presente F-106 en ceros si aplica
                </p>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">
                  {accionModal.tipo === 'presentar' ? 'Fecha de presentación' : 'Fecha de pago'}
                </label>
                <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={fechaAccion} onChange={e => setFechaAccion(e.target.value)} />
              </div>

              {accionModal.tipo === 'presentar' && (
                <div>
                  <label className="block text-sm font-medium mb-1">
                    N° Declaración VET <span className="text-gray-400 font-normal">(opcional)</span>
                  </label>
                  <input type="text" className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
                    placeholder="Asignado por la DGI"
                    value={numDecl} onChange={e => setNumDecl(e.target.value)} />
                </div>
              )}

              {accionModal.tipo === 'pagar' && (
                <div>
                  <label className="block text-sm font-medium mb-1">Forma de pago</label>
                  <select className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={formaPago} onChange={e => setFormaPago(e.target.value as 'banco'|'caja')}>
                    <option value="banco">Banco / Transferencia</option>
                    <option value="caja">Caja / Efectivo</option>
                  </select>
                </div>
              )}
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
              {accionModal.tipo === 'presentar'
                ? 'Se generará el asiento de liquidación: cruzará anticipos y retenciones contra el IR a pagar.'
                : `Se generará el asiento de pago: DB 2.1.04 IR por Pagar / CR ${formaPago === 'banco' ? '1.1.03 Banco' : '1.1.01 Caja'}`
              }
            </div>

            <div className="flex gap-3">
              <button onClick={() => setAccionModal(null)}
                className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-2.5 text-sm hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={ejecutarAccion} disabled={procesando}
                className="flex-1 bg-red-600 text-white rounded-lg py-2.5 text-sm hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {procesando
                  ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Procesando...</>
                  : accionModal.tipo === 'presentar' ? 'Confirmar Presentación' : 'Confirmar Pago'
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
