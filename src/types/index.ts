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
