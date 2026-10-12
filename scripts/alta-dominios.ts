/**
 * Da de alta dominios de correo desde la terminal, con la misma lógica que la
 * pantalla Administración → Dominios de correo.
 *
 * Para cuando la clave de Resend está en el servidor pero quien la tiene no
 * está delante de la pantalla: crea cada dominio en Resend (región UE), guarda
 * la fila con sus registros DNS y los imprime para pegarlos. Si el dominio ya
 * estaba dado de alta, lo deja como está y enseña su estado.
 *
 *   npx tsx --env-file=.env.local scripts/alta-dominios.ts bellamarcentro.com centrodeadiccionesentarragona.com lolodrago.com
 *
 * Necesita RESEND_API_KEY en el fichero de entorno con el que se ejecuta.
 */
import { createClient } from '@supabase/supabase-js';
import {
  crearEnResend,
  normalizarDominio,
  normalizarRegistros,
  REGION_POR_DEFECTO,
  sincronizarDominio,
} from '../src/lib/dominios-correo';
import type { Database, Json } from '../src/lib/database.types';

const admin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

async function main() {
  if (!process.env.RESEND_API_KEY) {
    console.error('\nFalta RESEND_API_KEY en el fichero de entorno con el que se ejecuta.\n');
    process.exit(1);
  }
  const pedidos = process.argv.slice(2);
  if (pedidos.length === 0) {
    console.error('\nUso: alta-dominios.ts dominio1 dominio2 …\n');
    process.exit(1);
  }

  for (const pedido of pedidos) {
    const dominio = normalizarDominio(pedido);
    if (!dominio) {
      console.log(`\n✕ «${pedido}» no parece un dominio.`);
      continue;
    }

    const { data: existente } = await admin
      .from('dominios_correo')
      .select('id, resend_id, estado')
      .eq('dominio', dominio)
      .maybeSingle();

    let filaId: string;
    if (existente) {
      const estado = await sincronizarDominio(admin, existente);
      console.log(`\n= ${dominio} ya estaba dado de alta · estado: ${estado}`);
      filaId = existente.id;
    } else {
      const creado = await crearEnResend(dominio, REGION_POR_DEFECTO);
      const { data, error } = await admin
        .from('dominios_correo')
        .insert({
          dominio,
          resend_id: creado.id,
          region: creado.region ?? REGION_POR_DEFECTO,
          estado: String(creado.status ?? 'not_started'),
          registros: normalizarRegistros(creado) as unknown as Json,
          ultimo_chequeo_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (error || !data) throw new Error(`${dominio}: creado en Resend pero no guardado: ${error?.message}`);
      console.log(`\n+ ${dominio} dado de alta en Resend (${creado.region ?? REGION_POR_DEFECTO})`);
      filaId = data.id;
    }

    const { data: fila } = await admin.from('dominios_correo').select('registros, estado').eq('id', filaId).single();
    const registros = (fila?.registros ?? []) as { registro: string; tipo: string; nombre: string; valor: string; prioridad?: number; estado: string }[];
    console.log(`  Registros a pegar en el DNS de ${dominio} (host = solo el nombre, sin el dominio):`);
    for (const r of registros) {
      console.log(`    ${r.tipo.padEnd(5)} ${r.nombre.padEnd(20)} ${r.prioridad !== undefined ? `prioridad ${r.prioridad}  ` : ''}${r.valor}   [${r.estado}]`);
    }
  }
  console.log('\nEl CRM los comprobará solo cada 15 minutos; también desde la pantalla con «Comprobar ahora».\n');
}

main().catch((e) => {
  console.error('\nFALLÓ:', e instanceof Error ? e.message : e, '\n');
  process.exit(1);
});
