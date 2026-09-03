'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { importarContactos } from '@/lib/importar';
import { exigirDireccion } from '../guard';

function volver(aviso?: { error?: string; aviso?: string }): never {
  const q = aviso?.error
    ? `?error=${encodeURIComponent(aviso.error)}`
    : aviso?.aviso
      ? `?aviso=${encodeURIComponent(aviso.aviso)}`
      : '';
  revalidatePath('/admin/integraciones');
  redirect(`/admin/integraciones${q}`);
}

/**
 * Ajustes de una integración. Aquí NO se guardan tokens ni claves: solo
 * identificadores de cuenta. Los secretos viven en variables de entorno del
 * servidor, porque una fila de base de datos acaba en una copia de seguridad,
 * en una exportación o en la pantalla de alguien.
 */
export async function guardarIntegracion(clave: string, formData: FormData) {
  const { supabase } = await exigirDireccion();

  const ajustes: Record<string, string> = {};
  for (const [campo, valor] of formData.entries()) {
    if (campo.startsWith('ajuste_')) ajustes[campo.slice(7)] = String(valor).trim();
  }

  const { error } = await supabase
    .from('integraciones')
    .update({ activa: formData.get('activa') === 'on', ajustes })
    .eq('clave', clave);

  if (error) volver({ error: `No se pudo guardar: ${error.message}` });
  volver({ aviso: 'Integración actualizada.' });
}

// ---------------------------------------------------------------------------
// Importación de contactos
// ---------------------------------------------------------------------------

export async function importarCsv(formData: FormData) {
  await exigirDireccion();

  const archivo = formData.get('archivo');
  if (!(archivo instanceof File) || archivo.size === 0) {
    volver({ error: 'Elige un fichero CSV.' });
  }
  if (archivo.size > 8 * 1024 * 1024) {
    volver({ error: 'El fichero pasa de 8 MB. Pártelo en varios.' });
  }

  const origen = String(formData.get('origen') ?? 'CSV').trim() || 'CSV';
  const etiquetaId = String(formData.get('etiqueta') ?? '') || null;

  const resultado = await importarContactos(createAdminClient(), await archivo.text(), {
    origen,
    etiquetaId,
  });

  const resumen = [
    `${resultado.filas} fila(s) leídas`,
    `${resultado.contactosCreados} contacto(s) nuevos`,
    `${resultado.contactosActualizados} completados`,
    `${resultado.omitidos} sin cambios`,
  ].join(' · ');

  if (resultado.errores.length > 0) {
    volver({ error: `${resumen}. Problemas: ${resultado.errores.slice(0, 5).join(' ')}` });
  }
  volver({ aviso: resumen });
}

// ---------------------------------------------------------------------------
// Gasto publicitario
// ---------------------------------------------------------------------------

export async function registrarGasto(formData: FormData) {
  const { supabase, user } = await exigirDireccion();

  const campana = String(formData.get('campana') ?? '').trim();
  const desde = String(formData.get('desde') ?? '');
  const hasta = String(formData.get('hasta') ?? '');
  const importe = Number(formData.get('importe') ?? 0);

  if (!campana) volver({ error: 'Indica el nombre de la campaña, tal y como aparece en la UTM.' });
  if (!desde || !hasta) volver({ error: 'Indica el periodo del gasto.' });
  if (hasta < desde) volver({ error: 'El fin del periodo es anterior al inicio.' });
  if (!(importe >= 0)) volver({ error: 'El importe no puede ser negativo.' });

  const { error } = await supabase.from('gasto_campanas').insert({
    plataforma: String(formData.get('plataforma') ?? 'meta') as 'meta' | 'google' | 'otro',
    campana,
    centro_id: String(formData.get('centro') ?? '') || null,
    desde,
    hasta,
    importe,
    notas: String(formData.get('notas') ?? '').trim() || null,
    created_by: user.id,
  });

  if (error) volver({ error: `No se pudo registrar: ${error.message}` });
  volver({ aviso: 'Gasto registrado.' });
}

export async function borrarGasto(id: string) {
  const { supabase } = await exigirDireccion();
  const { error } = await supabase.from('gasto_campanas').delete().eq('id', id);
  if (error) volver({ error: `No se pudo borrar: ${error.message}` });
  volver();
}
