/**
 * La dirección de un centro administra lo suyo, no lo del grupo.
 *
 * El panel de administración escribe con la CLAVE DE SERVICIO, que se salta las
 * políticas de la base. Eso significa que, en administración, las políticas no
 * defienden nada: quien decide es el `await exigir…()` de cada acción del
 * servidor. Y de veinte acciones, dieciocho pedían solo «eres dirección».
 *
 * Con eso, la dirección de Horizonte podía cambiar el SLA de los tres centros,
 * tocar los catálogos que todos comparten, borrar una etapa del proceso de
 * venta de Bellamar y retirarle el segundo factor a la dirección de grupo. Nada
 * de eso pasaba por malicia de nadie: pasaba porque no había nada que lo
 * impidiera, y el usuario ha pedido expresamente repartir la administración por
 * centros.
 *
 * Se comprueban las dos mitades, porque fallan de formas distintas:
 *
 *   1. La regla de la base (`manda_sobre_perfil`, `manda_en_grupo`) con una
 *      sesión de verdad. Es la que consultan las acciones nuevas.
 *   2. Que TODA acción exportada del panel tiene un guardián, y que las de
 *      alcance de grupo tienen el de grupo. Esto es lo que caza el fallo
 *      realista: no que alguien rompa la regla, sino que dentro de tres meses
 *      se añada una acción y se olvide el `exigir…`.
 *
 *   npx tsx --env-file=.env.staging scripts/verificar-admin-alcance.ts
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/lib/database.types';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const CLAVE = 'vidaytu-dev-2026';

const admin = createClient<Database>(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

let fallos = 0;
const comprobar = (t: string, ok: boolean, d = '') => {
  console.log(`  ${ok ? 'OK  ' : 'FALLA'}  ${t}${d ? ' — ' + d : ''}`);
  if (!ok) fallos++;
};

async function sesion(email: string) {
  const c = createClient<Database>(URL, ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await c.auth.signInWithPassword({ email, password: CLAVE });
  return error ? null : c;
}

/** Acciones que tocan algo que comparten los tres centros. */
const DE_GRUPO = [
  'crearUsuario',
  'editarUsuario',
  'crearCentro',
  'editarCentro',
  'crearElementoCatalogo',
  'editarElementoCatalogo',
  'guardarModalidadCentros',
  'crearPipeline',
  'editarPipeline',
  'anadirEtapa',
  'editarEtapa',
  'borrarEtapa',
  'guardarParametros',
];

/** Acciones sobre UNA persona: valen si esa persona es de tus centros. */
const SOBRE_UNA_PERSONA = [
  'retirarSegundoFactor',
  'guardarObjetivos',
  'guardarDisponibilidad',
  'crearAusencia',
  'borrarAusencia',
];

async function main() {
  console.log('\nAdministración por alcance\n');

  const { count: dePrueba } = await admin
    .from('perfiles')
    .select('id', { count: 'exact', head: true })
    .like('email', '%@test.com');
  if ((dePrueba ?? 0) === 0) {
    console.log('  Esto no parece un entorno de pruebas.\n');
    process.exit(1);
  }

  // ---------------------------------------------------------------------------
  console.log('La regla de la base, con una sesión de verdad:');

  const jefe = await sesion('dir-horizonte@test.com');
  if (!jefe) {
    console.log('  --    falta dir-horizonte@test.com; sin ella no se puede comprobar\n');
    process.exit(1);
  }

  const { data: perfiles } = await admin.from('perfiles').select('id, email');
  const id = (email: string) => perfiles!.find((p) => p.email === email)!.id;

  const { data: enGrupo } = await jefe.rpc('manda_en_grupo');
  comprobar('la dirección de Horizonte NO manda en el grupo', enGrupo === false);

  const { data: sobreLosSuyos } = await jefe.rpc('manda_sobre_perfil', {
    p_perfil: id('horizonte@test.com'),
  });
  comprobar('sí manda sobre la gente de su centro', sobreLosSuyos === true);

  const { data: sobreOtros } = await jefe.rpc('manda_sobre_perfil', {
    p_perfil: id('equipo@test.com'),
  });
  comprobar(
    'no manda sobre quien es de Eclipse y Bellamar',
    sobreOtros === false,
    `devolvió ${sobreOtros}`,
  );

  const { data: sobreLaDeGrupo } = await jefe.rpc('manda_sobre_perfil', {
    p_perfil: id('direccion@test.com'),
  });
  comprobar(
    'ni sobre la dirección de grupo — que es lo que le dejaría quitarle el 2FA',
    sobreLaDeGrupo === false,
    `devolvió ${sobreLaDeGrupo}`,
  );

  /*
   * El contraste. Sin esto, las tres comprobaciones de arriba las aprobaria
   * tambien una funcion que devolviera `false` siempre, que es la forma mas
   * facil de tener un permiso «seguro» y roto.
   */
  const deGrupo = await sesion('direccion@test.com');
  comprobar('hay sesión de la dirección de grupo para contrastar', deGrupo !== null);
  if (deGrupo) {
    const { data: mandaEnTodo } = await deGrupo.rpc('manda_en_grupo');
    comprobar('y esa sí manda en el grupo', mandaEnTodo === true, `devolvió ${mandaEnTodo}`);
    const { data: sobreCualquiera } = await deGrupo.rpc('manda_sobre_perfil', {
      p_perfil: id('equipo@test.com'),
    });
    comprobar('y sobre cualquier persona', sobreCualquiera === true);
  }

  // ---------------------------------------------------------------------------
  console.log('\nTodas las acciones del panel tienen guardián:');

  const codigo = readFileSync('src/app/admin/actions.ts', 'utf8');

  /*
   * Se recorre el fichero entero y se parte por cada `export async function`.
   * Asi entra en la cuenta cualquier accion NUEVA sin tener que apuntarla aqui:
   * si alguien anade una y no le pone guardian, este bloque falla solo.
   */
  const trozos = codigo.split(/export async function /).slice(1);
  const acciones = trozos.map((t) => ({
    nombre: t.slice(0, t.indexOf('(')),
    cuerpo: t.slice(0, t.indexOf('\n}\n') + 1 || t.length),
  }));

  comprobar(
    `se han encontrado las ${acciones.length} acciones del panel`,
    acciones.length >= 20,
    acciones.map((a) => a.nombre).join(', ').slice(0, 90) + '…',
  );

  const sinGuardian = acciones.filter(
    (a) => !/await exigir(Direccion|DireccionDeGrupo|MandoSobrePerfil)\b/.test(a.cuerpo),
  );
  comprobar(
    'ninguna acción se queda sin comprobar quién llama',
    sinGuardian.length === 0,
    sinGuardian.map((a) => a.nombre).join(', '),
  );

  const grupoFlojas = DE_GRUPO.filter((n) => {
    const a = acciones.find((x) => x.nombre === n);
    return !a || !/await exigirDireccionDeGrupo\(/.test(a.cuerpo);
  });
  comprobar(
    'lo que rige para los tres centros pide dirección de GRUPO',
    grupoFlojas.length === 0,
    grupoFlojas.join(', '),
  );

  const personaFlojas = SOBRE_UNA_PERSONA.filter((n) => {
    const a = acciones.find((x) => x.nombre === n);
    return !a || !/await exigirMandoSobrePerfil\(/.test(a.cuerpo);
  });
  comprobar(
    'lo que es sobre una persona comprueba que sea de los tuyos',
    personaFlojas.length === 0,
    personaFlojas.join(', '),
  );

  // Los traspasos de cartera no reciben un perfil suelto, sino dos, y por eso
  // no encajan en la lista de arriba: se comprueban aparte.
  for (const n of ['reasignarEnBloque', 'traspasarTodo']) {
    const a = acciones.find((x) => x.nombre === n);
    comprobar(
      `${n} comprueba a las dos personas`,
      !!a && /manda_sobre_perfil/.test(a.cuerpo) && /esDeGrupo/.test(a.cuerpo),
    );
  }

  // ---------------------------------------------------------------------------
  console.log('\nLa navegación no ofrece lo que va a rebotar:');

  const shell = readFileSync('src/components/app-shell.tsx', 'utf8');
  comprobar(
    'el menú esconde los ajustes de grupo a quien dirige un centro',
    /soloGrupo[\s\S]*\|\|[\s\S]{0,60}alcance === 'grupo'/.test(shell),
  );
  for (const ruta of ['/admin/parametros', '/admin/catalogos', '/admin/pipelines', '/admin/centros']) {
    comprobar(
      `${ruta} marcado como solo de grupo`,
      new RegExp(`href: '${ruta}', soloGrupo: true`).test(shell),
    );
  }

  console.log(
    fallos === 0
      ? '\nCada dirección administra lo suyo.\n'
      : `\n${fallos} comprobación(es) FALLIDA(S).\n`,
  );
  process.exit(fallos === 0 ? 0 : 1);
}

main();
