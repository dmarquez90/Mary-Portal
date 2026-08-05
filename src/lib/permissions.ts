// Matriz de permisos de Siconic (mismo patrón que usePermissions.js de Mary,
// adaptado a rol-por-empresa en vez de rol global). Esta matriz es el espejo
// exacto de matriz_permisos_seed en Postgres (migración rbac_02) — si se
// cambia un valor aquí, debe cambiarse también ahí.

export type Rol = "admin" | "contador" | "auxiliar" | "ventas" | "cajero";

export const MATRIX = {
  dashboard_ver:                 { admin: true, contador: true,  auxiliar: true,  ventas: true,  cajero: true  },

  facturacion_ver:                { admin: true, contador: true,  auxiliar: true,  ventas: true,  cajero: false },
  facturacion_crear:              { admin: true, contador: true,  auxiliar: true,  ventas: true,  cajero: false },
  facturacion_editar_borrador:    { admin: true, contador: true,  auxiliar: true,  ventas: false, cajero: false },
  facturacion_anular:             { admin: true, contador: true,  auxiliar: false, ventas: false, cajero: false },

  compras_ver:                    { admin: true, contador: true,  auxiliar: true,  ventas: false, cajero: false },
  compras_crear:                  { admin: true, contador: false, auxiliar: true,  ventas: false, cajero: false },
  compras_editar_borrador:        { admin: true, contador: false, auxiliar: true,  ventas: false, cajero: false },

  cxc_ver:                        { admin: true, contador: true,  auxiliar: true,  ventas: true,  cajero: false },
  cxp_ver:                        { admin: true, contador: true,  auxiliar: true,  ventas: false, cajero: false },

  inventario_ver:                 { admin: true, contador: true,  auxiliar: true,  ventas: true,  cajero: false },
  inventario_editar:              { admin: true, contador: false, auxiliar: true,  ventas: false, cajero: false },

  asientos_ver:                   { admin: true, contador: true,  auxiliar: true,  ventas: false, cajero: false },
  asientos_crear:                 { admin: true, contador: true,  auxiliar: true,  ventas: false, cajero: false },
  asientos_contabilizar:          { admin: true, contador: true,  auxiliar: false, ventas: false, cajero: false },
  asientos_anular:                { admin: true, contador: true,  auxiliar: false, ventas: false, cajero: false },

  caja_bancos_ver:                { admin: true, contador: true,  auxiliar: true,  ventas: false, cajero: false },
  caja_bancos_editar:             { admin: true, contador: true,  auxiliar: false, ventas: false, cajero: false },

  activos_fijos_ver:              { admin: true, contador: true,  auxiliar: true,  ventas: false, cajero: false },
  activos_fijos_editar:           { admin: true, contador: true,  auxiliar: false, ventas: false, cajero: false },

  // fase 2: contador debería ver totales de nómina sin detalle por empleado
  // (valor 'agregado'). Por ahora, false simple (ver conversación de diseño).
  nomina_ver:                     { admin: true, contador: false, auxiliar: false, ventas: false, cajero: false },
  nomina_editar:                  { admin: true, contador: false, auxiliar: false, ventas: false, cajero: false },

  reportes_dgi_ver:               { admin: true, contador: true,  auxiliar: false, ventas: false, cajero: false },
  reportes_dgi_exportar:          { admin: true, contador: true,  auxiliar: false, ventas: false, cajero: false },

  vet_ver:                        { admin: true, contador: true,  auxiliar: false, ventas: false, cajero: false },
  vet_editar:                     { admin: true, contador: true,  auxiliar: false, ventas: false, cajero: false },

  cierre_periodo:                 { admin: true, contador: false, auxiliar: false, ventas: false, cajero: false },
  reabrir_periodo:                { admin: true, contador: false, auxiliar: false, ventas: false, cajero: false },

  usuarios_ver:                   { admin: true, contador: false, auxiliar: false, ventas: false, cajero: false },
  usuarios_gestionar:             { admin: true, contador: false, auxiliar: false, ventas: false, cajero: false },

  configuracion:                  { admin: true, contador: false, auxiliar: false, ventas: false, cajero: false },

  // Punto de Venta (espejo de matriz_permisos_seed insertado en
  // 20260705120100_pos_rol_cajero_permisos.sql)
  pos_ver:                        { admin: true, contador: true,  auxiliar: true,  ventas: true,  cajero: true  },
  pos_vender:                     { admin: true, contador: false, auxiliar: false, ventas: true,  cajero: true  },
  pos_caja_propia:                { admin: true, contador: false, auxiliar: false, ventas: false, cajero: true  },
  pos_devolucion:                 { admin: true, contador: false, auxiliar: false, ventas: false, cajero: true  },
} as const satisfies Record<string, Record<Rol, boolean>>;

export type Permiso = keyof typeof MATRIX;

export const NAV_PERMISOS: Record<Rol, string[]> = {
  admin:    ["dashboard","pos","facturacion","compras","inventario","asientos_contables",
             "caja_bancos","activos_fijos","nomina","reportes_dgi","cierre_periodo",
             "usuarios","configuracion","vet"],
  contador: ["dashboard","pos","facturacion","compras","inventario","asientos_contables",
             "caja_bancos","activos_fijos","reportes_dgi","vet"],
  auxiliar: ["dashboard","pos","facturacion","compras","inventario","asientos_contables",
             "caja_bancos","activos_fijos"],
  ventas:   ["dashboard","pos","facturacion","cxc","inventario"],
  cajero:   ["dashboard","pos"],
};

// Módulos editables vía permisos_custom (para el panel de gestión de usuarios)
export const MODULOS_PERMISOS = [
  { id: "facturacion",         label: "Facturación",              tieneEditar: true },
  { id: "compras",             label: "Compras",                  tieneEditar: true },
  { id: "cxc",                 label: "Cuentas por Cobrar",        tieneEditar: false },
  { id: "cxp",                 label: "Cuentas por Pagar",         tieneEditar: false },
  { id: "inventario",          label: "Inventario",                tieneEditar: true },
  { id: "asientos_contables",  label: "Asientos Contables",        tieneEditar: true },
  { id: "caja_bancos",         label: "Caja y Bancos",             tieneEditar: true },
  { id: "activos_fijos",       label: "Activos Fijos",             tieneEditar: true },
  { id: "nomina",              label: "Nómina",                    tieneEditar: true },
  { id: "reportes_dgi",        label: "Reportes DGI",              tieneEditar: true },
  { id: "cierre_periodo",      label: "Cierre de Período",         tieneEditar: true },
  { id: "usuarios",            label: "Usuarios",                  tieneEditar: true },
  { id: "configuracion",       label: "Configuración",             tieneEditar: false },
  { id: "vet",                 label: "Cumplimiento VET",          tieneEditar: true },
  { id: "pos",                 label: "Punto de Venta",            tieneEditar: true },
] as const;

// Mapea cada permiso granular al módulo/tipo que permisos_custom puede
// sobrescribir ({ modulo: { ver, editar } }) — espejo de permiso_modulo_map en Postgres.
export const PERMISO_A_MODULO: Partial<Record<Permiso, [string, "ver" | "editar"]>> = {
  facturacion_ver: ["facturacion", "ver"],
  facturacion_crear: ["facturacion", "editar"],
  facturacion_editar_borrador: ["facturacion", "editar"],
  facturacion_anular: ["facturacion", "editar"],
  compras_ver: ["compras", "ver"],
  compras_crear: ["compras", "editar"],
  compras_editar_borrador: ["compras", "editar"],
  cxc_ver: ["cxc", "ver"],
  cxp_ver: ["cxp", "ver"],
  inventario_ver: ["inventario", "ver"],
  inventario_editar: ["inventario", "editar"],
  asientos_ver: ["asientos_contables", "ver"],
  asientos_crear: ["asientos_contables", "editar"],
  asientos_contabilizar: ["asientos_contables", "editar"],
  asientos_anular: ["asientos_contables", "editar"],
  caja_bancos_ver: ["caja_bancos", "ver"],
  caja_bancos_editar: ["caja_bancos", "editar"],
  activos_fijos_ver: ["activos_fijos", "ver"],
  activos_fijos_editar: ["activos_fijos", "editar"],
  nomina_ver: ["nomina", "ver"],
  nomina_editar: ["nomina", "editar"],
  reportes_dgi_ver: ["reportes_dgi", "ver"],
  reportes_dgi_exportar: ["reportes_dgi", "editar"],
  cierre_periodo: ["cierre_periodo", "editar"],
  reabrir_periodo: ["cierre_periodo", "editar"],
  usuarios_ver: ["usuarios", "ver"],
  usuarios_gestionar: ["usuarios", "editar"],
  configuracion: ["configuracion", "ver"],
  vet_ver: ["vet", "ver"],
  vet_editar: ["vet", "editar"],
  pos_ver: ["pos", "ver"],
  pos_vender: ["pos", "editar"],
  pos_caja_propia: ["pos", "editar"],
  pos_devolucion: ["pos", "editar"],
};

export type PermisosCustom = Record<string, { ver?: boolean; editar?: boolean }>;
