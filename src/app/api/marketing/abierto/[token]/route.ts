import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Pixel de apertura. Devuelve SIEMPRE un GIF de 1x1, pase lo que pase: si esta
 * ruta fallara con un error, algunos clientes de correo mostrarían el icono de
 * imagen rota dentro del mensaje.
 *
 * La tasa de apertura es orientativa por diseño: quien bloquea imágenes no
 * cuenta, y quien usa Apple Mail cuenta de más. Sirve para comparar campañas
 * entre sí, no como número absoluto.
 */
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  try {
    const admin = createAdminClient();
    const { data: destinatario } = await admin
      .from('campana_destinatarios')
      .select('id, campana_id, abierto_at')
      .eq('token', token)
      .maybeSingle();

    // Solo la PRIMERA apertura suma: si no, un correo que alguien deja abierto
    // en una pestaña inflaría la campaña él solo.
    if (destinatario && !destinatario.abierto_at) {
      await admin
        .from('campana_destinatarios')
        .update({ abierto_at: new Date().toISOString() })
        .eq('id', destinatario.id);

      const { count } = await admin
        .from('campana_destinatarios')
        .select('id', { count: 'exact', head: true })
        .eq('campana_id', destinatario.campana_id)
        .not('abierto_at', 'is', null);

      await admin
        .from('campanas_email')
        .update({ total_aperturas: count ?? 0 })
        .eq('id', destinatario.campana_id);
    }
  } catch {
    // Silencio deliberado: el pixel nunca puede romper la lectura del correo.
  }

  return new NextResponse(GIF, {
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    },
  });
}
