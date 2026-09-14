/**
 * «He olvidado mi contraseña» funciona, y no se convierte en un agujero.
 *
 * Una pantalla pública que manda correos a partir de una dirección escrita a
 * mano es, sin cuidado, tres cosas malas a la vez: una lista de quién trabaja
 * aquí, un grifo para gastar la cuota de envíos del proyecto, y una puerta de
 * vuelta para quien ya no debería entrar. Así que no se comprueba solo que el
 * enlace exista:
 *
 *   1. El registro admite la etapa nueva. Sin eso, ni la petición se anota.
 *   2. El freno frena de verdad: se agota el límite contando intentos.
 *   3. Quien está de baja no recibe enlace, y el correo desconocido responde
 *      igual que el conocido.
 *   4. El correo aterriza donde se puede canjear el testigo.
 *   5. Y el camino está entero: enlace en el login, ruta pública, y el peaje
 *      del segundo factor devuelve a elegir contraseña en vez de al tablero.
 *
 *   npx tsx --env-file=.env.staging scripts/verificar-recuperacion.ts
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/lib/database.types';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const REF = new URL(url).hostname.split('.')[0];
const admin = createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

let fallos = 0;
const comprobar = (t: string, ok: boolean, d = '') => {
  console.log(`  ${ok ? 'OK  ' : 'FALLA'}  ${t}${d ? ' — ' + d : ''}`);
  if (!ok) fallos++;
};
const fuente = (ruta: string) => readFileSync(ruta, 'utf8');

async function sql(query: string) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  return { ok: r.ok, cuerpo: await r.text() };
}

const CORREO = 'prueba-recuperacion@ejemplo.invalid';

async function main() {
  console.log('\nHe olvidado mi contraseña\n');

  // ---------------------------------------------------------------------------
  console.log('El registro de accesos admite la petición:');

  const { error: eInsert } = await admin.from('accesos').insert({
    email: CORREO,
    exito: false,
    etapa: 'recuperacion',
    motivo: 'desconocida',
  });
  comprobar('se puede anotar una etapa «recuperacion»', !eInsert, eInsert?.message ?? '');

  // Y lo que NO es una etapa conocida sigue rechazándose: si la migración
  // hubiera quitado la restricción en vez de ampliarla, esto pasaría.
  const invento = await sql(
    `insert into accesos (email, exito, etapa) values ('${CORREO}', false, 'loquesea');`,
  );
  comprobar(
    'y una etapa inventada se sigue rechazando',
    !invento.ok && invento.cuerpo.includes('accesos_etapa_check'),
  );

  await admin.from('accesos').delete().eq('email', CORREO);

  // ---------------------------------------------------------------------------
  console.log('\nEl freno frena:');

  const { data: cfg } = await admin
    .from('configuracion')
    .select('valor')
    .eq('clave', 'limites_peticiones')
    .maybeSingle();
  const limites = (cfg?.valor ?? {}) as Record<string, { maximo: number; ventana: number }>;
  comprobar(
    'el límite por cuenta está configurado y se puede editar',
    !!limites.recuperar_por_cuenta,
    JSON.stringify(limites.recuperar_por_cuenta),
  );
  comprobar('el límite por IP también', !!limites.recuperar_por_ip);
  comprobar(
    'y los del login siguen donde estaban',
    !!limites.login_por_cuenta && !!limites.login_por_ip,
    'la migración fusiona, no pisa',
  );

  /*
   * Se gasta el límite de verdad, contra la misma función que usa la pantalla.
   * Comprobar que el número está escrito en `configuracion` no prueba nada:
   * lo que importa es que al intento de más le digan que no.
   */
  const maximo = limites.recuperar_por_cuenta?.maximo ?? 3;
  const clave = `recuperar_por_cuenta:${CORREO}`;
  await admin.from('limite_peticiones').delete().eq('clave', clave);

  const respuestas: boolean[] = [];
  for (let i = 0; i < maximo + 1; i++) {
    const { data } = await admin.rpc('consumir_intento', {
      p_clave: clave,
      p_maximo: maximo,
      p_ventana_segundos: limites.recuperar_por_cuenta?.ventana ?? 3600,
    });
    respuestas.push(data !== false);
  }
  comprobar(
    `los primeros ${maximo} pasan y el siguiente no`,
    respuestas.slice(0, maximo).every(Boolean) && respuestas[maximo] === false,
    respuestas.map((r) => (r ? 'sí' : 'NO')).join(' · '),
  );
  await admin.from('limite_peticiones').delete().eq('clave', clave);

  // ---------------------------------------------------------------------------
  console.log('\nA quien no debe, no se le manda:');

  const accion = fuente('src/app/clave-olvidada/actions.ts');
  comprobar(
    'se comprueba que la cuenta esté activa antes de mandar nada',
    /select\('email, activo'\)/.test(accion) && /if \(!perfil\.activo\)/.test(accion),
    'un ex-empleado no recupera el acceso él solo',
  );
  comprobar(
    'el correo desconocido y el bueno responden igual',
    (accion.match(/\/clave-olvidada\?enviado=1/g) ?? []).length >= 3,
    'si contestaran distinto, el formulario sería una lista del equipo',
  );
  comprobar(
    'los tres casos quedan anotados',
    /anotar\(false, 'desconocida'\)/.test(accion) &&
      /anotar\(false, 'inactiva'\)/.test(accion) &&
      /anotar\(!error/.test(accion),
  );
  comprobar(
    'aquí no se fija ninguna contraseña',
    !/updateUser|updateUserById/.test(accion),
    'solo se manda el enlace',
  );

  // ---------------------------------------------------------------------------
  console.log('\nEl correo aterriza donde se puede canjear:');

  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/config/auth`, {
    headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` },
  });
  const auth = (await r.json()) as Record<string, string>;
  const plantilla = String(auth.mailer_templates_recovery_content ?? '');
  comprobar(
    'la plantilla lleva a /auth/confirmar con el testigo',
    /\/auth\/confirmar\?token_hash=.*type=recovery/.test(plantilla),
    'si apuntara a la pantalla directamente, llegaría sin sesión y al login',
  );
  comprobar('y de ahí a elegir contraseña', /next=\/establecer-clave/.test(plantilla));
  /*
   * `site_url` es lo que Supabase pone delante del enlace del correo, asi que
   * si apunta a `localhost` el enlace no sirve para nadie que no sea quien
   * programa. Lo que NO se puede comprobar desde aqui es si coincide con la
   * direccion real de la aplicacion: `NEXT_PUBLIC_URL_APP` se lee del fichero
   * de este ordenador —que apunta a localhost— y la de verdad vive en Vercel.
   * Comparar las dos daba un fallo que no lo era, que es peor que no mirar.
   */
  const sitio = String(auth.site_url ?? '').replace(/\/+$/, '');
  const local = (process.env.NEXT_PUBLIC_URL_APP ?? '').replace(/\/+$/, '');
  const esLocal = /^https?:\/\/(localhost|127\.)/.test(sitio);
  comprobar(
    'el enlace del correo sale con una dirección que se puede abrir',
    sitio.length > 0 && (!esLocal || /^https?:\/\/(localhost|127\.)/.test(local)),
    esLocal ? `${sitio} — entorno de desarrollo` : sitio,
  );

  // ---------------------------------------------------------------------------
  console.log('\nEl camino está entero:');

  comprobar(
    'el login ofrece el enlace',
    /clave-olvidada/.test(fuente('src/app/login/page.tsx')),
    'sin esto, la pantalla existe y no la encuentra nadie',
  );
  comprobar(
    'la ruta es pública',
    /PUBLICAS = \[[^\]]*'\/clave-olvidada'/.test(fuente('src/middleware.ts')),
    'quien no puede entrar no tiene sesión: sin esto, al login y vuelta a empezar',
  );
  comprobar(
    '/establecer-clave sigue exenta del segundo factor',
    /esElegirClave/.test(fuente('src/middleware.ts')),
  );

  /*
   * El caso que rompia esto de verdad, y que no se ve hasta que le pasa a
   * alguien con 2FA: el enlace trae sesion, el middleware exige el codigo
   * —bien: un correo robado no puede saltarse el segundo factor— y al
   * superarlo aterrizaba en el tablero. La contraseña vieja, intacta.
   */
  const confirmar = fuente('src/app/auth/confirmar/route.ts');
  const pagina2fa = fuente('src/app/login/2fa/page.tsx');
  const verificar = fuente('src/app/login/2fa/verificar.tsx');
  comprobar(
    'el enlace deja apuntado a dónde iba',
    /vd-elegir-clave/.test(confirmar) && /httpOnly: true/.test(confirmar),
  );
  comprobar(
    'el segundo factor lo lee y devuelve a elegir contraseña',
    /vd-elegir-clave/.test(pagina2fa) && /siguiente=\{siguiente\}/.test(pagina2fa),
  );
  comprobar(
    'y quien entra normal sigue yendo al tablero',
    /siguiente = '\/mi-dia'/.test(verificar),
  );
  comprobar(
    'la nota se borra al guardar la contraseña',
    /delete\('vd-elegir-clave'\)/.test(fuente('src/app/establecer-clave/actions.ts')),
    'si se quedara, el próximo acceso volvería a pedir contraseña nueva',
  );

  console.log(
    fallos === 0
      ? '\nQuien se queda fuera puede volver a entrar sin depender de nadie.\n'
      : `\n${fallos} comprobación(es) FALLIDA(S).\n`,
  );
  process.exit(fallos === 0 ? 0 : 1);
}

main();
