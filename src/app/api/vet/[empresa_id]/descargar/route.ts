import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// El bucket 'reportes-vet' es privado y sin políticas de storage propias:
// solo se puede firmar una URL desde el servidor. La autorización real la
// resuelve el SELECT contra auditoría_exportaciones_vet (RLS: fn_tiene_permiso
// 'vet_ver'); si esa fila es visible para el usuario, se firma la ruta.
export async function GET(req: NextRequest, { params }: { params: Promise<{ empresa_id: string }> }) {
  const { empresa_id } = await params
  const ruta = req.nextUrl.searchParams.get('ruta')
  if (!ruta) return NextResponse.json({ error: 'ruta es requerida' }, { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: auditoria } = await supabase
    .from('auditoría_exportaciones_vet')
    .select('id')
    .eq('empresa_id', empresa_id)
    .eq('archivo_url', ruta)
    .maybeSingle()
  if (!auditoria) return NextResponse.json({ error: 'Archivo no encontrado o sin permiso' }, { status: 404 })

  const admin = createAdminClient()
  const { data: signed, error } = await admin.storage.from('reportes-vet').createSignedUrl(ruta, 60)
  if (error || !signed) {
    return NextResponse.json({ error: error?.message ?? 'No se pudo generar el enlace de descarga' }, { status: 500 })
  }

  return NextResponse.redirect(signed.signedUrl)
}
