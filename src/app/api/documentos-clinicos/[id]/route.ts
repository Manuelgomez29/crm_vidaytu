import { NextRequest, NextResponse } from 'next/server';
import { sesionVerificada } from '@/lib/sesion-verificada';

/**
 * Descarga de un documento clínico. Igual que los adjuntos comerciales pero
 * con el muro de por medio: la consulta va con la sesión del usuario, así que
 * si no es el terapeuta referente (ni dirección) la fila no existe para él y
 * la respuesta es 404 — no un 403, que ya confirmaría que el documento está
 * ahí.
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

  const { data: documento } = await supabase
    .from('documentos_clinicos')
    .select('ruta, nombre')
    .eq('id', id)
    .maybeSingle();
  if (!documento) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  const { data, error } = await supabase.storage
    .from('documentos-clinicos')
    .createSignedUrl(documento.ruta, 60, { download: documento.nombre });
  if (error || !data) {
    return NextResponse.json({ error: 'No se pudo preparar la descarga' }, { status: 500 });
  }

  return NextResponse.redirect(data.signedUrl);
}
