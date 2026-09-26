/**
 * Nada se pierde por el camino.
 *
 * PostgREST corta en 1.000 filas y NO avisa: devuelve mil y se calla. Una
 * consulta sin límite parece que lo trae todo, así que el fallo no aparece
 * hasta que la tabla pasa de ese número — y entonces se manifiesta como datos
 * que faltan sin motivo.
 *
 * Lo peligroso no es la pantalla: es la exportación que dirección cree
 * completa, el segmento que decide a quién llega una campaña y el motor que
 * dejaría de etiquetar al caso 1.001.
 *
 * Se comprueban dos cosas distintas:
 *
 *   1. Que el paginador reconstruye el total exacto, sin repetir ni saltarse
 *      a nadie. Se prueba con páginas diminutas para que el reparto ocurra de
 *      verdad aunque la tabla sea pequeña.
 *   2. Que la lista de contactos pagina de forma estable: la página 2 no
 *      repite a nadie de la 1.
 *
 *   npx tsx --env-file=.env.local scripts/verificar-paginacion.ts
 */
import { createClient } from '@supabase/supabase-js';
import { traerTodo } from '../src/lib/paginar';
import type { Database } from '../src/lib/database.types';

const admin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

let fallos = 0;
const comprobar = (t: string, ok: boolean, d = '') => {
  console.log(`  ${ok ? 'OK  ' : 'FALLA'}  ${t}${d ? ' — ' + d : ''}`);
  if (!ok) fallos++;
};

const POR_PAGINA = 50;

async function main() {
  console.log('\nNada se pierde por el camino\n');

  const { count: total } = await admin
    .from('contactos')
    .select('id', { count: 'exact', head: true });
  console.log(`  (${total} personas en el directorio)\n`);

  if (!total) {
    console.log('  Directorio vacío: no hay nada que paginar.\n');
    return;
  }

  // ---------------------------------------------------------------------------
  console.log('El paginador trae exactamente lo que hay:');

  /*
   * Con páginas de 7. La tabla tiene menos de mil, así que con el tamaño real
   * el bucle daría una sola vuelta y no probaría nada: hay que forzar que el
   * reparto ocurra.
   */
  const { filas, truncado } = await traerTodo(
    (d, h) => admin.from('contactos').select('id').order('id').range(d, h),
    { tamano: 7 },
  );

  comprobar('el número cuadra con el recuento', filas.length === total, `${filas.length} de ${total}`);
  comprobar('sin repetidos', new Set(filas.map((f) => f.id)).size === filas.length);
  comprobar('y no dice estar truncado', truncado === false);

  // Y que el tope existe: con un tope de 1 página de 7, tiene que avisar.
  const corto = await traerTodo(
    (d, h) => admin.from('contactos').select('id').order('id').range(d, h),
    { tamano: 7, topePaginas: 1 },
  );
  comprobar(
    'si se queda corto, LO DICE',
    corto.truncado === true && corto.filas.length === 7,
    'callarlo es lo que hace peligroso el corte de mil',
  );

  // ---------------------------------------------------------------------------
  console.log('\nLa lista de contactos pagina sin perder a nadie:');

  const paginas = Math.ceil(total / POR_PAGINA);
  const vistos = new Set<string>();
  let repetidos = 0;

  for (let p = 1; p <= paginas; p++) {
    const desde = (p - 1) * POR_PAGINA;
    const { data } = await admin
      .from('contactos')
      .select('id')
      .order('nombre')
      .order('id')
      .range(desde, desde + POR_PAGINA - 1);
    for (const c of data ?? []) {
      if (vistos.has(c.id)) repetidos++;
      vistos.add(c.id);
    }
  }

  comprobar(`en ${paginas} página(s) salen todas`, vistos.size === total, `${vistos.size} de ${total}`);
  comprobar(
    'y ninguna dos veces',
    repetidos === 0,
    'sin un segundo criterio de orden, los nombres repetidos bailan entre páginas',
  );

  // ---------------------------------------------------------------------------
  console.log('\nEl filtro por centro no arrastra identificadores:');

  const { data: centro } = await admin
    .from('centros')
    .select('id, nombre')
    .eq('es_bandeja_grupo', false)
    .limit(1)
    .maybeSingle();

  if (centro) {
    /*
     * La forma que usa la pantalla: `!inner` deja el filtrado en la base. La
     * primera versión traía todos los leads del centro y metía sus contactos
     * en un `in(...)`, que con unos miles no cabe en la URL.
     */
    const { data, error } = await admin
      .from('contactos')
      .select('id, lead_contactos!inner (lead:leads!inner (centro_id))')
      .eq('lead_contactos.lead.centro_id', centro.id)
      .limit(5);
    comprobar(
      `la consulta con !inner funciona (${centro.nombre})`,
      !error,
      error?.message ?? `${(data ?? []).length} persona(s)`,
    );
  }

  console.log(
    fallos === 0
      ? '\nLo que se enseña y lo que se exporta es todo lo que hay.\n'
      : `\n${fallos} comprobación(es) FALLIDA(S).\n`,
  );
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\nFALLÓ:', e instanceof Error ? e.message : e, '\n');
  process.exit(1);
});
