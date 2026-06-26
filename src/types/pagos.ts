// ============================================================
// SARA App – Types: Pagos, Caja y Bancos
// src/types/pagos.ts
// ============================================================

export type TipoPago =
  | 'efectivo'
  | 'transferencia'
  | 'cheque'
  | 'tarjeta'
  | 'tarjeta_debito'
  | 'tarjeta_credito'

export type EstadoPago = 'registrado' | 'anulado'

export type EstadoFactura = 'emitida' | 'parcial' | 'pagada' | 'anulada'
export type EstadoCompra  = 'pendiente' | 'parcial' | 'pagada' | 'anulada'

export type TipoCuenta    = 'caja_general' | 'caja_chica'
export type TipoBanco     = 'corriente' | 'ahorro' | 'tarjeta'
export type TipoCheque    = 'emitido' | 'recibido'
export type EstadoCheque  = 'activo' | 'cobrado' | 'anulado' | 'vencido'
export type TipoMovCaja   = 'ingreso' | 'egreso'
export type EstadoMovCaja = 'registrado' | 'anulado'
export type EstadoTxBanco = 'registrado' | 'anulado' | 'conciliado'

// ── Cuenta Caja ──────────────────────────────────────────────
export interface CuentaCaja {
  id: string
  empresa_id: string
  nombre: string
  tipo: TipoCuenta
  saldo_inicial: number
  saldo_actual: number
  moneda: 'NIO' | 'USD'
  limite_caja_chica?: number
  activa: boolean
  notas?: string
  created_at: string
  updated_at: string
}

export interface NuevaCuentaCaja {
  empresa_id: string
  nombre: string
  tipo: TipoCuenta
  saldo_inicial: number
  moneda?: 'NIO' | 'USD'
  limite_caja_chica?: number
  notas?: string
}

// ── Cuenta Banco ─────────────────────────────────────────────
export interface CuentaBanco {
  id: string
  empresa_id: string
  nombre: string
  banco?: string
  numero_cuenta?: string
  tipo: TipoBanco
  moneda: 'NIO' | 'USD'
  saldo_inicial: number
  saldo_actual: number
  activa: boolean
  notas?: string
  created_at: string
  updated_at: string
}

export interface NuevaCuentaBanco {
  empresa_id: string
  nombre: string
  banco?: string
  numero_cuenta?: string
  tipo: TipoBanco
  moneda?: 'NIO' | 'USD'
  saldo_inicial: number
  notas?: string
}

// ── Movimiento Caja ──────────────────────────────────────────
export interface MovimientoCaja {
  id: string
  empresa_id: string
  cuenta_caja_id?: string
  tipo: TipoMovCaja
  monto: number
  descripcion: string
  fecha: string
  ref_factura_id?: string
  ref_compra_id?: string
  pago_id?: string
  asiento_id?: string
  estado: EstadoMovCaja
  notas?: string
  created_at: string
  created_by?: string
  // Joins
  cuenta_caja?: Pick<CuentaCaja, 'id' | 'nombre'>
}

// ── Transacción Banco ─────────────────────────────────────────
export interface TransaccionBanco {
  id: string
  empresa_id: string
  cuenta_banco_id?: string
  tipo: TipoPago
  monto: number
  monto_usd?: number
  tipo_cambio?: number
  descripcion: string
  fecha: string
  referencia?: string
  ref_factura_id?: string
  ref_compra_id?: string
  pago_id?: string
  asiento_id?: string
  estado: EstadoTxBanco
  notas?: string
  created_at: string
  created_by?: string
  // Joins
  cuenta_banco?: Pick<CuentaBanco, 'id' | 'nombre' | 'banco'>
}

// ── Cheque ───────────────────────────────────────────────────
export interface Cheque {
  id: string
  empresa_id: string
  cuenta_banco_id?: string
  numero_cheque: string
  tipo: TipoCheque
  monto: number
  beneficiario?: string
  fecha_emision: string
  fecha_vencimiento?: string
  ref_factura_id?: string
  ref_compra_id?: string
  transaccion_banco_id?: string
  estado: EstadoCheque
  notas?: string
  created_at: string
  // Joins
  cuenta_banco?: Pick<CuentaBanco, 'id' | 'nombre' | 'banco'>
  dias_para_vencer?: number
}

// ── Pago ─────────────────────────────────────────────────────
export interface Pago {
  id: string
  empresa_id: string
  ref_factura_id?: string
  ref_compra_id?: string
  tipo_pago: TipoPago
  monto: number
  fecha: string
  referencia?: string
  numero_cheque?: string
  comision_pct: number
  monto_comision: number
  notas?: string
  movimiento_caja_id?: string
  transaccion_banco_id?: string
  cheque_id?: string
  asiento_id?: string
  estado: EstadoPago
  created_at: string
  created_by?: string
}

export interface NuevoPago {
  empresa_id: string
  ref_factura_id?: string
  ref_compra_id?: string
  tipo_pago: TipoPago
  monto: number
  fecha: string
  referencia?: string
  numero_cheque?: string
  comision_pct?: number
  monto_comision?: number
  notas?: string
}

// ── Pago en formulario (múltiples pagos por factura) ─────────
export interface PagoFormulario {
  tipo_pago: TipoPago
  monto: number
  referencia?: string
  numero_cheque?: string
  comision_pct?: number
}

// ── Resúmenes ─────────────────────────────────────────────────
export interface ResumenCaja {
  total_cuentas: number
  saldo_total: number
  ingresos_hoy: number
  egresos_hoy: number
  movimientos_hoy: number
}

export interface ResumenBancos {
  total_cuentas: number
  saldo_total_nio: number
  cheques_activos: number
  cheques_por_vencer: number
}

// ── Etiquetas UI ─────────────────────────────────────────────
export const TIPO_PAGO_LABELS: Record<TipoPago, string> = {
  efectivo:       'Efectivo',
  transferencia:  'Transferencia',
  cheque:         'Cheque',
  tarjeta:        'Tarjeta',
  tarjeta_debito: 'Tarjeta Débito',
  tarjeta_credito:'Tarjeta Crédito',
}

export const TIPO_PAGO_COLORS: Record<TipoPago, string> = {
  efectivo:       'bg-green-100 text-green-700',
  transferencia:  'bg-blue-100 text-blue-700',
  cheque:         'bg-purple-100 text-purple-700',
  tarjeta:        'bg-orange-100 text-orange-700',
  tarjeta_debito: 'bg-orange-100 text-orange-700',
  tarjeta_credito:'bg-red-100 text-red-700',
}

export const ESTADO_CHEQUE_COLORS: Record<EstadoCheque, string> = {
  activo:   'bg-green-100 text-green-700',
  cobrado:  'bg-blue-100 text-blue-700',
  anulado:  'bg-red-100 text-red-700',
  vencido:  'bg-gray-100 text-gray-700',
}

// ── Utilidad: redondear a 2 decimales ─────────────────────────
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

// ── Utilidad: formatear moneda NIO ───────────────────────────
export function formatNIO(value: number): string {
  return new Intl.NumberFormat('es-NI', {
    style: 'currency',
    currency: 'NIO',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(round2(value))
}

// ── Utilidad: formatear moneda USD ───────────────────────────
export function formatUSD(value: number): string {
  return new Intl.NumberFormat('es-NI', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(round2(value))
}
