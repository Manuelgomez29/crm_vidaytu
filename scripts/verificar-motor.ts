/**
 * El motor avisa cuando se para, y un fallo no se lleva por delante al resto.
 *
 * Todo lo que hace que el área comercial funcione sola —repartir los leads sin
 * propietario, avisar del SLA, empujar la cadencia de cinco intentos, reclamar
 * los presupuestos sin respuesta, mandar recordatorios de cita, reactivar
 * perdidos— cuelga de un cron cada quince minutos. Si deja de correr, nada da
 * un error: simplemente dejan de llegar avisos. Y no recibir ningún aviso se
 * parece muchísimo a no tener nada pendiente.
 *
 * Así que hay dos cosas que comprobar, y las dos importan:
 *
 *   1. Que una avería en una fase no apague las otras. Que las reseñas fallen
 *      no puede dejar los leads sin repartir.
 *   2. Que estar parado se vea. Un aviso que no salta es lo mismo que no tener
 *      aviso, y además da la falsa tranquilidad de creer que hay uno.
 *
 *   npx tsx --env-file=.env.staging scripts/verificar-motor.ts
 */
import { createClient } from '@supabase/supabase-js';
import { fase, registrarEjecucion, estadoDelMotor, type FalloDeFase } from '../src/lib/salud-motor';
import type { Database } from '../src/lib/database.types';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const PASSWORD = 'vidaytu-dev-2026';

const admin = createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

let fallos = 0;
const comprobar = (t: string, ok: boolean, d = '') => {
  console.log(`  ${ok ? 'OK  ' : 'FALLA'}  ${t}${d ? ' — ' + d : ''}`);
  if (!ok) fallos++;
};

async function sesion(email: string) {
  const cliente = createClient<Database>(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await cliente.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) {
    comprobar(`sesión de ${email}`, false, error.message);
    return null;
  }
  return cliente;
}

async function main() {
  console.log('\nSalud del motor de automatizaciones\n');

  // ---------------------------------------------------------------------------
  console.log('Una fase averiada no apaga las demás:');

  const anotados: FalloDeFase[] = [];
  let laOtraCorrio = false;

  const [rota, sana] = await Promise.all([
    fase(
      'fase_rota',
      anotados,
      async () => {
        throw new Error('avería de prueba');
      },
      -1,
    ),
    fase(
      'fase_sana',
      anotados,
      async () => {
        laOtraCorrio = true;
        return 7;
      },
      -1,
    ),
  ]);

  comprobar('la que falla devuelve su valor de respaldo', rota === -1);
  comprobar('la otra se ejecuta igual', laOtraCorrio && sana === 7, `devolvió ${sana}`);
  comprobar('el fallo queda anotado con su nombre', anotados.length === 1 && anotados[0].fase === 'fase_rota');
  comprobar('y con el motivo, no solo «falló»', anotados[0]?.error === 'avería de prueba');

  // ---------------------------------------------------------------------------
  console.log('\nLa pasada queda registrada:');

  // Se aparta lo que hubiera para no mezclar la prueba con lo real.
  const { data: previas } = await admin.from('ejecuciones_motor').select('id');
  const idsPrevios = new Set((previas ?? []).map((e) => e.id));
  const partiaVacio = idsPrevios.size === 0;

  await registrarEjecucion(admin, {
    inicio: new Date(Date.now() - 1500),
    resultado: { repartidos: 3, sla: 1 },
    fallos: [],
  });
  await registrarEjecucion(admin, {
    inicio: new Date(Date.now() - 800),
    resultado: { repartidos: 0 },
    fallos: [{ fase: 'resenas', error: 'avería de prueba' }],
  });

  const { data: nuevas } = await admin
    .from('ejecuciones_motor')
    .select('id, ok, duracion_ms, resultado, fallos')
    .order('inicio', { ascending: false });
  const mias = (nuevas ?? []).filter((e) => !idsPrevios.has(e.id));

  comprobar('se escriben las dos pasadas', mias.length === 2, `${mias.length}`);
  const conFallo = mias.find((e) => e.ok === false);
  const buena = mias.find((e) => e.ok === true);
  comprobar('la que tuvo un fallo queda marcada como no correcta', Boolean(conFallo));
  comprobar('la limpia queda marcada como correcta', Boolean(buena));
  comprobar(
    'se guarda QUÉ falló, para no tener que ir a los registros de Vercel',
    JSON.stringify(conFallo?.fallos ?? '').includes('resenas'),
  );
  comprobar('se guarda lo que hizo', JSON.stringify(buena?.resultado ?? '').includes('repartidos'));
  comprobar('y cuánto tardó', typeof buena?.duracion_ms === 'number' && buena.duracion_ms >= 0);

  // ---------------------------------------------------------------------------
  console.log('\nEl aviso salta cuando toca, y solo cuando toca:');

  const jefe = await sesion('direccion@test.com');
  const comercial = await sesion('equipo@test.com');
  if (!jefe || !comercial) process.exit(1);

  const { data: cfg } = await admin
    .from('configuracion')
    .select('valor')
    .eq('clave', 'motor_aviso_minutos')
    .maybeSingle();
  const umbral = Number(cfg?.valor) || 60;

  const recien = await estadoDelMotor(jefe);
  comprobar(
    'con una pasada correcta recién hecha, no avisa',
    recien.parado === false,
    `${recien.minutosDesdeBuena} min, umbral ${umbral}`,
  );

  /*
   * Para ver el aviso hay que envejecer TODAS las pasadas, no solo las de la
   * prueba: si queda una real reciente, es esa la que manda y el aviso no salta.
   * Así falló este script la primera vez, y el fallo era suyo, no del producto.
   *
   * Se desplazan todas el mismo intervalo, con lo que el orden entre ellas se
   * conserva intacto —la que falló sigue siendo la última— y luego se devuelven
   * a su hora exacta. Poner la misma hora a dos pasadas dejaría el desempate al
   * azar, que es la otra forma que tuvo de fallar.
   */
  const { data: todas } = await admin.from('ejecuciones_motor').select('id, inicio, fin');
  const original = new Map((todas ?? []).map((e) => [e.id, { inicio: e.inicio, fin: e.fin }]));
  const masReciente = Math.max(...(todas ?? []).map((e) => Date.parse(e.inicio)));
  const desplazamiento = masReciente - (Date.now() - (umbral + 30) * 60_000);

  for (const e of todas ?? []) {
    await admin
      .from('ejecuciones_motor')
      .update({
        inicio: new Date(Date.parse(e.inicio) - desplazamiento).toISOString(),
        fin: e.fin ? new Date(Date.parse(e.fin) - desplazamiento).toISOString() : null,
      })
      .eq('id', e.id);
  }

  const parado = await estadoDelMotor(jefe);
  comprobar(
    `pasado el umbral de ${umbral} min sin pasada correcta, avisa`,
    parado.parado === true,
    `${parado.minutosDesdeBuena} min`,
  );
  comprobar(
    'y dice qué fase falló la última vez',
    parado.fallos.some((f) => f.fase === 'resenas'),
  );

  // ---------------------------------------------------------------------------
  console.log('\nQuién puede ver y tocar el registro:');

  const { data: vistoPorComercial } = await comercial.from('ejecuciones_motor').select('id');
  comprobar(
    'un comercial no ve el registro (no puede hacer nada con él)',
    (vistoPorComercial ?? []).length === 0,
    `devolvió ${(vistoPorComercial ?? []).length}`,
  );

  const mudo = await estadoDelMotor(comercial);
  comprobar('y por tanto no le sale el aviso', mudo.parado === false);

  /*
   * Nadie escribe aquí desde la aplicación. Si se pudiera, se podría fabricar
   * una pasada falsa y tapar que el motor lleva días parado — que es justo lo
   * único que esta tabla sirve para impedir.
   */
  const { error: alInsertar } = await jefe
    .from('ejecuciones_motor')
    .insert({ ok: true, resultado: {}, fallos: [] });
  comprobar(
    'ni siquiera dirección puede fabricar una pasada a mano',
    alInsertar !== null,
    alInsertar ? 'rechazado por la base' : 'LA BASE LO ACEPTÓ',
  );

  for (const e of mias) await admin.from('ejecuciones_motor').delete().eq('id', e.id);

  // Las pasadas reales vuelven a su hora exacta.
  for (const [id, horas] of original) {
    if (mias.some((m) => m.id === id)) continue;
    await admin.from('ejecuciones_motor').update(horas).eq('id', id);
  }

  /*
   * Y el caso que estuvo a punto de quedarse fuera: que no haya corrido NUNCA.
   *
   * El primer diseño callaba en ese caso, para no dejar un aviso rojo eterno en
   * staging. Pero eso tapaba justo el peor escenario —que en producción el cron
   * no llegue a activarse jamás—, o sea que el aviso más importante era el único
   * que no salía. Solo se puede comprobar si la tabla queda vacía de verdad.
   */
  if (partiaVacio) {
    const virgen = await estadoDelMotor(jefe);
    comprobar(
      'sin ninguna pasada, no dice «parado» pero sí «no ha corrido nunca»',
      virgen.nuncaHaCorrido === true && virgen.parado === false,
    );
  } else {
    console.log('  --    «no ha corrido nunca» no se puede probar: ya hay pasadas reales');
  }

  console.log('\n  (pasadas de prueba borradas)');

  console.log(
    fallos === 0
      ? '\nEl motor aguanta un fallo y avisa si se para.\n'
      : `\n${fallos} comprobación(es) FALLIDA(S).\n`,
  );
  process.exit(fallos === 0 ? 0 : 1);
}

main();
