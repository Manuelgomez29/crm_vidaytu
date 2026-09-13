/**
 * Lo mismo que enseña /admin/puesta-en-marcha, pero en la consola.
 *
 * Sirve para mirar el estado de PRODUCCIÓN sin tener que entrar, y para dejar
 * constancia de él en un despliegue. Es la misma función, no una copia: si las
 * dos divergieran, la de la consola sería la que miente.
 *
 *   npx tsx --env-file=.env.local   scripts/puesta-en-marcha.ts
 *   npx tsx --env-file=.env.staging scripts/puesta-en-marcha.ts
 */
import { createClient } from '@supabase/supabase-js';
import { puestaEnMarcha, resumen } from '../src/lib/puesta-en-marcha';
import type { Database } from '../src/lib/database.types';

const admin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

async function main() {
  console.log('\nPuesta en marcha —', process.env.NEXT_PUBLIC_SUPABASE_URL, '\n');

  // Las dos veces `admin`: en la consola no hay sesión de nadie, y lo que se
  // quiere ver es el estado real, no el que vería un usuario concreto.
  const puntos = await puestaEnMarcha(admin, admin);

  /*
   * AVISO, y no es menor. La mitad de las comprobaciones miran la BASE y valen
   * igual desde aqui. La otra mitad mira VARIABLES DE ENTORNO, y aqui son las
   * del fichero con el que se ha lanzado el script, NO las del servidor donde
   * corre la aplicacion. Un «falta RESEND_API_KEY» desde este portatil no
   * significa que falte en Vercel: significa que falta aqui.
   *
   * Sin esto, el script da una foto que parece de produccion y es de otro
   * sitio, que es la clase de dato con la que se decide mal y con confianza.
   */
  console.log('  Aviso: las lineas de VARIABLES DE ENTORNO se leen del fichero de');
  console.log('  este ordenador, no del servidor. Para esas, abre la pantalla');
  console.log('  /admin/puesta-en-marcha en el entorno de verdad. Las que miran la');
  console.log('  BASE si valen desde aqui.');

  const { bloquean, convienen, hechos, total } = resumen(puntos);

  for (const p of puntos) {
    const marca = p.hecho ? 'OK   ' : p.gravedad === 'bloquea' ? 'FALTA' : 'falta';
    console.log(`  ${marca}  ${p.titulo}`);
    console.log(`         ${p.detalle}`);
  }

  console.log(
    `\n  ${hechos} de ${total} · ${bloquean.length} bloquean · ${convienen.length} convienen\n`,
  );
  process.exit(0);
}

main();
