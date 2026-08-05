import { createHash } from 'crypto'
import { readFile } from 'fs/promises'
import path from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ValidadorVETCompliance } from '@/lib/validaciones/vet-compliance'

interface BodyPlanillaIngresos {
  periodo_desde: string
  periodo_hasta: string
  usuario_id: string
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ empresa_id: string }> }) {
  const { empresa_id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = (await req.json()) as BodyPlanillaIngresos
  const { periodo_desde, periodo_hasta, usuario_id } = body
  if (!periodo_desde || !periodo_hasta) {
    return NextResponse.json({ error: 'periodo_desde y periodo_hasta son requeridos' }, { status: 400 })
  }

  const [{ data: empNat }, { data: empJur }] = await Promise.all([
    supabase.from('empresas_persona_natural').select('*').eq('id', empresa_id).maybeSingle(),
    supabase.from('empresas_juridicas').select('*').eq('id', empresa_id).maybeSingle(),
  ])
  const empresa = empNat ?? empJur
  if (!empresa) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

  const { data: facturas, error: errorFacturas } = await supabase
    .from('facturas')
    .select('*, cliente:clientes(nombre, ruc, cedula)')
    .eq('empresa_id', empresa_id)
    .gte('fecha_emision', periodo_desde)
    .lte('fecha_emision', periodo_hasta)
    .in('estado', ['emitida', 'pagada'])
    .order('fecha_emision')

  if (errorFacturas) return NextResponse.json({ error: errorFacturas.message }, { status: 500 })

  const detalleFacturas = (facturas ?? []).map((f) => ({
    numero_factura: f.numero_factura,
    fecha_emision: f.fecha_emision,
    cliente_nombre: (f.cliente as { nombre?: string } | null)?.nombre ?? f.cliente_nombre ?? 'Consumidor final',
    cliente_ruc: (f.cliente as { ruc?: string; cedula?: string } | null)?.ruc ??
                 (f.cliente as { ruc?: string; cedula?: string } | null)?.cedula ?? '',
    subtotal: Number(f.subtotal),
    iva_total: Number(f.iva_total),
    total: Number(f.total),
  }))

  const ventasGravadas = detalleFacturas.filter((f) => f.iva_total > 0).reduce((acc, f) => acc + f.subtotal, 0)
  const ventasExentas = detalleFacturas.filter((f) => f.iva_total === 0).reduce((acc, f) => acc + f.subtotal, 0)
  // El esquema actual no distingue ventas de bienes vs. servicios en productos/facturas.
  const servicios = 0
  const libroVentas = detalleFacturas.map((f) => ({ subtotal: f.subtotal }))

  const validaciones = ValidadorVETCompliance.validarPlanillaIngresos(ventasGravadas, ventasExentas, servicios, libroVentas)
  const resumenValidacion = ValidadorVETCompliance.generarResumen(validaciones)

  const resumenFinanciero = {
    ventas_gravadas: ventasGravadas,
    ventas_exentas: ventasExentas,
    servicios,
    total_planilla: ventasGravadas + ventasExentas + servicios,
    cantidad_facturas: detalleFacturas.length,
  }

  const empresaNombre = (empresa as { nombre_empresa?: string; nombre_completo?: string }).nombre_empresa ??
    (empresa as { nombre_completo?: string }).nombre_completo ?? ''

  // Se parte de la plantilla OFICIAL de la DGI (la misma que usa
  // /dashboard/reportes) y solo se llenan las celdas de valores: los
  // textos, hojas y estructura quedan idénticos a lo que la VET espera.
  const XLSX = await import('xlsx-js-style')
  const rutaPlantilla = path.join(process.cwd(), 'public', 'plantillas-vet', 'dgi-planilla-ingresos-dmi-v2.xlsx')
  const bufferPlantilla = await readFile(rutaPlantilla)
  const wb = XLSX.read(bufferPlantilla, { type: 'buffer', cellStyles: true })
  const ws1 = wb.Sheets['Con 25 filas y Datos de Factura']
  if (!ws1) return NextResponse.json({ error: 'La plantilla oficial no tiene la hoja esperada' }, { status: 500 })

  const brutosSinIVA = resumenFinanciero.total_planilla

  // Valores de la columna B (filas 2-25 de la plantilla oficial)
  const valores: Record<string, number> = {
    B2: ventasGravadas,   // Base Imponible para determinar el IVA
    B3: ventasGravadas,   // Ingresos gravados del mes (tasa 15%)
    B4: 0,                // Energía eléctrica subsidiada (tasa 7%)
    B5: 0,                // Exportación de bienes tangibles
    B6: 0,                // Exportación de bienes intangibles
    B7: ventasExentas,    // Ingresos del mes exentos
    B8: 0,                // Ingresos del mes exonerados
    B9: 0,                // Base Imponible para determinar ISC
    B10: 0, B11: 0, B12: 0, B13: 0, B14: 0, B15: 0, B16: 0, B17: 0, B18: 0,
    B19: brutosSinIVA,    // Base Imponible para determinar PMD o Anticipo
    B20: brutosSinIVA,    // Ingresos brutos del mes
    B21: 0,               // Margen de comercialización
    B22: 0,               // Utilidades del mes
    B23: 0,               // Base impuesto Casino
    B24: 0,               // Total máquinas de juegos
    B25: 0,               // Cantidad de mesas de juego
  }
  for (const [celda, valor] of Object.entries(valores)) {
    XLSX.utils.sheet_add_aoa(ws1, [[valor]], { origin: celda })
  }

  // Rango de facturas por serie (desde la fila 27, bajo el encabezado
  // "Sucursales" de la fila 26): agrupa por prefijo de serie y toma
  // min/max numérico, no lexicográfico.
  if (detalleFacturas.length > 0) {
    const porSerie = new Map<string, { min: string; max: string; minN: number; maxN: number }>()
    for (const f of detalleFacturas) {
      const num = f.numero_factura ?? ''
      const serie = num.includes('-') ? num.split('-')[0] : ''
      const n = parseInt(num.replace(/\D/g, ''), 10) || 0
      const actual = porSerie.get(serie)
      if (!actual) porSerie.set(serie, { min: num, max: num, minN: n, maxN: n })
      else {
        if (n < actual.minN) { actual.min = num; actual.minN = n }
        if (n > actual.maxN) { actual.max = num; actual.maxN = n }
      }
    }
    let fila = 27
    for (const [serie, r] of porSerie) {
      XLSX.utils.sheet_add_aoa(ws1, [[empresaNombre, r.min, r.max, serie]], { origin: `A${fila}` })
      fila++
    }
  }

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  const hashArchivo = createHash('sha256').update(buffer).digest('hex')
  const nombreArchivo = `${empresa_id}/planilla-ingresos_${periodo_desde}_${periodo_hasta}_${Date.now()}.xlsx`

  const admin = createAdminClient()
  const { error: errorUpload } = await admin.storage
    .from('reportes-vet')
    .upload(nombreArchivo, buffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
  if (errorUpload) return NextResponse.json({ error: errorUpload.message }, { status: 500 })

  const { data: signedUrlData } = await admin.storage
    .from('reportes-vet')
    .createSignedUrl(nombreArchivo, 60 * 60)

  const { data: reporteVet } = await supabase
    .from('reportes_vet')
    .select('id')
    .eq('codigo', 'PLANILLA_INGRESOS')
    .maybeSingle()

  const { error: errorAuditoriaExport } = await supabase.from('auditoría_exportaciones_vet').insert({
    empresa_id,
    usuario_id: usuario_id ?? user.id,
    reporte_id: reporteVet?.id ?? null,
    'período_desde': periodo_desde,
    'período_hasta': periodo_hasta,
    cantidad_registros: detalleFacturas.length,
    hash_archivo: hashArchivo,
    validaciones_ejecutadas: resumenValidacion,
    errores_encontrados: validaciones.filter((v) => v.tipo === 'error').map((v) => v.mensaje),
    advertencias: validaciones.filter((v) => v.tipo === 'warning').map((v) => v.mensaje),
    estado: resumenValidacion.es_valido ? 'completado' : 'completado_con_errores',
    archivo_url: nombreArchivo,
    'exportado_en': new Date().toISOString(),
  })
  if (errorAuditoriaExport) return NextResponse.json({ error: errorAuditoriaExport.message }, { status: 403 })

  await supabase.from('auditoría_eventos_vet').insert({
    empresa_id,
    usuario_id: usuario_id ?? user.id,
    tipo_evento: 'exportacion_planilla_ingresos',
    entidad_afectada: 'reportes_vet',
    'período_desde': periodo_desde,
    'período_hasta': periodo_hasta,
    detalles: resumenFinanciero,
    es_exitoso: resumenValidacion.es_valido,
    errores: validaciones.filter((v) => v.tipo === 'error').map((v) => v.mensaje),
    advertencias: validaciones.filter((v) => v.tipo === 'warning').map((v) => v.mensaje),
  })

  return NextResponse.json({
    resumen: resumenFinanciero,
    validacion: { detalle: validaciones, resumen: resumenValidacion },
    archivo: {
      ruta: nombreArchivo,
      hash_sha256: hashArchivo,
      url_firmada: signedUrlData?.signedUrl ?? null,
    },
  }, { status: 201 })
}
