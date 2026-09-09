import { NextRequest, NextResponse } from 'next/server';
import { sesionVerificada } from '@/lib/sesion-verificada';

/**
 * Descarga de un adjunto. El bucket es privado: se comprueba con la sesión del
 * usuario (RLS decide si puede ver ese caso) y solo entonces se firma una URL
 * de un minuto. Nunca se expone el fichero directamente.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  /*
   * Con el segundo factor dado. El middleware no llega hasta aqui —excluye
   * `/api/` a proposito, porque por ahi entran los webhooks sin sesion— asi que
   * la comprobacion vive en la ruta.
   */
  const { supabase, user, motivo } = await sesionVerificada();
  if (!user) return NextResponse.json({ error: `No autorizado: ${motivo}` }, { status: 401 });

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
