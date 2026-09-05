'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generarInformeMensual, enlaceInforme } from '@/lib/informe-pdf';
import { mesAnterior } from '@/lib/informe-mensual';

async function exigirDireccion() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('rol')
    .eq('id', user.id)
    .maybeSingle();
  if (perfil?.rol !== 'direccion') redirect('/leads');
  return user;
}

/**
 * Generar el informe ahora, sin esperar al día 1.
 *
 * Existe por lo mismo que el botón de recalcular la puntuación: en staging los
 * cron no corren nunca, así que sin esto el informe no se podría probar en
 * ningún sitio salvo producción — que es justo lo que hay que evitar.
 */
export async function generarInformeAhora(mes?: string) {
  const user = await exigirDireccion();
  const admin = createAdminClient();

  const objetivo = mes || mesAnterior();
  const r = await generarInformeMensual(admin, objetivo, { enviar: false, generadoPor: user.id });

  revalidatePath('/panel');
  redirect(
    r.ok
      ? `/panel?aviso=${encodeURIComponent(`Informe de ${r.informe.titulo} generado.`)}`
      : `/panel?error=${encodeURIComponent(r.error)}`,
  );
}

/** Enlace firmado y temporal. El bucket nunca se sirve en abierto. */
export async function descargarInforme(ruta: string) {
  await exigirDireccion();
  const admin = createAdminClient();
  const url = await enlaceInforme(admin, ruta);
  if (!url) redirect(`/panel?error=${encodeURIComponent('No se pudo preparar la descarga.')}`);
  redirect(url);
}
