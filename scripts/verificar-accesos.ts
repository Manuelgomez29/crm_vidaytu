/**
 * El registro de accesos y la presencia dicen la verdad y no se pueden falsear.
 *
 * Aquí hay dos cosas que, si fallan, fallan hacia el lado malo:
 *
 *   1. Un registro de seguridad que se puede escribir desde la aplicación no
 *      sirve de nada: quien entra por la fuerza también puede ahogarlo en ruido
 *      o esconder ahí sus intentos. Tiene que ser de solo lectura, y solo para
 *      dirección.
 *
 *   2. Una lista de «quién está dentro» que se puede falsear tampoco: si
 *      cualquiera puede marcar la presencia de un compañero —o borrarla—, la
 *      pantalla que decide a quién pasarle un caso urgente está mintiendo.
 *
 * Y un tercero más sutil: los intentos FALLIDOS tienen que quedar registrados.
 * Es la mitad que importa, y es justo la que se cae sola si alguien reordena el
 * código del login, porque `redirect()` de Next funciona lanzando.
 *
 *   npx tsx --env-file=.env.staging scripts/verificar-accesos.ts
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { registrarAcceso, limpiarAccesos, quienEstaDentro, dispositivo } from '../src/lib/accesos';
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
  const { data, error } = await cliente.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) {
    comprobar(`sesión de ${email}`, false, error.message);
    return null;
  }
  return { cliente, id: data.user!.id };
}

async function main() {
  console.log('\nAccesos y presencia\n');

  const jefe = await sesion('direccion@test.com');
  const comercial = await sesion('equipo@test.com');
  if (!jefe || !comercial) process.exit(1);

  // ---------------------------------------------------------------------------
  console.log('Lo que queda escrito:');

  const marca = `prueba-${Date.now()}@test.com`;
  await registrarAcceso(admin, {
    email: 'equipo@test.com',
    exito: false,
    etapa: 'clave',
    motivo: 'credenciales',
    ip: '198.51.100.7',
    agente: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
  });
  await registrarAcceso(admin, {
    email: marca,
    exito: false,
    etapa: 'clave',
    motivo: 'credenciales',
    ip: '198.51.100.8',
    agente: 'curl/8.4.0',
  });

  const { data: escritos } = await admin
    .from('accesos')
    .select('email, exito, etapa, motivo, ip, usuario_id')
    .in('email', ['equipo@test.com', marca])
    .order('created_at', { ascending: false })
    .limit(2);

  const deConocido = (escritos ?? []).find((a) => a.email === 'equipo@test.com');
  const deDesconocido = (escritos ?? []).find((a) => a.email === marca);

  comprobar(
    'un fallo con una cuenta real queda atado a esa persona',
    Boolean(deConocido?.usuario_id),
  );
  comprobar(
    'un fallo con un correo que no existe se registra IGUAL, sin usuario',
    Boolean(deDesconocido) && deDesconocido?.usuario_id === null,
    'es la señal de que alguien está probando nombres',
  );
  comprobar('se guarda desde dónde', deConocido?.ip === '198.51.100.7');

  /*
   * El login redirige con `redirect()`, que en Next funciona LANZANDO. Si la
   * llamada al registro quedara detrás del redirect, no se ejecutaría nunca y
   * el registro de fallos estaría vacío sin que nadie lo notara. Se mira en el
   * código porque es lo único que lo garantiza.
   */
  const login = readFileSync('src/app/login/actions.ts', 'utf8');
  const antesDeCredenciales = login.indexOf("anotar(false, 'credenciales')");
  const redirectCredenciales = login.indexOf(
    "redirect('/login?error=credenciales')",
    antesDeCredenciales,
  );
  comprobar(
    'el fallo se anota ANTES de redirigir (si no, no se anotaría nunca)',
    antesDeCredenciales > 0 && redirectCredenciales > antesDeCredenciales,
  );
  comprobar(
    'y también el bloqueo por demasiados intentos',
    login.includes("anotar(false, 'demasiados')"),
  );
  comprobar('y la entrada buena', login.includes('await anotar(true);'));

  comprobar(
    'el navegador se resume en algo legible',
    dispositivo('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/605.1') ===
      'Safari en iPhone o iPad',
    dispositivo('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/605.1'),
  );

  // ---------------------------------------------------------------------------
  console.log('\nQuién puede leerlo y quién escribirlo:');

  const { data: vistoPorComercial } = await comercial.cliente.from('accesos').select('id');
  comprobar(
    'un comercial no ve el registro de accesos',
    (vistoPorComercial ?? []).length === 0,
    `devolvió ${(vistoPorComercial ?? []).length}`,
  );

  const { data: vistoPorJefe } = await jefe.cliente.from('accesos').select('id').limit(5);
  comprobar(
    'dirección sí (si no, la prueba pasaría por estar todo roto)',
    (vistoPorJefe ?? []).length > 0,
  );

  /*
   * Nadie escribe aquí desde la aplicación, ni dirección. Un registro de
   * seguridad al que puede escribir el usuario vigilado no es un registro.
   */
  const { error: intentoEscribir } = await jefe.cliente
    .from('accesos')
    .insert({ email: 'falso@test.com', exito: true, etapa: 'clave' });
  comprobar(
    'ni dirección puede escribir una entrada a mano',
    intentoEscribir !== null,
    intentoEscribir ? 'rechazado por la base' : 'LA BASE LO ACEPTÓ',
  );

  const { error: intentoBorrar } = await jefe.cliente
    .from('accesos')
    .delete()
    .eq('email', 'equipo@test.com');
  comprobar(
    'ni borrar lo que ya está escrito',
    intentoBorrar !== null || (await sigueEstando('equipo@test.com')),
    'un registro que se puede podar no prueba nada',
  );

  // ---------------------------------------------------------------------------
  console.log('\nPresencia:');

  await admin.from('presencia_app').delete().eq('perfil_id', comercial.id);
  const { error: alMarcar } = await comercial.cliente
    .from('presencia_app')
    .upsert(
      { perfil_id: comercial.id, visto_at: new Date().toISOString() },
      { onConflict: 'perfil_id' },
    );
  comprobar('cada uno puede marcar la suya', alMarcar === null, alMarcar?.message ?? '');

  const dentro = await quienEstaDentro(jefe.cliente);
  const elComercial = dentro.gente.find((p) => p.id === comercial.id);
  comprobar(
    'y sale como conectado',
    elComercial?.ahora === true,
    `visto hace ${elComercial?.minutos} min`,
  );

  comprobar(
    'la lista incluye a quien NO está, que es igual de útil',
    dentro.gente.length > dentro.gente.filter((p) => p.ahora).length,
    `${dentro.gente.filter((p) => p.ahora).length} dentro de ${dentro.gente.length}`,
  );

  /*
   * Falsear la presencia de otro sería poder decir que un compañero está
   * disponible cuando no lo está, y esta pantalla se usa para repartir trabajo
   * urgente.
   */
  const { error: alSuplantar } = await comercial.cliente
    .from('presencia_app')
    .upsert(
      { perfil_id: jefe.id, visto_at: new Date().toISOString() },
      { onConflict: 'perfil_id' },
    );
  comprobar(
    'nadie puede marcar la presencia de otro',
    alSuplantar !== null,
    alSuplantar ? 'rechazado por la base' : 'LA BASE LO ACEPTÓ',
  );

  await admin
    .from('presencia_app')
    .upsert(
      { perfil_id: jefe.id, visto_at: new Date().toISOString() },
      { onConflict: 'perfil_id' },
    );
  const { error: alBorrarOtro } = await comercial.cliente
    .from('presencia_app')
    .delete()
    .eq('perfil_id', jefe.id);
  const { data: sigue } = await admin
    .from('presencia_app')
    .select('perfil_id')
    .eq('perfil_id', jefe.id)
    .maybeSingle();
  comprobar(
    'ni desconectar a otro de la lista',
    Boolean(sigue),
    alBorrarOtro ? 'rechazado' : 'la fila del jefe sigue ahí',
  );

  const { error: alBorrarLaSuya } = await comercial.cliente
    .from('presencia_app')
    .delete()
    .eq('perfil_id', comercial.id);
  const { data: yaNo } = await admin
    .from('presencia_app')
    .select('perfil_id')
    .eq('perfil_id', comercial.id)
    .maybeSingle();
  comprobar(
    'pero sí la suya, que es lo que pasa al cerrar sesión',
    alBorrarLaSuya === null && yaNo === null,
  );

  /*
   * Un comercial ve SU fila y solo la suya. Lo primero hace falta para que el
   * latido funcione —el upsert es `on conflict do update`, y Postgres tiene que
   * poder mirar la fila existente para resolver el conflicto—; lo segundo es
   * que la lista de quién está conectado es información sobre el equipo y la
   * mira dirección, no los compañeros entre sí.
   */
  await comercial.cliente
    .from('presencia_app')
    .upsert(
      { perfil_id: comercial.id, visto_at: new Date().toISOString() },
      { onConflict: 'perfil_id' },
    );
  await admin
    .from('presencia_app')
    .upsert(
      { perfil_id: jefe.id, visto_at: new Date().toISOString() },
      { onConflict: 'perfil_id' },
    );

  const { data: presenciaVista } = await comercial.cliente
    .from('presencia_app')
    .select('perfil_id');
  comprobar(
    'un comercial ve su propia marca (sin eso el latido no podría escribirse)',
    (presenciaVista ?? []).some((p) => p.perfil_id === comercial.id),
  );
  comprobar(
    'pero no la de nadie más',
    !(presenciaVista ?? []).some((p) => p.perfil_id !== comercial.id),
    `vio ${(presenciaVista ?? []).length} fila(s)`,
  );

  // ---------------------------------------------------------------------------
  console.log('\nRetención:');

  const viejo = new Date(Date.now() - 400 * 86_400_000).toISOString();
  const { data: antiguo } = await admin
    .from('accesos')
    .insert({ email: 'antiguo@test.com', exito: true, etapa: 'clave', created_at: viejo })
    .select('id')
    .single();

  const borrados = await limpiarAccesos(admin);
  const { data: quedaElViejo } = await admin
    .from('accesos')
    .select('id')
    .eq('id', antiguo!.id)
    .maybeSingle();

  comprobar(
    'el motor borra lo que pasa del plazo configurado',
    borrados > 0 && quedaElViejo === null,
    `${borrados} borrado(s)`,
  );
  const { data: quedaElNuevo } = await admin
    .from('accesos')
    .select('id')
    .eq('email', marca)
    .maybeSingle();
  comprobar('y NO se lleva por delante lo reciente', Boolean(quedaElNuevo));

  // Limpieza de lo fabricado aquí.
  await admin.from('accesos').delete().in('email', [marca, 'antiguo@test.com']);
  await admin.from('presencia_app').delete().in('perfil_id', [jefe.id, comercial.id]);

  console.log(
    fallos === 0
      ? '\nEl registro no se puede falsear y la presencia dice la verdad.\n'
      : `\n${fallos} comprobación(es) FALLIDA(S).\n`,
  );
  process.exit(fallos === 0 ? 0 : 1);
}

/** ¿Sigue habiendo filas de ese correo? Un borrado silencioso también es un fallo. */
async function sigueEstando(email: string): Promise<boolean> {
  const { count } = await admin
    .from('accesos')
    .select('id', { count: 'exact', head: true })
    .eq('email', email);
  return (count ?? 0) > 0;
}

main();
