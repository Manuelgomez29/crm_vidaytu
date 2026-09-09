import { NextResponse } from 'next/server';
import { sesionVerificada } from '@/lib/sesion-verificada';

/**
 * Latido: «sigo aquí».
 *
 * Lo llama el navegador cada dos minutos mientras la pestaña esté visible. Sin
 * esto, la única señal de vida serían las navegaciones, y alguien que se pasa
 * veinte minutos leyendo un caso —o hablando por teléfono con la ficha abierta,
 * que es lo normal— aparecería como desconectado justo cuando más presente
 * está. Una pantalla que dice quién está disponible tiene que decir la verdad.
 *
 * Escribe con la sesión de quien llama, no con la clave de servicio: la política
 * de la tabla solo deja marcar la fila propia, así que nadie puede fabricar la
 * presencia de un compañero ni borrarla.
 */
export async function POST() {
  const { supabase, user } = await sesionVerificada();
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });

  const { error } = await supabase
    .from('presencia_app')
    .upsert(
      { perfil_id: user.id, visto_at: new Date().toISOString() },
      { onConflict: 'perfil_id' },
    );

  if (error) return NextResponse.json({ ok: false }, { status: 500 });
  return NextResponse.json({ ok: true });
}
