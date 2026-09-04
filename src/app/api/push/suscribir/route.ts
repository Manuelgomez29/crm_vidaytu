import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { dentroDelLimite } from '@/lib/limites';

/**
 * Alta y baja de un dispositivo para notificaciones push.
 *
 * La suscripcion se guarda con el id de quien inicia sesion: nadie puede dar
 * de alta un dispositivo a nombre de otra persona, porque el perfil no se lee
 * del cuerpo de la peticion sino de la sesion.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  // Por usuario, no por IP: quien ya tiene sesion esta identificado, y esto
  // frena que un dispositivo comprometido llene la tabla de suscripciones.
  if (!(await dentroDelLimite('push', user.id))) {
    return NextResponse.json({ error: 'Demasiadas peticiones' }, { status: 429 });
  }

  const { endpoint, p256dh, auth } = await req.json();
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ error: 'Suscripcion incompleta' }, { status: 400 });
  }

  const { error } = await supabase.from('push_suscripciones').upsert(
    {
      perfil_id: user.id,
      endpoint,
      p256dh,
      auth,
      user_agent: req.headers.get('user-agent')?.slice(0, 200) ?? null,
    },
    { onConflict: 'endpoint' },
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { endpoint } = await req.json();
  await supabase
    .from('push_suscripciones')
    .delete()
    .eq('endpoint', endpoint)
    .eq('perfil_id', user.id);

  return NextResponse.json({ ok: true });
}
