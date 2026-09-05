'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { SENALES, type Senal } from '@/lib/scoring';

async function exigirDireccion() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('rol')
    .eq('id', user.id)
    .maybeSingle();
  if (perfil?.rol !== 'direccion') redirect('/leads');
  return user;
}

function volver(aviso?: { error?: string; aviso?: string }): never {
  const q = aviso?.error
    ? `?error=${encodeURIComponent(aviso.error)}`
    : aviso?.aviso
      ? `?aviso=${encodeURIComponent(aviso.aviso)}`
      : '';
  revalidatePath('/admin/scoring');
  revalidatePath('/leads');
  redirect(`/admin/scoring${q}`);
}

/**
 * Cambiar cuánto pesa una regla, o apagarla.
 *
 * No recalcula nada aquí: la puntuación se rehace en la pasada del motor, cada
 * quince minutos. Recalcular doscientos casos dentro de un formulario dejaría a
 * dirección mirando una pantalla en blanco para ver un número que puede esperar.
 */
export async function guardarRegla(reglaId: string, formData: FormData) {
  await exigirDireccion();

  const puntos = Number(formData.get('puntos'));
  if (!Number.isFinite(puntos) || puntos < -100 || puntos > 100) {
    volver({ error: 'Los puntos van de -100 a 100.' });
  }
  const activa = formData.get('activa') === 'on';

  const admin = createAdminClient();
  const { error } = await admin
    .from('scoring_reglas')
    .update({ puntos: Math.round(puntos), activa })
    .eq('id', reglaId);

  if (error) volver({ error: `No se pudo guardar: ${error.message}` });
  volver({ aviso: 'Regla guardada. El calor se recalcula en la próxima pasada.' });
}

/**
 * Crear una regla nueva sobre una señal del catálogo.
 *
 * La señal se valida contra la lista del código: no se puede inventar una que
 * nadie sabe calcular. Es justo lo que evita una regla que no encaja nunca y
 * baja la puntuación en silencio.
 */
export async function crearRegla(formData: FormData) {
  const user = await exigirDireccion();

  const nombre = String(formData.get('nombre') ?? '').trim();
  const senal = String(formData.get('senal') ?? '');
  const puntos = Number(formData.get('puntos'));

  if (!nombre) volver({ error: 'Ponle un nombre: es lo que se verá en el desglose del caso.' });
  if (!SENALES.includes(senal as Senal)) volver({ error: 'Esa señal no existe.' });
  if (!Number.isFinite(puntos) || puntos === 0) {
    volver({ error: 'Una regla de 0 puntos no hace nada. Pon un valor positivo o negativo.' });
  }

  const admin = createAdminClient();
  const { error } = await admin.from('scoring_reglas').insert({
    nombre,
    condicion: { senal },
    puntos: Math.round(puntos),
    created_by: user.id,
  });

  if (error) {
    volver({
      error: error.message.includes('duplicate')
        ? 'Ya hay una regla con ese nombre.'
        : `No se pudo crear: ${error.message}`,
    });
  }
  volver({ aviso: 'Regla creada.' });
}

export async function borrarRegla(reglaId: string) {
  await exigirDireccion();
  const admin = createAdminClient();
  const { error } = await admin.from('scoring_reglas').delete().eq('id', reglaId);
  if (error) volver({ error: `No se pudo borrar: ${error.message}` });
  volver({ aviso: 'Regla borrada.' });
}
