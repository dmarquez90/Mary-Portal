import { createHash } from 'crypto'
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

  const XLSX = await import('xlsx-js-style')
  const wb = XLSX.utils.book_new()

  const empresaNombre = (empresa as { nombre_empresa?: string; nombre_completo?: string }).nombre_empresa ??
    (empresa as { nombre_completo?: string }).nombre_completo ?? ''

  const wsResumen = XLSX.utils.aoa_to_sheet([
    ['Planilla de Ingresos - Reporte VET'],
    ['Empresa', empresaNombre],
    ['Período', `${periodo_desde} a ${periodo_hasta}`],
    [],
    ['Concepto', 'Monto (C$)'],
    ['Ventas gravadas', resumenFinanciero.ventas_gravadas],
    ['Ventas exentas', resumenFinanciero.ventas_exentas],
    ['Servicios', resumenFinanciero.servicios],
    ['Total planilla', resumenFinanciero.total_planilla],
    [],
    ['Validación', resumenValidacion.es_valido ? 'Sin errores' : 'Con errores'],
    ['Errores', resumenValidacion.errores],
    ['Advertencias', resumenValidacion.advertencias],
  ])
  XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen')

  const headerDetalle = ['N° Factura', 'Fecha', 'Cliente', 'RUC/Cédula', 'Subtotal', 'IVA', 'Total']
  const filasDetalle = detalleFacturas.map((f) => [
    f.numero_factura, f.fecha_emision, f.cliente_nombre, f.cliente_ruc, f.subtotal, f.iva_total, f.total,
  ])
  const wsDetalle = XLSX.utils.aoa_to_sheet([headerDetalle, ...filasDetalle])
  XLSX.utils.book_append_sheet(wb, wsDetalle, 'Detalle de Facturas')

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
