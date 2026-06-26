// ============================================================
// SARA App â€“ Componente: FormularioPago
// src/components/pagos/FormularioPago.tsx
// Soporta pagos simples, mixtos y parciales
// ============================================================
'use client'
import { useState, useEffect } from 'react'
import { Plus, Trash2, CheckCircle, AlertCircle } from 'lucide-react'
import {
  type TipoPago,
  type PagoFormulario,
  TIPO_PAGO_LABELS,
  TIPO_PAGO_COLORS,
  round2,
  formatNIO,
} from '@/types/pagos'
import { registrarPagosMixtos } from '@/lib/pagos/queries'

// â”€â”€ Props â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface FormularioPagoProps {
  empresaId: string
  // Origen: factura o compra
  refFacturaId?: string
  refCompraId?: string
  // Montos
  totalDocumento: number       // Total de la factura/compra
  montoPagado?: number         // Ya pagado anteriormente
  // Callbacks
  onExito: () => void          // Llamado cuando todos los pagos se guardan
  onCancelar: () => void
  // Modo
  modo?: 'cobrar' | 'pagar'   // cobrar = factura, pagar = compra
}

// â”€â”€ Tipos de pago disponibles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const TIPOS_PAGO: TipoPago[] = [
  'efectivo',
  'transferencia',
  'tarjeta_debito',
  'tarjeta_credito',
  'cheque',
]

// â”€â”€ Comisiones por defecto (editables) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const COMISION_DEFAULT: Partial<Record<TipoPago, number>> = {
  tarjeta_credito: 3.00,
  tarjeta_debito:  1.50,
}

export default function FormularioPago({
  empresaId,
  refFacturaId,
  refCompraId,
  totalDocumento,
  montoPagado = 0,
  onExito,
  onCancelar,
  modo = 'cobrar',
}: FormularioPagoProps) {
  const saldoPendiente = round2(totalDocumento - montoPagado)

  // â”€â”€ Estado â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [pagos, setPagos] = useState<PagoFormulario[]>([])
  const [tipoPago, setTipoPago] = useState<TipoPago>('efectivo')
  const [monto, setMonto] = useState<string>('')
  const [referencia, setReferencia] = useState('')
  const [numeroCheque, setNumeroCheque] = useState('')
  const [comisionPct, setComisionPct] = useState<string>('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Calcular total ya agregado en el formulario
  const totalAgregado = round2(pagos.reduce((s, p) => s + p.monto, 0))
  const pendienteRestante = round2(saldoPendiente - totalAgregado)
  const pagosCompletan = totalAgregado >= saldoPendiente && saldoPendiente > 0

  // Al cambiar tipo de pago, auto-llenar comisiÃ³n
  useEffect(() => {
    const def = COMISION_DEFAULT[tipoPago]
    setComisionPct(def !== undefined ? String(def) : '')
  }, [tipoPago])

  // Auto-llenar monto con el pendiente restante
  useEffect(() => {
    if (pendienteRestante > 0) {
      setMonto(String(pendienteRestante))
    } else {
      setMonto('')
    }
  }, [pendienteRestante])

  // â”€â”€ Agregar pago a la lista â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function agregarPago() {
    setError(null)
    const montoNum = round2(parseFloat(monto) || 0)

    if (montoNum <= 0) {
      setError('El monto debe ser mayor a 0')
      return
    }
    if (montoNum > round2(pendienteRestante + 0.01)) {
      setError(`El monto no puede superar el saldo pendiente (${formatNIO(pendienteRestante)})`)
      return
    }
    if (tipoPago === 'cheque' && !numeroCheque.trim()) {
      setError('Ingresa el nÃºmero de cheque')
      return
    }
    if ((tipoPago === 'transferencia') && !referencia.trim()) {
      setError('Ingresa el nÃºmero de referencia de la transferencia')
      return
    }

    const comision = round2(parseFloat(comisionPct) || 0)

    setPagos(prev => [...prev, {
      tipo_pago:    tipoPago,
      monto:        montoNum,
      referencia:   referencia.trim() || undefined,
      numero_cheque: numeroCheque.trim() || undefined,
      comision_pct: comision,
    }])

    // Resetear campos
    setReferencia('')
    setNumeroCheque('')
    setTipoPago('efectivo')
  }

  // â”€â”€ Eliminar pago de la lista â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function eliminarPago(index: number) {
    setPagos(prev => prev.filter((_, i) => i !== index))
  }

  // â”€â”€ Guardar todos los pagos â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  async function guardar() {
    setError(null)
    if (pagos.length === 0) {
      setError('Agrega al menos un pago')
      return
    }

    setGuardando(true)
    try {
      await registrarPagosMixtos(
        empresaId,
        { ref_factura_id: refFacturaId, ref_compra_id: refCompraId },
        pagos.map(p => ({
          tipo_pago:     p.tipo_pago,
          monto:         p.monto,
          referencia:    p.referencia,
          numero_cheque: p.numero_cheque,
          comision_pct:  p.comision_pct,
        }))
      )
      onExito()
    } catch (err: any) {
      setError(err.message ?? 'Error al guardar los pagos')
    } finally {
      setGuardando(false)
    }
  }

  // â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-lg w-full">
      {/* Encabezado */}
      <div className="mb-5">
        <h2 className="text-xl font-bold text-gray-900">
          {modo === 'cobrar' ? 'Registrar Cobro' : 'Registrar Pago'}
        </h2>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500">Total</p>
            <p className="text-sm font-bold text-gray-900">{formatNIO(totalDocumento)}</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-3 text-center">
            <p className="text-xs text-blue-600">Ya pagado</p>
            <p className="text-sm font-bold text-blue-700">{formatNIO(montoPagado + totalAgregado)}</p>
          </div>
          <div className={`rounded-lg p-3 text-center ${pendienteRestante <= 0 ? 'bg-green-50' : 'bg-orange-50'}`}>
            <p className={`text-xs ${pendienteRestante <= 0 ? 'text-green-600' : 'text-orange-600'}`}>Pendiente</p>
            <p className={`text-sm font-bold ${pendienteRestante <= 0 ? 'text-green-700' : 'text-orange-700'}`}>
              {formatNIO(Math.max(0, pendienteRestante))}
            </p>
          </div>
        </div>
      </div>

      {/* Pagos ya agregados */}
      {pagos.length > 0 && (
        <div className="mb-4">
          <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Pagos a registrar</p>
          <div className="space-y-2">
            {pagos.map((p, i) => (
              <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TIPO_PAGO_COLORS[p.tipo_pago]}`}>
                    {TIPO_PAGO_LABELS[p.tipo_pago]}
                  </span>
                  {p.referencia && (
                    <span className="text-xs text-gray-400">Ref: {p.referencia}</span>
                  )}
                  {p.numero_cheque && (
                    <span className="text-xs text-gray-400">Chq: {p.numero_cheque}</span>
                  )}
                  {(p.comision_pct ?? 0) > 0 && (
                    <span className="text-xs text-orange-500">+{p.comision_pct ?? 0}% com.</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900">{formatNIO(p.monto)}</span>
                  <button
                    onClick={() => eliminarPago(i)}
                    className="text-red-400 hover:text-red-600"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Formulario para agregar pago */}
      {!pagosCompletan && (
        <div className="border border-gray-200 rounded-lg p-4 mb-4">
          <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Agregar pago</p>

          {/* Tipo de pago */}
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de pago</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {TIPOS_PAGO.map(t => (
                <button
                  key={t}
                  onClick={() => setTipoPago(t)}
                  className={`text-xs px-2 py-2 rounded-lg border font-medium transition-colors ${
                    tipoPago === t
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  {TIPO_PAGO_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Monto */}
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Monto (NIO)
            </label>
            <input
              type="number"
              value={monto}
              onChange={e => setMonto(e.target.value)}
              onBlur={e => setMonto(String(round2(parseFloat(e.target.value) || 0)))}
              placeholder="0.00"
              step="0.01"
              min="0"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Referencia (transferencia) */}
          {tipoPago === 'transferencia' && (
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                NÃºmero de referencia <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={referencia}
                onChange={e => setReferencia(e.target.value)}
                placeholder="Ej: TRF-2026-001234"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {/* NÃºmero de cheque */}
          {tipoPago === 'cheque' && (
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                NÃºmero de cheque <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={numeroCheque}
                onChange={e => setNumeroCheque(e.target.value)}
                placeholder="Ej: 000123"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {/* ComisiÃ³n (tarjeta) */}
          {(tipoPago === 'tarjeta_debito' || tipoPago === 'tarjeta_credito') && (
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ComisiÃ³n bancaria (%)
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  value={comisionPct}
                  onChange={e => setComisionPct(e.target.value)}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  max="10"
                  className="w-28 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
                {comisionPct && parseFloat(monto) > 0 && (
                  <span className="text-xs text-orange-600">
                    = {formatNIO(round2(parseFloat(monto) * parseFloat(comisionPct) / 100))} de comisiÃ³n
                  </span>
                )}
              </div>
            </div>
          )}

          <button
            onClick={agregarPago}
            className="w-full flex items-center justify-center gap-2 bg-gray-800 text-white px-4 py-2 rounded-lg hover:bg-gray-900 text-sm font-medium"
          >
            <Plus size={16} /> Agregar pago
          </button>
        </div>
      )}

      {/* Mensaje de Ã©xito si completa */}
      {pagosCompletan && (
        <div className="flex items-center gap-2 bg-green-50 text-green-700 rounded-lg px-4 py-3 mb-4 text-sm">
          <CheckCircle size={16} />
          <span>
            {modo === 'cobrar' ? 'Factura cobrada completamente' : 'Compra pagada completamente'}
          </span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Botones */}
      <div className="flex gap-3">
        <button
          onClick={guardar}
          disabled={guardando || pagos.length === 0}
          className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
        >
          {guardando ? 'Guardando...' : `Guardar ${pagos.length > 1 ? `${pagos.length} pagos` : 'pago'}`}
        </button>
        <button
          onClick={onCancelar}
          disabled={guardando}
          className="flex-1 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 text-sm font-medium"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

