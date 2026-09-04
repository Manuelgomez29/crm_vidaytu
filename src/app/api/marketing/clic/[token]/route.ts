import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { destinoValido } from '@/lib/enlaces';

/**
 * Redirector de clics de las campañas.
 *
 * El enlace del correo apunta aquí con el destino en `?a=` y su FIRMA en `?f=`.
 * Se anota el clic y se reenvía.
 *
 * La firma no es un adorno. Sin ella, esta ruta era una redirección abierta en
 * el dominio desde el que el grupo envía correo: bastaba con
 * `…/api/marketing/clic/x?a=https://login-falso.example` para tener un enlace
 * con el dominio de confianza delante que lleva a una copia del login. Es
 * exactamente el patrón de phishing que más funciona, y comprobar solo el
 * protocolo (http/https) no lo evita en absoluto.
 *
 * Ahora solo se aceptan destinos que ha firmado la propia plataforma al
 * componer el correo, con un HMAC del secreto del servidor.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const destino = req.nextUrl.searchParams.get('a') ?? '';
  const firma = req.nextUrl.searchParams.get('f');

  if (!destinoValido(destino, firma)) {
    return NextResponse.json({ error: 'Enlace no válido' }, { status: 400 });
  }

  let url: URL;
  try {
    url = new URL(destino);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('protocolo');
  } catch {
    return NextResponse.json({ error: 'Destino no válido' }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const { data: destinatario } = await admin
      .from('campana_destinatarios')
      .select('id, campana_id, clic_at')
      .eq('token', token)
      .maybeSingle();

    if (destinatario && !destinatario.clic_at) {
      await admin
        .from('campana_destinatarios')
        .update({ clic_at: new Date().toISOString() })
        .eq('id', destinatario.id);

      const { count } = await admin
        .from('campana_destinatarios')
        .select('id', { count: 'exact', head: true })
        .eq('campana_id', destinatario.campana_id)
        .not('clic_at', 'is', null);

      await admin
        .from('campanas_email')
        .update({ total_clics: count ?? 0 })
        .eq('id', destinatario.campana_id);
    }
  } catch {
    // Que falle la analítica no puede impedir que la persona llegue al enlace.
  }

  return NextResponse.redirect(url.toString());
}
