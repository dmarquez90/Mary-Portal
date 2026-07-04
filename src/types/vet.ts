// Tipos del módulo VET (Validación, Evaluación y Trazabilidad).
// Reflejan las columnas reales de reportes_vet y auditoría_exportaciones_vet
// (Phase 8a) — no la forma final deseada, sino la que ya existe en Postgres.

export interface ReporteVET {
  id: string;
  codigo: string;
  nombre_oficial: string;
  descripcion: string | null;
  regimen_tributario_id: string | null;
  frecuencia: string | null;
  es_obligatorio: boolean | null;
  estado: string | null;
}

export interface AuditoriaExportacionVET {
  id: string;
  empresa_id: string;
  usuario_id: string;
  reporte_id: string | null;
  período_desde: string | null;
  período_hasta: string | null;
  cantidad_registros: number | null;
  hash_archivo: string | null;
  // Valores reales emitidos por el backend: 'completado' | 'completado_con_errores'.
  // Se tipa como string porque la columna es texto libre, sin CHECK constraint.
  estado: string;
  archivo_url: string | null;
  exportado_en: string | null;
  errores_encontrados: string[] | null;
  advertencias: string[] | null;
  reporte?: { codigo: string; nombre_oficial: string } | null;
}

export interface RegimenTributario {
  id: string;
  nombre: string;
}

export interface Empresa {
  id: string;
  nombre_empresa?: string;
  nombre_completo?: string;
  regimen_tributario_id: string | null;
  regimen?: RegimenTributario | null;
}

// Forma de la respuesta de POST /api/vet/[empresa_id]/validacion
export interface ResultadoValidacionReporte {
  codigo: string;
  ejecutado: boolean;
  mensaje?: string;
}

export interface ResumenValidacionVET {
  total: number;
  errores: number;
  advertencias: number;
  es_valido: boolean;
}

export interface RespuestaValidacionVET {
  resultados: ResultadoValidacionReporte[];
  resumen: ResumenValidacionVET;
}

// Forma de la respuesta de POST /api/vet/[empresa_id]/planilla-ingresos
export interface RespuestaPlanillaIngresos {
  resumen: {
    ventas_gravadas: number;
    ventas_exentas: number;
    servicios: number;
    total_planilla: number;
    cantidad_facturas: number;
  };
  validacion: {
    resumen: ResumenValidacionVET;
  };
  archivo: {
    ruta: string;
    hash_sha256: string;
    url_firmada: string | null;
  };
}
