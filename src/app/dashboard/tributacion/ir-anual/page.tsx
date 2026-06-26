'use client'
import { useState, useEffect } from 'react'
import { FileText, Calculator, CheckCircle } from 'lucide-react'

interface DeclaracionIR {
  id: string
  anio_fiscal: number
  renta_bruta_actividades: number
  total_costos_gastos: number
  renta_neta_gravable: number
  ir_30_pct: number
  pago_minimo_definitivo: number
  ir_a_pagar: number
  anticipos_pagados: number
  ir_neto_pagar: number
  estado: string
  fecha_presentacion?: string
}

const fmt = (n: number) => new Intl.NumberFormat('es-NI', { style: 'currency', currency: 'NIO' }).format(n ?? 0)

export default function IrAnualPage() {
  const [declaraciones, setDeclaraciones] = useState<DeclaracionIR[]>([])
  const [loading, setLoading] = useState(true)
  const [empresaId, setEmpresaId] = useState('')
  const [calculando, setCalculando] = useState(false)
  const [anioCalculo, setAnioCalculo] = useState(new Date().getFullYear() - 1)

  useEffect(() => {
    const eid = localStorage.getItem('empresa_id') || ''
    setEmpresaId(eid)
    if (eid) fetchDeclaraciones(eid)
  }, [])

  async function fetchDeclaraciones(eid: string) {
    setLoading(true)
    const r = await fetch(`/api/tributacion/ir-anual?empresa_id=${eid}`)
    const d = await r.json()
    setDeclaraciones(Array.isArray(d) ? d : [])
    setLoading(false)
  }

  async function calcularAutomatico() {
    setCalculando(true)
    const r = await fetch('/api/tributacion/ir-anual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        empresa_id: empresaId,
        anio_fiscal: anioCalculo,
        calcular_automatico: true
      })
    })
    setCalculando(false)
    if (r.ok) fetchDeclaraciones(empresaId)
    else {
      const d = await r.json()
      alert('Error: ' + d.error)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">IR Anual — Declaración Formulario 106</h1>
          <p className="text-sm text-gray-500 mt-1">LCT Art. 52 y 55 · Vencimiento: 28 de febrero del año siguiente · Portal VET DGI</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={anioCalculo} onChange={e => setAnioCalculo(parseInt(e.target.value))} className="border rounded-lg px-3 py-2 text-sm">
            {[2022,2023,2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button
            onClick={calcularAutomatico}
            disabled={calculando}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            <Calculator size={16} />
            {calculando ? 'Calculando...' : `Calcular IR ${anioCalculo}`}
          </button>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        <strong>Cálculo automático:</strong> El sistema lee ventas, compras, nómina y depreciación
        del año seleccionado para precalcular el Formulario 106. El resultado debe revisarse y
        ajustarse antes de presentar en el portal VET de la DGI.
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Cargando...</div>
      ) : declaraciones.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <FileText size={48} className="mx-auto mb-3 opacity-30" />
          <p>No hay declaraciones. Use <strong>Calcular IR</strong> para generar la primera.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {declaraciones.map(d => (
            <div key={d.id} className="border rounded-xl p-6 bg-white shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold">Declaración IR Anual {d.anio_fiscal}</h2>
                <span className={`text-sm px-3 py-1 rounded-full ${
                  d.estado === 'pagada' ? 'bg-green-100 text-green-700' :
                  d.estado === 'presentada' ? 'bg-blue-100 text-blue-700' :
                  'bg-gray-100 text-gray-600'
                }`}>{d.estado.toUpperCase()}</span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Renta Bruta</p>
                  <p className="font-bold text-gray-800">{fmt(d.renta_bruta_actividades)}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Total Costos/Gastos</p>
                  <p className="font-bold text-gray-800">{fmt(d.total_costos_gastos)}</p>
                </div>
                <div className="bg-blue-50 rounded-lg p-3">
                  <p className="text-xs text-blue-600">Renta Neta Gravable</p>
                  <p className="font-bold text-blue-800">{fmt(d.renta_neta_gravable)}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">IR 30% sobre Renta Neta</p>
                  <p className="font-bold text-gray-800">{fmt(d.ir_30_pct)}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Pago Mínimo (1% ingresos)</p>
                  <p className="font-bold text-gray-800">{fmt(d.pago_minimo_definitivo)}</p>
                </div>
                <div className="bg-amber-50 rounded-lg p-3">
                  <p className="text-xs text-amber-600">IR a Pagar (el mayor)</p>
                  <p className="font-bold text-amber-800">{fmt(d.ir_a_pagar)}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">Anticipos Acreditados</p>
                  <p className="font-bold text-gray-800">- {fmt(d.anticipos_pagados)}</p>
                </div>
                <div className="bg-red-50 rounded-lg p-3 col-span-2">
                  <p className="text-xs text-red-600 font-semibold">IR NETO A PAGAR</p>
                  <p className="text-2xl font-bold text-red-700">{fmt(d.ir_neto_pagar)}</p>
                  <p className="text-xs text-gray-500 mt-1">Vence: 28 de febrero {d.anio_fiscal + 1}</p>
                </div>
              </div>

              {d.ir_neto_pagar <= 0 && (
                <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-3 flex gap-2">
                  <CheckCircle size={18} className="text-green-600" />
                  <p className="text-sm text-green-800">Los anticipos pagados cubren la totalidad del IR. No hay saldo adicional a pagar.</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
