import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Descarga de un adjunto. El bucket es privado: se comprueba con la sesión del
 * usuario (RLS decide si puede ver ese caso) y solo entonces se firma una URL
 * de un minuto. Nunca se expone el fichero directamente.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data: adjunto } = await supabase
    .from('caso_adjuntos')
    .select('storage_path, nombre_archivo')
    .eq('id', id)
    .maybeSingle();
  if (!adjunto) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  const { data, error } = await supabase.storage
    .from('adjuntos-casos')
    .createSignedUrl(adjunto.storage_path, 60, { download: adjunto.nombre_archivo });
  if (error || !data) {
    return NextResponse.json({ error: 'No se pudo preparar la descarga' }, { status: 500 });
  }

  return NextResponse.redirect(data.signedUrl);
}
