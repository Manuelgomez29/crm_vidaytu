/**
 * El histórico del motor cuenta lo que pasó, no lo que le gustaría.
 *
 * La pantalla de Administración → Motor sirve para contestar una pregunta que
 * no tiene alarma: «¿esto lleva semanas funcionando?». Si el resumen que enseña
 * está mal, es peor que no tenerlo — daría por bueno un motor medio parado.
 *
 * Lo delicado es que los números los calcula Postgres y no la aplicación, así
 * que hay que comprobarlos contra una cuenta hecha aquí a mano, sobre unas
 * pasadas fabricadas a propósito con fallos y con un hueco en medio.
 *
 * Se comprueba también que respeta el muro: la función es `security invoker`, o
 * sea que quien no sea dirección tiene que recibir ceros, no el registro.
 *
 *   npx tsx --env-file=.env.staging scripts/verificar-historico-motor.ts
 */
import { createClient } from '@supabase/supabase-js';
import { historicoDelMotor, PASADAS_EN_DETALLE } from '../src/lib/salud-motor';
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

const MIN = 60_000;

async function main() {
  console.log('\nHistórico del motor\n');

  /*
   * Se aparta lo real para devolverlo tal cual al terminar.
   *
   * El borrado va por fecha y no por `neq('id', '')`: la cadena vacía no es un
   * uuid, Postgres rechaza la comparación y el borrado no hacía NADA. La prueba
   * pasaba igual mientras la tabla estuviera vacía —o sea, nunca comprobó lo que
   * creía comprobar— y solo se vio al sembrar staging con datos de verdad.
   */
  const DESDE_SIEMPRE = '1970-01-01T00:00:00Z';
  const vaciar = async () => {
    const { error } = await admin.from('ejecuciones_motor').delete().gte('inicio', DESDE_SIEMPRE);
    if (error) {
      console.log(`  FALLA  no se pudo vaciar la tabla: ${error.message}`);
      process.exit(1);
    }
  };

  const { data: reales } = await admin.from('ejecuciones_motor').select('*');
  await vaciar();

  const quedan = await admin.from('ejecuciones_motor').select('id', { count: 'exact', head: true });
  if ((quedan.count ?? 0) > 0) {
    console.log(`  FALLA  la tabla no quedó vacía: siguen ${quedan.count} filas`);
    process.exit(1);
  }

  /*
   * Un histórico fabricado con forma de problema real: veinte pasadas cada
   * quince minutos, DOS con un fallo, y un hueco de dos horas en medio como si
   * el cron se hubiera caído un rato. Sabemos lo que tiene que salir porque lo
   * hemos puesto nosotros.
   */
  const ahora = Date.now();
  const filas = [];
  let minutosAtras = 15;
  for (let i = 0; i < 20; i++) {
    // El hueco: entre la sexta y la séptima se saltan dos horas.
    if (i === 6) minutosAtras += 120;
    const inicio = new Date(ahora - minutosAtras * MIN);
    const conFallo = i === 3 || i === 11;
    filas.push({
      inicio: inicio.toISOString(),
      fin: new Date(inicio.getTime() + 1000).toISOString(),
      ok: !conFallo,
      duracion_ms: 1000 + i * 10,
      resultado: { repartidos: 1, sla: i % 2 === 0 ? 2 : 0, resumenes: 1 },
      fallos: conFallo ? [{ fase: 'resenas', error: 'avería de prueba' }] : [],
    });
    minutosAtras += 15;
  }
  await admin.from('ejecuciones_motor').insert(filas as never);

  const jefe = await sesion('direccion@test.com');
  const comercial = await sesion('equipo@test.com');
  if (!jefe || !comercial) process.exit(1);

  const h = await historicoDelMotor(jefe, 1);

  console.log('Los números salen de Postgres; se comparan con la cuenta hecha aquí:');
  comprobar('cuenta las 20 pasadas', h.total === 20, `${h.total}`);
  comprobar('y las 2 que fallaron', h.conFallo === 2, `${h.conFallo}`);
  comprobar(
    'la duración típica es la mediana',
    h.medianaMs !== null && h.medianaMs >= 1000 && h.medianaMs <= 1200,
    `${h.medianaMs} ms`,
  );

  /*
   * El hueco es EL número de esta pantalla: sin él, veinte pasadas sin fallos
   * parecerían un motor sano aunque hubiera estado dos horas muerto.
   */
  comprobar(
    'encuentra el hueco de 2 horas que metimos a propósito',
    h.huecoMaximoMin === 135,
    `${h.huecoMaximoMin} min (15 del ritmo + 120 del hueco)`,
  );
  /*
   * Las 20 pasadas de la prueba cubren unas seis horas, no un día entero. Si se
   * compararan contra las 96 de un día saldría un 21 % en rojo, que es
   * exactamente la falsa alarma que veria una instalacion recien estrenada. Lo
   * previsto se cuenta DESDE que hay registro.
   */
  comprobar(
    'lo previsto se cuenta desde que hay registro, no desde el borde de la ventana',
    h.esperadas > 20 && h.esperadas < 40,
    `${h.esperadas} previstas para ${h.total} pasadas de ~6 h`,
  );
  comprobar(
    'así que 20 pasadas seguidas no salen como un 21 % de cobertura',
    Math.round((h.total / h.esperadas) * 100) > 60,
    `${Math.round((h.total / h.esperadas) * 100)} %`,
  );

  console.log('\nLo que hizo, sumado:');
  const repartidos = h.totales.find((t) => t.texto.includes('repartidos'));
  const sla = h.totales.find((t) => t.texto.includes('SLA'));
  comprobar(
    '20 pasadas × 1 lead repartido = 20',
    repartidos?.cantidad === 20,
    `${repartidos?.cantidad}`,
  );
  comprobar(
    'los avisos de SLA suman 20 (2 en 10 pasadas)',
    sla?.cantidad === 20,
    `${sla?.cantidad}`,
  );
  comprobar(
    'los contadores a cero no se enseñan',
    !h.totales.some((t) => t.cantidad === 0),
    `${h.totales.length} conceptos con algo`,
  );
  comprobar(
    'el plural va escrito, no adivinado',
    h.totales.every((t) => t.unidades !== t.unidad || t.unidad.endsWith('s')),
    h.totales.map((t) => `${t.unidad}/${t.unidades}`).join(' '),
  );

  console.log('\nLas fases que fallaron:');
  comprobar('agrupa por fase', h.fasesConFallo.length === 1, `${h.fasesConFallo.length}`);
  comprobar(
    'con las 2 veces que falló',
    h.fasesConFallo[0]?.veces === 2,
    `${h.fasesConFallo[0]?.veces}`,
  );
  comprobar(
    'y con el mensaje, no solo el nombre',
    h.fasesConFallo[0]?.ultimoError === 'avería de prueba',
    h.fasesConFallo[0]?.ultimoError,
  );

  console.log('\nLo que viaja al navegador:');
  comprobar(
    `en crudo vienen como mucho ${PASADAS_EN_DETALLE} pasadas`,
    h.pasadas.length <= PASADAS_EN_DETALLE,
    `${h.pasadas.length}`,
  );
  comprobar('la más reciente primero', h.pasadas[0]?.inicio > h.pasadas[1]?.inicio);

  /*
   * Y esto es lo que justifica calcularlo en la base: el total de la ventana
   * tiene que ser correcto AUNQUE en crudo solo lleguen las últimas sesenta.
   */
  const grande = [];
  for (let i = 0; i < 80; i++) {
    const inicio = new Date(ahora - (2000 + i * 15) * MIN);
    grande.push({
      inicio: inicio.toISOString(),
      fin: inicio.toISOString(),
      ok: true,
      duracion_ms: 900,
      resultado: { repartidos: 1 },
      fallos: [],
    });
  }
  await admin.from('ejecuciones_motor').insert(grande as never);

  const h30 = await historicoDelMotor(jefe, 30);
  comprobar(
    'con 100 pasadas, el total sigue siendo 100 aunque solo bajen 60',
    h30.total === 100 && h30.pasadas.length === PASADAS_EN_DETALLE,
    `total ${h30.total}, en crudo ${h30.pasadas.length}`,
  );
  const rep30 = h30.totales.find((t) => t.texto.includes('repartidos'));
  comprobar(
    'y la suma cuenta las 100, no las 60 que se ven',
    rep30?.cantidad === 100,
    `${rep30?.cantidad} leads`,
  );

  console.log('\nEl muro:');
  const deComercial = await historicoDelMotor(comercial, 7);
  comprobar(
    'un comercial recibe ceros, no el registro',
    deComercial.total === 0 && deComercial.pasadas.length === 0,
    `total ${deComercial.total}, filas ${deComercial.pasadas.length}`,
  );

  // Se borra lo fabricado y se devuelve lo que hubiera, comprobando que vuelve.
  await vaciar();
  if ((reales ?? []).length) {
    for (let i = 0; i < reales!.length; i += 200) {
      const { error } = await admin
        .from('ejecuciones_motor')
        .insert(reales!.slice(i, i + 200) as never);
      if (error) console.log(`  AVISO  no se pudo devolver el histórico real: ${error.message}`);
    }
    const { count } = await admin
      .from('ejecuciones_motor')
      .select('id', { count: 'exact', head: true });
    comprobar(
      'el histórico real queda como estaba',
      count === reales!.length,
      `${count} de ${reales!.length}`,
    );
  }
  console.log('\n  (histórico de prueba borrado, el real devuelto)');

  console.log(
    fallos === 0
      ? '\nEl histórico cuenta lo que de verdad pasó.\n'
      : `\n${fallos} comprobación(es) FALLIDA(S).\n`,
  );
  process.exit(fallos === 0 ? 0 : 1);
}

main();
