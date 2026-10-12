'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  borrarDeResend,
  claveConfigurada,
  crearEnResend,
  normalizarDominio,
  normalizarRegistros,
  pedirVerificacion,
  REGION_POR_DEFECTO,
  sincronizarDominio,
} from '@/lib/dominios-correo';
import type { Json } from '@/lib/database.types';

/**
 * Acciones de Dominios de correo. Solo la dirección de grupo: un dominio sirve
 * a los tres centros, y lo que se pega en un DNS lo pega una sola persona.
 */

const RUTA = '/admin/dominios';

function volver(aviso?: { error?: string; aviso?: string }): never {
  const q = aviso?.error
    ? `?error=${encodeURIComponent(aviso.error)}`
    : aviso?.aviso
      ? `?aviso=${encodeURIComponent(aviso.aviso)}`
      : '';
  revalidatePath(RUTA);
  redirect(`${RUTA}${q}`);
}

async function soloDireccionDeGrupo() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('rol, alcance')
    .eq('id', user.id)
    .maybeSingle();
  if (perfil?.rol !== 'direccion') redirect('/leads');
  if (perfil.alcance !== 'grupo') {
    volver({ error: 'Los dominios de correo los gestiona la dirección de grupo: sirven a los tres centros.' });
  }
  return { userId: user.id };
}

export async function anadirDominio(formData: FormData) {
  const { userId } = await soloDireccionDeGrupo();
  if (!claveConfigurada()) volver({ error: 'Falta RESEND_API_KEY en el servidor: sin ella el CRM no puede hablar con Resend.' });

  const dominio = normalizarDominio(String(formData.get('dominio') ?? ''));
  if (!dominio) volver({ error: 'Eso no parece un dominio. Escríbelo como «bellamarcentro.com».' });

  const admin = createAdminClient();
  const { data: existente } = await admin.from('dominios_correo').select('id').eq('dominio', dominio).maybeSingle();
  if (existente) volver({ error: `${dominio} ya está dado de alta.` });

  let creado;
  try {
    creado = await crearEnResend(dominio, REGION_POR_DEFECTO);
  } catch (e) {
    volver({ error: `Resend no aceptó el dominio: ${e instanceof Error ? e.message : String(e)}` });
  }

  const { error } = await admin.from('dominios_correo').insert({
    dominio,
    resend_id: creado.id,
    region: creado.region ?? REGION_POR_DEFECTO,
    estado: String(creado.status ?? 'not_started'),
    registros: normalizarRegistros(creado) as unknown as Json,
    ultimo_chequeo_at: new Date().toISOString(),
    created_by: userId,
  });
  if (error) volver({ error: `El dominio se creó en Resend pero no se pudo guardar: ${error.message}` });

  volver({ aviso: `${dominio} dado de alta. Pega los registros en el DNS del dominio; el CRM comprobará solo cuando estén.` });
}

export async function comprobarDominio(id: string) {
  await soloDireccionDeGrupo();
  if (!claveConfigurada()) volver({ error: 'Falta RESEND_API_KEY en el servidor.' });

  const admin = createAdminClient();
  const { data: fila } = await admin
    .from('dominios_correo')
    .select('id, dominio, resend_id, estado')
    .eq('id', id)
    .maybeSingle();
  if (!fila || !fila.resend_id) volver({ error: 'Ese dominio no existe.' });

  try {
    // Pedir la verificación arranca el proceso en Resend; leer después trae el estado actual.
    if (fila.estado !== 'verified') await pedirVerificacion(fila.resend_id);
  } catch (e) {
    volver({ error: `No se pudo pedir la verificación: ${e instanceof Error ? e.message : String(e)}` });
  }
  const estado = await sincronizarDominio(admin, fila);

  volver({
    aviso:
      estado === 'verified'
        ? `${fila.dominio} está verificado: ya se puede enviar desde él.`
        : `${fila.dominio}: ${estado === 'pending' ? 'comprobando los registros. El DNS puede tardar; el CRM seguirá mirando solo.' : 'los registros todavía no se ven. Revisa el DNS y vuelve a comprobar.'}`,
  });
}

export async function quitarDominio(id: string) {
  await soloDireccionDeGrupo();
  const admin = createAdminClient();

  const { data: fila } = await admin
    .from('dominios_correo')
    .select('id, dominio, resend_id')
    .eq('id', id)
    .maybeSingle();
  if (!fila) volver({ error: 'Ese dominio no existe.' });

  // Un centro que firme con él se quedaría sin remitente válido.
  const { data: centros } = await admin
    .from('centros')
    .select('nombre, email_remitente')
    .not('email_remitente', 'is', null);
  const usa = (centros ?? []).filter((c) => {
    const correo = (c.email_remitente ?? '').match(/<([^>]+)>/)?.[1] ?? c.email_remitente ?? '';
    const d = correo.split('@')[1]?.toLowerCase() ?? '';
    return d === fila.dominio || d.endsWith('.' + fila.dominio);
  });
  if (usa.length > 0) {
    volver({ error: `${fila.dominio} lo usa el remitente de ${usa.map((c) => c.nombre).join(', ')}. Cambia ese remitente antes de quitarlo.` });
  }

  if (fila.resend_id && claveConfigurada()) {
    try {
      await borrarDeResend(fila.resend_id);
    } catch (e) {
      volver({ error: `No se pudo quitar de Resend: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  const { error } = await admin.from('dominios_correo').delete().eq('id', id);
  if (error) volver({ error: `No se pudo quitar: ${error.message}` });
  volver({ aviso: `${fila.dominio} retirado.` });
}
