/**
 * La copia de HighLevel sirve de verdad.
 *
 * Una copia de seguridad que falla en silencio es peor que no tenerla: da
 * confianza sin dar respaldo. Así que no basta con que haya filas — se
 * comprueba lo que la hace útil el día que haga falta:
 *
 *   1. Que están las piezas, y sobre todo LOS MENSAJES: sin ellos se vuelve
 *      con una lista de nombres.
 *   2. Que cada mensaje sabe de qué conversación es.
 *   3. Que repetirla no duplica, y que deja constancia de haber pasado.
 *   4. Que el reloj de «una vez al día» funciona en los dos sentidos.
 *   5. Que si una lista viene incompleta, se dice en vez de callarlo.
 *   6. Que esto no lo ve nadie que no deba.
 *
 *   npx tsx --env-file=.env.local scripts/verificar-espejo.ts
 */
import { createClient } from '@supabase/supabase-js';
import { copiarDeHighLevel, tocaCopiar } from '../src/lib/espejo';
import type { Database } from '../src/lib/database.types';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const admin = createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

let fallos = 0;
const comprobar = (t: string, ok: boolean, d = '') => {
  console.log(`  ${ok ? 'OK  ' : 'FALLA'}  ${t}${d ? ' — ' + d : ''}`);
  if (!ok) fallos++;
};

async function porTipo(): Promise<Record<string, number>> {
  const { data } = await admin.from('canal_espejo').select('tipo');
  const r: Record<string, number> = {};
  for (const f of data ?? []) r[f.tipo] = (r[f.tipo] ?? 0) + 1;
  return r;
}

async function main() {
  console.log('\nLa copia de HighLevel\n');

  // ---------------------------------------------------------------------------
  console.log('Está lo que tiene que estar:');

  const antes = await porTipo();
  comprobar('hay contactos copiados', (antes.contacto ?? 0) > 0, `${antes.contacto ?? 0}`);
  comprobar('hay conversaciones', (antes.conversacion ?? 0) > 0, `${antes.conversacion ?? 0}`);
  comprobar(
    'y hay MENSAJES dentro de ellas',
    (antes.mensaje ?? 0) > 0,
    'es lo que decide si en enero se vuelve con el trabajo o con los nombres',
  );
  comprobar('los catálogos también', (antes.campo ?? 0) > 0 && (antes.embudo ?? 0) > 0);

  const { data: sueltos } = await admin
    .from('canal_espejo')
    .select('ref')
    .eq('tipo', 'mensaje')
    .is('ref_padre', null)
    .limit(1);
  comprobar(
    'cada mensaje sabe de qué conversación es',
    (sueltos ?? []).length === 0,
    'sin eso, el volcado de enero no puede reconstruir el hilo',
  );

  // ---------------------------------------------------------------------------
  console.log('\nRepetirla no duplica:');

  const { data: ultimaAntes } = await admin
    .from('canal_espejo')
    .select('visto_at')
    .eq('tipo', 'contacto')
    .order('visto_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  await new Promise((r) => setTimeout(r, 1100));
  const segunda = await copiarDeHighLevel(admin);
  const despues = await porTipo();

  // Ordenado: el orden de las claves depende del orden de las filas, que no
  // es estable, y comparar los objetos tal cual daba una falla que no lo era.
  const igual = (a: Record<string, number>) => JSON.stringify(Object.entries(a).sort());
  comprobar(
    'el número de filas no crece al repetir',
    igual(antes) === igual(despues),
    `${JSON.stringify(despues)}`,
  );

  const { data: ultimaDespues } = await admin
    .from('canal_espejo')
    .select('visto_at')
    .eq('tipo', 'contacto')
    .order('visto_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  comprobar(
    'pero se apunta que se ha vuelto a ver',
    Date.parse(ultimaDespues!.visto_at) > Date.parse(ultimaAntes!.visto_at),
    'así se sabrá qué dejó de existir allí, en vez de perderlo sin rastro',
  );

  comprobar('la pasada dice si vino entera', segunda.truncado === false, 'sin truncar');

  const { data: pasadas } = await admin
    .from('canal_copias')
    .select('ok, recuentos, truncado, fin')
    .order('inicio', { ascending: false })
    .limit(1)
    .maybeSingle();
  comprobar('y queda registrada, con su resultado', pasadas?.ok === true && !!pasadas?.fin);

  // ---------------------------------------------------------------------------
  console.log('\nEl reloj de «una vez al día»:');

  comprobar(
    'acabando de copiar, NO toca otra vez',
    (await tocaCopiar(admin)) === false,
    'el motor pasa cada 15 minutos: sin esto copiaría 96 veces al día',
  );

  /*
   * Y al revés: si la última quedó vieja, tiene que tocar. Se envejece la
   * pasada, se comprueba, y se deja como estaba.
   */
  const { data: buenas } = await admin
    .from('canal_copias')
    .select('id, inicio')
    .eq('ok', true)
    .order('inicio', { ascending: false })
    .limit(20);

  // TODAS, no solo la última: `tocaCopiar` mira la más reciente, así que dejar
  // una sin envejecer no prueba nada. Es el fallo que tuvo este test.
  const haceDosDias = new Date(Date.now() - 48 * 3_600_000).toISOString();
  for (const b of buenas ?? []) {
    await admin.from('canal_copias').update({ inicio: haceDosDias }).eq('id', b.id);
  }
  comprobar('si la última es de hace dos días, SÍ toca', (await tocaCopiar(admin)) === true);
  for (const b of buenas ?? []) {
    await admin.from('canal_copias').update({ inicio: b.inicio }).eq('id', b.id);
  }
  comprobar('y al dejarlo como estaba, vuelve a no tocar', (await tocaCopiar(admin)) === false);

  // ---------------------------------------------------------------------------
  console.log('\nEl muro:');

  const deLaCalle = createClient<Database>(url, anon, { auth: { persistSession: false } });
  const { data: ve } = await deLaCalle.from('canal_espejo').select('id').limit(3);
  const { data: vc } = await deLaCalle.from('canal_copias').select('id').limit(3);
  comprobar('sin sesión no se ve el espejo', (ve ?? []).length === 0, 'aquí dentro hay conversaciones enteras');
  comprobar('ni el registro de copias', (vc ?? []).length === 0);

  console.log(
    fallos === 0
      ? '\nHay copia, está entera, y repetirla no la estropea.\n'
      : `\n${fallos} comprobación(es) FALLIDA(S).\n`,
  );
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\nFALLÓ:', e instanceof Error ? e.message : e, '\n');
  process.exit(1);
});
