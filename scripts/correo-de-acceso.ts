/**
 * Pone el correo de ACCESO (invitaciones y «he olvidado mi contraseña") a salir
 * por Resend, con un dominio verificado del grupo.
 *
 * Sin esto, esos correos los manda el servidor de pruebas de Supabase, que
 * permite DOS por hora y firma con un remitente que nadie reconoce. El día que
 * entra el equipo —seis u ocho invitaciones seguidas, y alguna contraseña que
 * se olvida— se agota a la segunda.
 *
 *   npm run configurar:correo-acceso -- "Vidaitu DATA <acceso@bellamarcentro.com>"
 *
 * Lee de `.env.local`:
 *   · RESEND_API_KEY          la clave de Resend (la misma que en Vercel)
 *   · SUPABASE_ACCESS_TOKEN   para cambiar la configuración del proyecto
 *   · NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY, para saber qué
 *     proyecto es y comprobar el dominio
 *
 * Estos correos solo los recibe el EQUIPO, nunca un paciente, así que aquí no
 * aplica la regla de discreción de los remitentes; aun así se avisa si el
 * dominio deja ver el motivo, por si se reutiliza para otra cosa.
 */
import { createClient } from '@supabase/supabase-js';
import { remitenteRevela } from '../src/lib/discrecion';
import type { Database } from '../src/lib/database.types';

const POR_HORA = 30;

async function main() {
  const remitente = (process.argv[2] ?? '').trim();
  const faltan = [
    'RESEND_API_KEY',
    'SUPABASE_ACCESS_TOKEN',
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
  ].filter((k) => !process.env[k]?.trim());
  if (faltan.length > 0) {
    console.error(`\nFalta en .env.local: ${faltan.join(', ')}\n`);
    process.exit(1);
  }

  const forma =
    /^\s*(?:(.+?)\s*<\s*([^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)\s*>|([^\s<>@]+@[^\s<>@]+\.[^\s<>@]+))\s*$/.exec(
      remitente,
    );
  if (!forma) {
    console.error(
      '\nUso: npm run configurar:correo-acceso -- "Vidaitu DATA <acceso@dominio.com>"\n',
    );
    process.exit(1);
  }
  const nombre = (forma[1] ?? 'Vidaitu DATA').trim();
  const correo = (forma[2] ?? forma[3]).trim().toLowerCase();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const ref = /^https:\/\/([a-z0-9]+)\.supabase\.co/.exec(url)?.[1];
  if (!ref) {
    console.error(`\nNo reconozco el proyecto en ${url}\n`);
    process.exit(1);
  }

  const admin = createClient<Database>(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  /*
   * El dominio tiene que estar dado de alta Y verificado, sin excepciones. La
   * comprobación de la pantalla de Centros deja pasar cualquier cosa mientras
   * no haya ningún dominio (para no impedir arrancar); aquí eso dejaría la
   * entrada de todo el equipo apuntando a un servidor que rechaza el envío.
   */
  const dominio = correo.split('@')[1];
  const { data: fila, error } = await admin
    .from('dominios_correo')
    .select('estado')
    .eq('dominio', dominio)
    .maybeSingle();
  if (error || fila?.estado !== 'verified') {
    const estado = error
      ? `no se pudo comprobar (${error.message})`
      : fila
        ? `está «${fila.estado}», no verificado`
        : 'no está dado de alta';
    console.error(
      `\nEl dominio ${dominio} ${estado}. Dalo de alta y verifícalo en Administración → Dominios de correo.\n`,
    );
    process.exit(1);
  }
  const revela = remitenteRevela(remitente);
  if (revela.length > 0) {
    console.log(
      `\n  Aviso: el dominio deja ver «${revela.join('», «')}». Para el equipo vale; no lo uses para pacientes.`,
    );
  }

  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      smtp_host: 'smtp.resend.com',
      smtp_port: '465',
      smtp_user: 'resend',
      smtp_pass: process.env.RESEND_API_KEY,
      smtp_admin_email: correo,
      smtp_sender_name: nombre,
      rate_limit_email_sent: POR_HORA,
    }),
  });
  const cuerpo = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) {
    console.error(`\nSupabase respondió ${r.status}: ${String(cuerpo.message ?? '')}\n`);
    process.exit(1);
  }

  console.log(`
  Proyecto ${ref}
  Correo de acceso: ${nombre} <${String(cuerpo.smtp_admin_email ?? correo)}>
  Servidor: ${String(cuerpo.smtp_host)}:${String(cuerpo.smtp_port)}
  Hasta ${String(cuerpo.rate_limit_email_sent)} correos por hora

Pruébalo con «¿Has olvidado la contraseña?» en el login, con tu propio correo.
`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
