/**
 * La previsión del panel y la del informe dicen lo mismo.
 *
 * Se calcula en dos sitios —la tarjeta del panel y el PDF mensual— y eso es una
 * invitación a que se separen sin que nadie lo note: dos cifras distintas del
 * mismo mes, una en pantalla y otra en el correo de dirección. Esto lo impide.
 *
 * Monta un presupuesto de prueba sobre un caso abierto, calcula a mano lo que
 * debería salir, y compara con la función real. Luego lo deshace.
 *
 *   npx tsx --env-file=.env.staging scripts/verificar-prevision.ts
 */
import { createClient } from '@supabase/supabase-js';
import { preverIngresos } from '../src/lib/informe-pdf';
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

/** La misma regla que aplica la tarjeta del panel, escrita aquí a mano. */
async function comoElPanel(): Promise<number> {
  const [{ data: cfg }, { data: presupuestos }] = await Promise.all([
    admin.from('configuracion').select('valor').eq('clave', 'prevision_probabilidad').maybeSingle(),
    admin
      .from('presupuestos')
      .select('importe, estado, lead:leads (estado)')
      .neq('estado', 'rechazado'),
  ]);
  const prob = (cfg?.valor ?? {}) as Record<string, number>;
  let total = 0;
  for (const p of presupuestos ?? []) {
    const estado = (p.lead as { estado: string } | null)?.estado;
    if (!estado || !prob[estado]) continue;
    total += Number(p.importe ?? 0) * (prob[estado] / 100);
  }
  return Math.round(total);
}

async function main() {
  console.log('\nPrevisión de ingresos\n');

  const { data: cfg } = await admin
    .from('configuracion')
    .select('valor')
    .eq('clave', 'prevision_probabilidad')
    .maybeSingle();
  const prob = (cfg?.valor ?? {}) as Record<string, number>;

  // Un caso abierto cuyo estado tenga probabilidad, para poder calcular a mano.
  const { data: abiertos } = await admin
    .from('leads')
    .select('id, nombre, estado, modalidad_interes_id')
    .not('estado', 'in', '(convertido,perdido,no_valido,derivado)')
    .limit(20);

  const caso = (abiertos ?? []).find((l) => prob[l.estado] !== undefined);
  if (!caso) {
    console.log('  No hay ningún caso abierto con probabilidad configurada.\n');
    process.exit(1);
  }

  const base = await preverIngresos(admin);
  const baseNum = base ?? 0;
  console.log(`  Previsión de partida: ${baseNum} €`);
  console.log(`  Caso de prueba: «${caso.nombre}» (${caso.estado}, ${prob[caso.estado]}%)\n`);

  const IMPORTE = 1000;
  const { data: nuevo } = await admin
    .from('presupuestos')
    .insert({
      lead_id: caso.id,
      importe: IMPORTE,
      estado: 'propuesto',
      descripcion: 'Verificación automática — se borra al terminar',
    })
    .select('id')
    .single();

  const esperado = Math.round(baseNum + IMPORTE * (prob[caso.estado] / 100));
  const conNuevo = (await preverIngresos(admin)) ?? 0;
  const panel = await comoElPanel();

  comprobar(
    `Un presupuesto de ${IMPORTE} € al ${prob[caso.estado]}% suma lo que debe`,
    conNuevo === esperado,
    `esperado ${esperado} €, obtenido ${conNuevo} €`,
  );
  comprobar(
    'El informe y el panel dan la MISMA cifra',
    conNuevo === panel,
    `informe ${conNuevo} € · panel ${panel} €`,
  );

  // Un presupuesto rechazado no cuenta.
  if (nuevo) await admin.from('presupuestos').update({ estado: 'rechazado' }).eq('id', nuevo.id);
  const trasRechazar = (await preverIngresos(admin)) ?? 0;
  comprobar(
    'Un presupuesto rechazado deja de contar',
    trasRechazar === baseNum,
    `${trasRechazar} € frente a ${baseNum} € de partida`,
  );

  if (nuevo) await admin.from('presupuestos').delete().eq('id', nuevo.id);
  console.log('\n  (presupuesto de prueba borrado)');

  console.log(
    fallos === 0
      ? '\nLa previsión cuadra y las dos pantallas coinciden.\n'
      : `\n${fallos} comprobación(es) FALLIDA(S).\n`,
  );
  process.exit(fallos === 0 ? 0 : 1);
}

main();
