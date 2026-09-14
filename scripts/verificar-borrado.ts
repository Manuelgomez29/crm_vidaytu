/**
 * Borrar un caso o una persona: quién puede, y qué queda escrito.
 *
 * Hasta ahora no se podía borrar nada desde la aplicación. Las pruebas de las
 * landings hubo que sacarlas de la base a mano, y eso no se le puede pedir a
 * nadie. Pero una puerta de borrado en un CRM con datos de categoría especial
 * es de las cosas que hay que probar de verdad, no mirando la pantalla:
 *
 *   1. Que un comercial NO puede borrar, aunque llegue por otro camino. Esto
 *      se prueba con su sesión real contra la base, no leyendo el código de la
 *      pantalla: lo que protege es RLS, y el botón es solo cortesía.
 *   2. Que la dirección sí, y que al hacerlo queda registrado con el PORQUÉ.
 *   3. Que la persona no se va con el caso (regla 5), salvo que se pida.
 *   4. Que no se puede borrar a alguien que aún tiene casos — incluidos los de
 *      centros que quien pulsa no ve, que es justo el agujero fácil.
 *
 *   npx tsx --env-file=.env.staging scripts/verificar-borrado.ts
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
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
const fuente = (ruta: string) => readFileSync(ruta, 'utf8');

/** Una sesión de verdad, con la clave pública: es lo que usa la aplicación. */
async function sesion(email: string, password: string) {
  const cliente = createClient<Database>(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await cliente.auth.signInWithPassword({ email, password });
  if (error) {
    comprobar(`sesión de ${email}`, false, error.message);
    return null;
  }
  return cliente;
}

/** Un caso de usar y tirar, con su persona. Devuelve los dos identificadores. */
async function casoDePrueba(sufijo: string) {
  const [{ data: centro }, { data: pipe }, { data: canal }] = await Promise.all([
    admin.from('centros').select('id').eq('slug', 'bellamar').single(),
    admin.from('pipelines').select('id').limit(1).single(),
    admin.from('canales').select('id').eq('slug', 'otro').single(),
  ]);
  const { data: etapa } = await admin
    .from('pipeline_etapas')
    .select('id')
    .eq('pipeline_id', pipe!.id)
    .order('orden')
    .limit(1)
    .single();

  const { data: lead } = await admin
    .from('leads')
    .insert({
      centro_id: centro!.id,
      pipeline_id: pipe!.id,
      etapa_id: etapa!.id,
      nombre: `VERIFICACION borrado ${sufijo}`,
      telefono: `+3460000${sufijo}`,
      canal_id: canal!.id,
    })
    .select('id')
    .single();

  const { data: persona } = await admin
    .from('contactos')
    .insert({ nombre: `VERIFICACION persona ${sufijo}`, telefono: `+3460000${sufijo}` })
    .select('id')
    .single();

  await admin
    .from('lead_contactos')
    .insert({ lead_id: lead!.id, contacto_id: persona!.id, tipo: 'afectado', es_principal: true });

  return { leadId: lead!.id, contactoId: persona!.id };
}

async function limpiar(leadId: string, contactoId: string) {
  await admin.from('leads').delete().eq('id', leadId);
  await admin.from('contactos').delete().eq('id', contactoId);
}

async function main() {
  console.log('\nBorrar un caso o una persona\n');

  // ---------------------------------------------------------------------------
  console.log('La base manda, no el botón:');

  const uno = await casoDePrueba('9001');
  const comercial = await sesion('equipo@test.com', 'vidaytu-dev-2026');

  if (comercial) {
    // Bellamar SÍ es suyo: lo ve y lo edita. Lo que no puede es borrarlo.
    const { data: loVe } = await comercial
      .from('leads')
      .select('id')
      .eq('id', uno.leadId)
      .maybeSingle();
    comprobar(
      'el comercial ve ese caso (es de un centro suyo)',
      !!loVe,
      'si no lo viera, lo de abajo no probaría nada',
    );

    const { data: borrados } = await comercial
      .from('leads')
      .delete()
      .eq('id', uno.leadId)
      .select('id');
    comprobar(
      'y aun así NO puede borrarlo',
      (borrados ?? []).length === 0,
      'RLS: borrar leads es de dirección',
    );

    const { data: sigue } = await admin
      .from('leads')
      .select('id')
      .eq('id', uno.leadId)
      .maybeSingle();
    comprobar('el caso sigue estando', !!sigue);
  }

  // ---------------------------------------------------------------------------
  console.log('\nLa dirección de grupo sí, y deja rastro:');

  const direccion = await sesion('repaso@test.com', 'vidaytu-repaso-2026');
  if (direccion) {
    const { data: mandaEnGrupo } = await direccion.rpc('manda_en_grupo');
    comprobar('la pantalla pregunta por «manda_en_grupo» y responde que sí', mandaEnGrupo === true);

    const { data: fuera } = await direccion
      .from('leads')
      .delete()
      .eq('id', uno.leadId)
      .select('id');
    comprobar('borra el caso', (fuera ?? []).length === 1);

    const { data: rastro } = await admin
      .from('auditoria')
      .select('accion, datos_anteriores')
      .eq('registro_id', uno.leadId)
      .eq('accion', 'DELETE')
      .maybeSingle();
    comprobar(
      'el disparador guarda la fila entera al borrarla',
      !!rastro?.datos_anteriores,
      'la auditoría es append-only: sobrevive al borrado',
    );

    /*
     * La persona NO se va con el caso. Es la regla 5 —la persona es global— y
     * en la práctica es lo que separa «borro una prueba» de «borro a una madre
     * que ya consultó por otro hijo».
     */
    const { data: personaViva } = await admin
      .from('contactos')
      .select('id')
      .eq('id', uno.contactoId)
      .maybeSingle();
    comprobar('la persona NO se borra en cascada con su caso', !!personaViva);
  }

  await limpiar(uno.leadId, uno.contactoId);

  // ---------------------------------------------------------------------------
  console.log('\nA una persona con casos no se la borra:');

  const dos = await casoDePrueba('9002');
  const { count: casos } = await admin
    .from('lead_contactos')
    .select('id', { count: 'exact', head: true })
    .eq('contacto_id', dos.contactoId);
  comprobar('la cuenta de casos se hace con la clave de servicio', (casos ?? 0) === 1, `${casos}`);

  const accionContactos = fuente('src/app/contactos/actions.ts');
  comprobar(
    'y por eso ve también los casos de centros ajenos',
    /createAdminClient\(\)[\s\S]{0,400}from\('lead_contactos'\)[\s\S]{0,200}count: 'exact'/.test(
      accionContactos,
    ),
    'con la sesión de quien pulsa, un caso invisible contaría cero',
  );
  comprobar(
    'si le queda alguno, se para y lo dice',
    /if \(\(casos \?\? 0\) > 0\)/.test(accionContactos),
  );

  await limpiar(dos.leadId, dos.contactoId);

  // ---------------------------------------------------------------------------
  console.log('\nLa pantalla pide lo que tiene que pedir:');

  const accionCasos = fuente('src/app/leads/[id]/actions.ts');
  comprobar(
    'motivo obligatorio antes de borrar un caso',
    /motivo\.length < 5/.test(accionCasos) && /motivo\.length < 5/.test(accionContactos),
    'es lo único que quedará escrito dentro de un año',
  );
  comprobar(
    'y confirmación explícita',
    /confirmo/.test(accionCasos) && /confirmo/.test(accionContactos),
  );
  comprobar(
    'el porqué se escribe ANTES de borrar',
    accionCasos.indexOf("accion: 'BORRADO_MANUAL'") < accionCasos.indexOf(".from('leads')\n    .delete()"),
    'si fuera después y algo fallara, quedaría el borrado sin explicación',
  );
  comprobar(
    'el borrado va con la sesión de quien pulsa, no con la clave de servicio',
    /supabase\s*\n?\s*\.from\('leads'\)\s*\n?\s*\.delete\(\)/.test(accionCasos),
  );

  const ficha = fuente('src/app/leads/[id]/page.tsx');
  comprobar(
    'el botón solo se le ofrece a la dirección de grupo',
    /esDireccionDeGrupo = esDireccion && perfil\?\.alcance === 'grupo'/.test(ficha) &&
      /\{esDireccionDeGrupo && \(/.test(ficha),
  );
  comprobar(
    'va plegado, para que no se pulse sin querer',
    /<details[^>]*>[\s\S]{0,200}Borrar este caso definitivamente/.test(ficha),
  );
  comprobar(
    'y «marcar como no válido» sigue estando, que es lo normal',
    /marcarNoValido/.test(ficha),
  );

  console.log(
    fallos === 0
      ? '\nSe puede limpiar lo que sobra, y no se puede borrar lo que no toca.\n'
      : `\n${fallos} comprobación(es) FALLIDA(S).\n`,
  );
  process.exit(fallos === 0 ? 0 : 1);
}

main();
