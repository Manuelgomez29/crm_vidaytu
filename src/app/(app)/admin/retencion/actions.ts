'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { anonimizar } from '@/lib/anonimizar';
import { exigirDireccion } from '../guard';

function volver(aviso?: { error?: string; aviso?: string }): never {
  const q = aviso?.error
    ? `?error=${encodeURIComponent(aviso.error)}`
    : aviso?.aviso
      ? `?aviso=${encodeURIComponent(aviso.aviso)}`
      : '';
  revalidatePath('/admin/retencion');
  redirect(`/admin/retencion${q}`);
}

export async function guardarRetencion(formData: FormData) {
  const { supabase } = await exigirDireccion();

  const meses = Number(String(formData.get('retencion_meses') ?? '').trim());
  if (!Number.isFinite(meses) || meses < 1) {
    volver({ error: 'El plazo debe ser un numero de meses mayor que cero.' });
  }

  const admin = createAdminClient();
  const filas = [
    { clave: 'retencion_meses', valor: meses },
    // El checkbox desmarcado no viaja: el campo oculto del formulario es lo
    // que permite distinguir "apagado" de "no estaba en pantalla".
    { clave: 'retencion_automatica', valor: formData.get('retencion_automatica') === 'on' },
  ];

  for (const fila of filas) {
    const { error } = await admin
      .from('configuracion')
      .update({ valor: fila.valor })
      .eq('clave', fila.clave);
    if (error) volver({ error: `No se pudo guardar ${fila.clave}: ${error.message}` });
  }

  void supabase;
  volver({ aviso: 'Plazo de retencion actualizado.' });
}

/**
 * Anonimizacion manual. Existe ademas de la automatica porque lo normal, hasta
 * que el plazo este validado, es hacerlo a mano y mirando lo que se va.
 */
export async function anonimizarAhora(meses: number) {
  const { user } = await exigirDireccion();

  const resultado = await anonimizar(createAdminClient(), meses, user.id);

  volver({
    aviso: `Anonimizados ${resultado.casos} caso(s), ${resultado.contactos} contacto(s) y ${resultado.actividades} entrada(s) de historial. Queda registrado en la auditoria.`,
  });
}
