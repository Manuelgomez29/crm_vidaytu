/**
 * Los dominios de correo se gestionan desde el CRM, y el CRM no miente sobre
 * su estado.
 *
 * Resend no tiene cuenta de pruebas, así que aquí se suplanta `fetch`: lo que
 * se comprueba es lo nuestro —cómo leemos lo que Resend dice, qué guardamos,
 * a quién avisamos y a qué remitente dejamos pasar—, no Resend.
 *
 *   1. Un dominio escrito de cualquier manera («https://www.Bellamar.com/») se
 *      normaliza; una cosa que no es un dominio, se rechaza.
 *   2. Los registros DNS de Resend se guardan con nombre, tipo, valor,
 *      prioridad (solo MX) y estado, en nuestras palabras.
 *   3. Al sincronizar, un dominio que Resend da por verificado queda
 *      `verified` con su fecha; un fallo de red NO cambia el estado y queda
 *      apuntado.
 *   4. Cuando un dominio pasa a verificado, se avisa a la dirección de grupo
 *      una sola vez.
 *   5. El remitente de un centro solo pasa si su dominio —o el dominio padre de
 *      su subdominio `send.`— está verificado. Sin dominios dados de alta no se
 *      bloquea a nadie.
 *
 *   npx tsx --env-file=.env.staging scripts/verificar-dominios.ts
 */
import { createClient } from '@supabase/supabase-js';
import {
  dominioDelRemitenteVerificado,
  normalizarDominio,
  normalizarRegistros,
  refrescarDominiosPendientes,
  sincronizarDominio,
} from '../src/lib/dominios-correo';
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

const MARCA = String(Date.now()).slice(-7);
const DOMINIO = `prueba-${MARCA}.example`;

/** Resend de mentira: responde lo que le digamos y apunta lo que le piden. */
const respuestas = new Map<string, () => Response>();
const llamadas: string[] = [];
const fetchReal = globalThis.fetch;
globalThis.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
  if (!url.startsWith('https://api.resend.com')) return fetchReal(entrada, init);
  const clave = `${init?.method ?? 'GET'} ${url.replace('https://api.resend.com', '')}`;
  llamadas.push(clave);
  const r = respuestas.get(clave);
  if (!r) return new Response(JSON.stringify({ message: 'sin respuesta preparada para ' + clave }), { status: 500 });
  return r();
}) as typeof fetch;

const dominioResend = (status: string) => ({
  id: 'rs-' + MARCA,
  name: DOMINIO,
  status,
  region: 'eu-west-1',
  records: [
    { record: 'DKIM', name: 'resend._domainkey', type: 'TXT', value: 'p=MIGf...', status },
    { record: 'SPF', name: 'send', type: 'MX', value: 'feedback-smtp.eu-west-1.amazonses.com', priority: 10, status },
    { record: 'SPF', name: 'send', type: 'TXT', value: 'v=spf1 include:amazonses.com ~all', status },
  ],
});

async function main() {
  console.log('\nDominios de correo desde el CRM\n');
  process.env.RESEND_API_KEY = 're_prueba';

  // ---------------------------------------------------------------------------
  console.log('El dominio se normaliza:');
  comprobar('quita protocolo, www, barra y mayúsculas', normalizarDominio('https://www.Bellamar.COM/') === 'bellamar.com');
  comprobar('acepta subdominios', normalizarDominio('send.bellamarcentro.com') === 'send.bellamarcentro.com');
  comprobar('rechaza lo que no es un dominio', normalizarDominio('bellamar') === null && normalizarDominio('hola@x.com') === null);

  // ---------------------------------------------------------------------------
  console.log('\nLos registros de Resend, en nuestras palabras:');
  const regs = normalizarRegistros(dominioResend('not_started'));
  comprobar('tres registros', regs.length === 3);
  comprobar('el MX lleva prioridad y los TXT no', regs[1].prioridad === 10 && regs[0].prioridad === undefined);
  comprobar('nombre y valor tal cual', regs[0].nombre === 'resend._domainkey' && regs[2].valor.startsWith('v=spf1'));

  // ---------------------------------------------------------------------------
  console.log('\nSincronizar guarda lo que Resend dice, y un fallo no miente:');
  const { data: fila, error: eF } = await admin
    .from('dominios_correo')
    .insert({ dominio: DOMINIO, resend_id: 'rs-' + MARCA, estado: 'not_started', registros: [] })
    .select('id, resend_id, estado')
    .single();
  if (eF) throw new Error('sembrando: ' + eF.message);

  respuestas.set(`GET /domains/rs-${MARCA}`, () => new Response(JSON.stringify(dominioResend('pending')), { status: 200 }));
  comprobar('pending se guarda como pending', (await sincronizarDominio(admin, fila)) === 'pending');

  respuestas.set(`GET /domains/rs-${MARCA}`, () => new Response(JSON.stringify({ message: 'caído' }), { status: 503 }));
  const trasFallo = await sincronizarDominio(admin, { ...fila, estado: 'pending' });
  const { data: f2 } = await admin.from('dominios_correo').select('estado, ultimo_error').eq('id', fila.id).single();
  comprobar('un fallo de red no cambia el estado', trasFallo === 'pending' && f2?.estado === 'pending');
  comprobar('y queda apuntado', /503/.test(f2?.ultimo_error ?? ''), f2?.ultimo_error ?? '');

  // ---------------------------------------------------------------------------
  console.log('\nAl verificar, se avisa a dirección una sola vez:');
  respuestas.set(`GET /domains/rs-${MARCA}`, () => new Response(JSON.stringify(dominioResend('verified')), { status: 200 }));
  const r1 = await refrescarDominiosPendientes(admin);
  const { data: f3 } = await admin.from('dominios_correo').select('estado, verificado_at, registros').eq('id', fila.id).single();
  comprobar('queda verified con fecha', f3?.estado === 'verified' && !!f3.verificado_at);
  comprobar('los registros quedan verificados uno a uno', ((f3?.registros as { estado: string }[]) ?? []).every((r) => r.estado === 'verified'));
  comprobar('cuenta como verificado ahora', r1.verificadosAhora >= 1, JSON.stringify(r1));
  const { count: avisos } = await admin
    .from('notificaciones')
    .select('id', { count: 'exact', head: true })
    .like('clave', `dominio:${fila.id}:verificado:%`);
  comprobar('hay aviso para dirección de grupo', (avisos ?? 0) >= 1, `${avisos} aviso(s)`);
  const r2 = await refrescarDominiosPendientes(admin);
  comprobar('la segunda pasada ya no lo vuelve a mirar', r2.comprobados === 0 || r2.verificadosAhora === 0);

  // ---------------------------------------------------------------------------
  console.log('\nEl remitente de un centro solo pasa sobre un dominio verificado:');
  comprobar('el dominio verificado pasa', (await dominioDelRemitenteVerificado(admin, `Centro <hola@${DOMINIO}>`)).ok);
  const sub = await dominioDelRemitenteVerificado(admin, `hola@send.${DOMINIO}`);
  comprobar(
    'pero su subdominio send. NO: para Resend es otro dominio',
    !sub.ok,
    'la primera versión lo aceptaba y Resend habría rechazado el envío',
  );
  const ajeno = await dominioDelRemitenteVerificado(admin, 'hola@otro-sitio.example');
  comprobar('uno que no está dado de alta, no', !ajeno.ok && /no está dado de alta/.test(ajeno.ok ? '' : ajeno.motivo));
  await admin.from('dominios_correo').update({ estado: 'pending' }).eq('id', fila.id);
  const pendiente = await dominioDelRemitenteVerificado(admin, `hola@${DOMINIO}`);
  comprobar('uno sin verificar, tampoco', !pendiente.ok && /no está verificado/.test(pendiente.ok ? '' : pendiente.motivo));

  // ---------------------------------------------------------------------------
  await admin.from('notificaciones').delete().like('clave', `dominio:${fila.id}:%`);
  await admin.from('dominios_correo').delete().eq('id', fila.id);
  console.log('\n  (datos de prueba retirados · llamadas a Resend simuladas: ' + llamadas.length + ')');

  console.log(
    fallos === 0
      ? '\nEl CRM da de alta, comprueba y no deja pasar un remitente que fallaría.\n'
      : `\n${fallos} comprobación(es) FALLIDA(S).\n`,
  );
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('\nFALLÓ:', e instanceof Error ? e.message : e, '\n');
  process.exit(1);
});
