import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Redirector de clics. El enlace del correo apunta aquí con el destino en
 * `?a=`, se anota el clic y se reenvía.
 *
 * Solo se aceptan destinos http/https absolutos: un redirector abierto que
 * acepte cualquier cosa es un regalo para el phishing, y estaría firmado con
 * el dominio del grupo.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const destino = req.nextUrl.searchParams.get('a') ?? '';

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
