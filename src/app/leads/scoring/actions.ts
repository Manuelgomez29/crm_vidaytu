'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { SENALES, type Senal } from '@/lib/scoring';
import { recalcularPuntuaciones } from '@/lib/automatizacion';

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
  revalidatePath('/leads/scoring');
  revalidatePath('/leads');
  redirect(`/leads/scoring${q}`);
}

/**
 * Guarda de una vez todo lo que se ha movido en el simulador.
 *
 * De una vez y no regla a regla porque el ajuste se hace en conjunto: bajar la
 * urgencia y subir el presupuesto es UN cambio de criterio, y guardarlo en dos
 * pasos deja un rato en el que las reglas dicen algo que nadie ha querido decir.
 *
 * Y aquí sí se recalcula al terminar, al contrario que antes. La razon de no
 * hacerlo era no dejar a direccion esperando; pero acabas de mover unos
 * controles viendo el efecto en pantalla, y que la aplicacion siga enseñando las
 * puntuaciones viejas quince minutos convierte todo eso en una promesa. Con
 * doscientos casos son un par de segundos.
 */
export async function guardarTodo(formData: FormData) {
  await exigirDireccion();

  let reglas: { id: string; puntos: number; activa: boolean }[];
  let umbrales: { caliente: number; templado: number };
  try {
    reglas = JSON.parse(String(formData.get('reglas') ?? '[]'));
    umbrales = JSON.parse(String(formData.get('umbrales') ?? '{}'));
  } catch {
    volver({ error: 'No se entendió lo que se envió. Vuelve a intentarlo.' });
  }

  /*
   * Todo se valida aquí otra vez. Lo que llega es un JSON de un campo oculto:
   * que el control de la pantalla no deje pasar un 500 no significa nada sobre
   * lo que puede llegar por la puerta de atrás.
   */
  for (const r of reglas) {
    if (!Number.isFinite(r.puntos) || r.puntos < -100 || r.puntos > 100) {
      volver({ error: 'Los puntos van de -100 a 100.' });
    }
  }
  const caliente = Number(umbrales?.caliente);
  const templado = Number(umbrales?.templado);
  if (
    !Number.isFinite(caliente) ||
    !Number.isFinite(templado) ||
    templado >= caliente ||
    templado < 1 ||
    caliente > 100
  ) {
    volver({
      error: 'Los cortes tienen que ir de 1 a 100, y el de templado por debajo del de caliente.',
    });
  }

  const admin = createAdminClient();

  for (const r of reglas) {
    const { error } = await admin
      .from('scoring_reglas')
      .update({ puntos: Math.round(r.puntos), activa: r.activa })
      .eq('id', r.id);
    if (error) volver({ error: `No se pudo guardar: ${error.message}` });
  }

  const { error: errorUmbrales } = await admin
    .from('configuracion')
    .update({ valor: { caliente: Math.round(caliente), templado: Math.round(templado) } })
    .eq('clave', 'scoring_umbrales');
  if (errorUmbrales)
    volver({ error: `No se pudieron guardar los cortes: ${errorUmbrales.message}` });

  const cambiados = await recalcularPuntuaciones(admin);
  volver({
    aviso:
      cambiados === 0
        ? 'Guardado. Ningún caso cambia de puntuación con estas reglas.'
        : `Guardado y recalculado: ${cambiados} caso(s) han cambiado de puntuación.`,
  });
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

/**
 * Recalcular ahora, sin esperar a la pasada del motor.
 *
 * Existe por una razón concreta: los cron de Vercel solo corren en despliegues
 * de producción, así que en staging la puntuación no se recalcula sola nunca.
 * Sin este botón, probar un cambio de reglas allí era imposible — y probar en
 * producción es justo lo que el segundo entorno viene a evitar.
 */
export async function recalcularAhora() {
  await exigirDireccion();
  const admin = createAdminClient();
  const cambiados = await recalcularPuntuaciones(admin);
  volver({
    aviso:
      cambiados === 0
        ? 'Recalculado: ningún caso cambia de puntuación con estas reglas.'
        : `Recalculado: ${cambiados} caso(s) han cambiado de puntuación.`,
  });
}
