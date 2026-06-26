import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const empresaId = searchParams.get('empresa_id')
  const estado = searchParams.get('estado')

  if (!empresaId) return NextResponse.json({ error: 'empresa_id requerido' }, { status: 400 })

  let query = supabase
    .from('activos_fijos')
    .select('*, proveedor:proveedores(nombre), cuenta_activo:plan_cuentas!cuenta_activo_id(codigo, nombre)')
    .eq('empresa_id', empresaId)
    .order('fecha_adquisicion', { ascending: false })

  if (estado) query = query.eq('estado', estado)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = await req.json()
  const {
    empresa_id, codigo, nombre, descripcion, categoria,
    costo_adquisicion, valor_residual, fecha_adquisicion, fecha_inicio_dep,
    vida_util_anios, metodo_depreciacion, proveedor_id, ref_compra_id,
    numero_factura_compra, ubicacion, cuenta_activo_id, cuenta_dep_acum_id,
    cuenta_gasto_dep_id
  } = body

  // Calcular tasa según categoría LCT art. 45
  const { data: tasa } = await supabase.rpc('tasa_depreciacion_lct', { p_categoria: categoria })

  const vida_util_meses = Math.round(vida_util_anios * 12)
  const tasa_depreciacion_anual = body.tasa_depreciacion_anual ?? tasa ?? 0.10
  const valor_en_libros = costo_adquisicion

  const { data, error } = await supabase
    .from('activos_fijos')
    .insert({
      empresa_id, codigo, nombre, descripcion, categoria,
      tasa_depreciacion_anual,
      costo_adquisicion, valor_residual: valor_residual ?? 0,
      valor_en_libros,
      fecha_adquisicion, fecha_inicio_dep,
      vida_util_anios, vida_util_meses,
      metodo_depreciacion: metodo_depreciacion ?? 'linea_recta',
      proveedor_id, ref_compra_id, numero_factura_compra, ubicacion,
      cuenta_activo_id, cuenta_dep_acum_id, cuenta_gasto_dep_id,
      estado: 'activo'
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
