// ─── Empresa / Usuario ────────────────────────────────────────────────────────

export type TipoEmpresa = "persona_natural" | "cuota_fija" | "persona_juridica";

export interface EmpresaPersonaNatural {
  id: string;
  user_id: string;
  tipo_empresa: "persona_natural" | "cuota_fija";
  nombre_completo: string;
  numero_cedula: string;
  numero_ruc: string;
  direccion: string;
  ciudad: string;
  departamento: string;
  correo_electronico: string;
  telefono: string;
  sitio_web?: string;
  logo_url?: string;
  created_at: string;
  updated_at: string;
}

export interface EmpresaJuridica {
  id: string;
  user_id: string;
  tipo_empresa: "persona_juridica";
  nombre_empresa: string;
  nombre_comercial: string;
  numero_ruc: string; // 14 dígitos
  nombre_representante_legal: string;
  direccion_legal: string;
  correo_electronico: string;
  sitio_web?: string;
  logo_url?: string;
  created_at: string;
  updated_at: string;
}

export type Empresa = EmpresaPersonaNatural | EmpresaJuridica;

// ─── Clientes ─────────────────────────────────────────────────────────────────

export interface Cliente {
  id: string;
  empresa_id: string;
  nombre: string;
  ruc?: string;
  cedula?: string;
  direccion?: string;
  telefono?: string;
  correo?: string;
  tipo: "contado" | "credito";
  limite_credito?: number;
  activo: boolean;
  created_at: string;
}

// ─── Proveedores ──────────────────────────────────────────────────────────────

export interface Proveedor {
  id: string;
  empresa_id: string;
  nombre: string;
  ruc?: string;
  direccion?: string;
  telefono?: string;
  correo?: string;
  contacto?: string;
  activo: boolean;
  created_at: string;
}

// ─── Productos / Inventario ───────────────────────────────────────────────────

export type UnidadMedida =
  | "unidad"
  | "caja"
  | "kg"
  | "gr"
  | "litro"
  | "ml"
  | "metro"
  | "par"
  | "docena"
  | "servicio";

export interface Categoria {
  id: string;
  empresa_id: string;
  nombre: string;
  descripcion?: string;
}

export interface Producto {
  id: string;
  empresa_id: string;
  codigo: string;
  nombre: string;
  descripcion?: string;
  categoria_id?: string;
  categoria?: Categoria;
  unidad_medida: UnidadMedida;
  precio_compra: number;
  precio_venta: number;
  stock_actual: number;
  stock_minimo: number;
  aplica_iva: boolean;
  activo: boolean;
  created_at: string;
}

// ─── Facturas de Venta ────────────────────────────────────────────────────────

export type EstadoFactura = "borrador" | "emitida" | "pagada" | "anulada";
export type TipoPago = "contado" | "credito" | "transferencia" | "cheque" | "tarjeta";

export interface DetalleFactura {
  id: string;
  factura_id: string;
  producto_id: string;
  producto?: Producto;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  descuento_pct: number;
  subtotal: number;
  iva: number;
  total: number;
}

export interface Factura {
  id: string;
  empresa_id: string;
  numero_factura: string;
  cliente_id: string;
  cliente?: Cliente;
  fecha_emision: string;
  fecha_vencimiento?: string;
  tipo_pago: TipoPago;
  estado: EstadoFactura;
  subtotal: number;
  descuento_total: number;
  iva_total: number;
  total: number;
  notas?: string;
  detalles?: DetalleFactura[];
  created_at: string;
}

// ─── Compras ──────────────────────────────────────────────────────────────────

export type EstadoCompra = "borrador" | "recibida" | "pagada" | "anulada";

export interface DetalleCompra {
  id: string;
  compra_id: string;
  producto_id: string;
  producto?: Producto;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  iva: number;
  total: number;
}

export interface Compra {
  id: string;
  empresa_id: string;
  numero_compra: string;
  proveedor_id: string;
  proveedor?: Proveedor;
  fecha_compra: string;
  fecha_vencimiento?: string;
  tipo_pago: TipoPago;
  estado: EstadoCompra;
  subtotal: number;
  iva_total: number;
  total: number;
  notas?: string;
  detalles?: DetalleCompra[];
  created_at: string;
}

// ─── Reportes DGI ─────────────────────────────────────────────────────────────

export interface ResumenMensual {
  mes: number;
  anio: number;
  total_ventas: number;
  total_iva_ventas: number;
  total_compras: number;
  total_iva_compras: number;
  iva_a_pagar: number;
  total_facturas: number;
  total_comprobantes: number;
}

// ─── Departamentos Nicaragua ───────────────────────────────────────────────────

export const DEPARTAMENTOS_NICARAGUA = [
  "Boaco",
  "Carazo",
  "Chinandega",
  "Chontales",
  "Estelí",
  "Granada",
  "Jinotega",
  "León",
  "Madriz",
  "Managua",
  "Masaya",
  "Matagalpa",
  "Nueva Segovia",
  "Río San Juan",
  "Rivas",
  "RAAN",
  "RAAS",
] as const;

export type Departamento = (typeof DEPARTAMENTOS_NICARAGUA)[number];

// ─── IVA Nicaragua ────────────────────────────────────────────────────────────

export const IVA_NICARAGUA = 0.15; // 15%
export const IR_RETENCION = 0.02;  // 2% IR en la fuente

// ─── Fase 5: Activos Fijos y Depreciación ─────────────────────────────────────

export type CategoriaActivoFijo =
  | 'edificio'           // 5% LCT art. 45
  | 'equipo_produccion'  // 20%
  | 'vehiculo'           // 20%
  | 'mobiliario'         // 20%
  | 'equipo_tic'         // 50%
  | 'otro'               // 10%

export interface ActivoFijo {
  id: string
  empresa_id: string
  codigo: string
  nombre: string
  descripcion?: string
  categoria: CategoriaActivoFijo
  tasa_depreciacion_anual: number
  costo_adquisicion: number
  valor_residual: number
  valor_en_libros: number
  fecha_adquisicion: string
  fecha_inicio_dep: string
  vida_util_anios: number
  vida_util_meses: number
  metodo_depreciacion: 'linea_recta'
  proveedor_id?: string
  ref_compra_id?: string
  ubicacion?: string
  cuenta_activo_id?: string
  cuenta_dep_acum_id?: string
  cuenta_gasto_dep_id?: string
  estado: 'activo' | 'depreciado' | 'vendido' | 'dado_de_baja'
  created_at: string
}

export interface Depreciacion {
  id: string
  empresa_id: string
  activo_id: string
  periodo_id?: string
  anio: number
  mes: number
  fecha_dep: string
  cuota_mensual: number
  dep_acumulada_ant: number
  dep_acumulada_post: number
  valor_en_libros: number
  estado: 'calculada' | 'contabilizada' | 'anulada'
}

export interface ActivoIntangible {
  id: string
  empresa_id: string
  codigo: string
  nombre: string
  tipo: 'patente' | 'marca' | 'gastos_organizacion' | 'gastos_preoperativos' | 'licencia_software' | 'otro'
  costo_adquisicion: number
  valor_en_libros: number
  fecha_adquisicion: string
  vida_util_anios: number
  vida_util_meses: number
  tasa_amortizacion_anual: number
  estado: 'activo' | 'amortizado' | 'dado_de_baja'
}

// ─── Fase 6: Tributación ─────────────────────────────────────────────────────

export interface DeclaracionIrAnual {
  id: string
  empresa_id: string
  anio_fiscal: number
  fecha_inicio_periodo: string
  fecha_fin_periodo: string
  renta_bruta_actividades: number
  otras_rentas_gravables: number
  total_renta_bruta: number
  costo_ventas: number
  gastos_administracion: number
  gastos_ventas: number
  depreciacion_fiscal: number
  gastos_nomina: number
  otros_gastos_deducibles: number
  total_costos_gastos: number
  renta_neta_gravable: number
  ir_30_pct: number
  pago_minimo_definitivo: number
  ir_a_pagar: number
  anticipos_pagados: number
  retenciones_recibidas: number
  ir_neto_pagar: number
  estado: 'borrador' | 'presentada' | 'pagada' | 'auditada'
  numero_declaracion?: string
}

export interface AnticipoIr {
  id: string
  empresa_id: string
  anio: number
  mes: number
  fecha_vencimiento: string
  ingresos_brutos_mes: number
  tasa: number
  monto_anticipo: number
  retenciones_recibidas: number
  monto_a_pagar: number
  estado: 'pendiente' | 'declarado' | 'pagado' | 'exento'
  numero_boleta?: string
}

export interface CalendarioTributario {
  id: string
  empresa_id: string
  anio: number
  tipo_obligacion: string
  descripcion: string
  fecha_vencimiento: string
  monto_estimado?: number
  estado: 'pendiente' | 'presentado' | 'pagado' | 'exento' | 'vencido'
  alerta_dias_antes: number
}

// ─── Fase 7: Funciones Contables Avanzadas ────────────────────────────────────

export interface AbonoCxC {
  id: string
  empresa_id: string
  factura_id: string
  cliente_id?: string
  fecha: string
  monto: number
  forma_pago: 'efectivo' | 'transferencia' | 'cheque' | 'tarjeta' | 'otro'
  referencia?: string
  estado: 'aplicado' | 'anulado'
}

export interface AbonoCxP {
  id: string
  empresa_id: string
  compra_id: string
  proveedor_id?: string
  fecha: string
  monto: number
  forma_pago: 'efectivo' | 'transferencia' | 'cheque' | 'tarjeta' | 'otro'
  referencia?: string
  estado: 'aplicado' | 'anulado'
}

export interface SaldoCxC {
  factura_id: string
  empresa_id: string
  numero_factura: string
  fecha_emision: string
  fecha_vencimiento?: string
  monto_original: number
  total_abonado: number
  saldo_pendiente: number
  estado_cobro: 'vigente' | 'vencida' | 'pagada'
  dias_vencido: number
  cliente_id: string
}

export interface SaldoCxP {
  compra_id: string
  empresa_id: string
  numero_compra: string
  fecha_compra: string
  fecha_vencimiento?: string
  monto_original: number
  total_abonado: number
  saldo_pendiente: number
  estado_pago: 'vigente' | 'vencida' | 'pagada'
  dias_vencido: number
  proveedor_id: string
}

export interface ConciliacionBancaria {
  id: string
  empresa_id: string
  cuenta_banco_id: string
  anio: number
  mes: number
  fecha_corte: string
  saldo_segun_banco: number
  saldo_segun_libros: number
  diferencia_total: number
  depositos_en_transito: number
  cheques_pendientes: number
  estado: 'en_proceso' | 'conciliado' | 'aprobado'
}

export interface NotaCreditoDebito {
  id: string
  empresa_id: string
  tipo: 'credito' | 'debito'
  numero_nota: string
  ref_factura_id?: string
  ref_compra_id?: string
  cliente_id?: string
  proveedor_id?: string
  fecha: string
  motivo: string
  subtotal: number
  iva: number
  total: number
  estado: 'emitida' | 'aplicada' | 'anulada'
}

// ─── Tasas LCT Referencia Rápida ─────────────────────────────────────────────

export const TASAS_DEPRECIACION_LCT: Record<string, number> = {
  edificio:          0.05,
  equipo_produccion: 0.20,
  vehiculo:          0.20,
  mobiliario:        0.20,
  equipo_tic:        0.50,
  otro:              0.10,
}

export const TASA_IR_ANUAL        = 0.30   // LCT art. 52
export const TASA_PMD             = 0.01   // Pago Mínimo Definitivo LCT art. 55
export const TASA_ANTICIPO_IR     = 0.01   // LCT art. 63
export const TASA_IMI             = 0.01   // Plan Arbitrios Municipal
export const TASA_MATRICULA_ALCALDIA = 0.02 // Plan Arbitrios Municipal
export const TASA_AMORTIZACION_INTANGIBLES = 0.3333 // LCT art. 45 lit. 6-8 (3 años)
