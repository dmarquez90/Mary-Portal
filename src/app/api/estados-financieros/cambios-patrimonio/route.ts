import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getSaldoCuentas } from '@/lib/estados-financieros'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const empresaId = searchParams.get('empresa_id')
    const fechaInicio = searchParams.get('fecha_inicio')
    const fechaFin = searchParams.get('fecha_fin')

    if (!empresaId || !fechaInicio || !fechaFin) {
      return NextResponse.json({ error: 'Parámetros requeridos' }, { status: 400 })
    }

    const { data: empresa } = await supabase
      .from('empresas_juridicas')
      .select('nombre_empresa, numero_ruc')
      .eq('id', empresaId)
      .eq('user_id', user.id)
      .single()

    if (!empresa) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })

    const inicio = new Date(fechaInicio)
    const fin = new Date(fechaFin)
    const inicioHist = new Date('2000-01-01')
    const diaAntes = new Date(inicio.getTime() - 86400000)

    const [
      capitalInicio, capitalMovimiento, capitalFin,
      reservaInicio, reservaMovimiento, reservaFin,
      utilRetInicio, utilRetMovimiento, utilRetFin,
      utilEjercicio,
    ] = await Promise.all([
      getSaldoCuentas(supabase, empresaId, ['3.1.01'], inicioHist, diaAntes, true),
      getSaldoCuentas(supabase, empresaId, ['3.1.01'], inicio, fin),
      getSaldoCuentas(supabase, empresaId, ['3.1.01'], inicioHist, fin, true),
      getSaldoCuentas(supabase, empresaId, ['3.1.02'], inicioHist, diaAntes, true),
      getSaldoCuentas(supabase, empresaId, ['3.1.02'], inicio, fin),
      getSaldoCuentas(supabase, empresaId, ['3.1.02'], inicioHist, fin, true),
      getSaldoCuentas(supabase, empresaId, ['3.2.01', '3.2.02'], inicioHist, diaAntes, true),
      getSaldoCuentas(supabase, empresaId, ['3.2.01', '3.2.02'], inicio, fin),
      getSaldoCuentas(supabase, empresaId, ['3.2.01', '3.2.02'], inicioHist, fin, true),
      getSaldoCuentas(supabase, empresaId, ['3.2.03'], inicio, fin),
    ])

    const totalInicio = capitalInicio + reservaInicio + utilRetInicio
    const totalFin = capitalFin + reservaFin + utilRetFin + utilEjercicio

    return NextResponse.json({
      empresa: { nombre: empresa.nombre_empresa, ruc: empresa.numero_ruc },
      periodo: { inicio: fechaInicio, fin: fechaFin },
      columnas: [
        'Capital Social',
        'Reserva Legal (25% - Cód. Comercio)',
        'Utilidades Retenidas',
        'Utilidad del Ejercicio',
        'TOTAL'
      ],
      filas: [
        {
          concepto: 'Saldo al inicio del período',
          capital: -capitalInicio, reserva: -reservaInicio,
          utilidades_retenidas: -utilRetInicio, utilidad_ejercicio: 0,
          total: -totalInicio,
        },
        {
          concepto: 'Aportes de Capital',
          capital: -capitalMovimiento, reserva: 0,
          utilidades_retenidas: 0, utilidad_ejercicio: 0,
          total: -capitalMovimiento,
        },
        {
          concepto: 'Constitución de Reserva Legal',
          capital: 0, reserva: -reservaMovimiento,
          utilidades_retenidas: 0, utilidad_ejercicio: 0,
          total: -reservaMovimiento,
        },
        {
          concepto: 'Aplicación de Utilidades Retenidas',
          capital: 0, reserva: 0,
          utilidades_retenidas: -utilRetMovimiento, utilidad_ejercicio: 0,
          total: -utilRetMovimiento,
        },
        {
          concepto: 'Utilidad / (Pérdida) Neta del Período',
          capital: 0, reserva: 0,
          utilidades_retenidas: 0, utilidad_ejercicio: -utilEjercicio,
          total: -utilEjercicio, esResultado: true,
        },
        {
          concepto: 'Saldo al final del período',
          capital: -capitalFin, reserva: -reservaFin,
          utilidades_retenidas: -utilRetFin, utilidad_ejercicio: -utilEjercicio,
          total: -totalFin, esTotal: true,
        },
      ],
      totales: {
        patrimonio_inicio: -totalInicio,
        patrimonio_fin: -totalFin,
        variacion: (-totalFin) - (-totalInicio),
      },
      metadatos: {
        norma: 'NIIF PYMES Sección 6',
        nota_reserva: 'Reserva Legal: 25% conforme Código de Comercio de Nicaragua',
        generado_en: new Date().toISOString(),
      }
    })
  } catch (error) {
    console.error('Error cambios patrimonio:', error)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
