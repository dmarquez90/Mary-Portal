import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ empresa_id: string }> }) {
  const { empresa_id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const [{ data: empNat }, { data: empJur }] = await Promise.all([
    supabase.from('empresas_persona_natural').select('id, regimen_tributario_id').eq('id', empresa_id).maybeSingle(),
    supabase.from('empresas_juridicas').select('id, regimen_tributario_id').eq('id', empresa_id).maybeSingle(),
  ])

  const empresa = empNat ?? empJur
  if (!empresa) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

  if (!empresa.regimen_tributario_id) {
    return NextResponse.json(
      { error: 'La empresa no tiene un régimen tributario asignado. Configúrelo antes de generar reportes VET.' },
      { status: 400 }
    )
  }

  const { data: reportes, error } = await supabase
    .from('reportes_vet')
    .select('*')
    .eq('regimen_tributario_id', empresa.regimen_tributario_id)
    .eq('estado', 'activo')
    .order('orden_presentacion')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ reportes: reportes ?? [] })
}
