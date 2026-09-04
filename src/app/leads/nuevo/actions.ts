'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizarTelefono } from '@/lib/telefonos';
import {
  asegurarContacto,
  pipelineYPrimeraEtapa,
  reabrirCaso,
  slaMinutos,
  ultimoCasoPorTelefono,
  venceSegunSla,
} from '@/lib/casos';

function fallar(mensaje: string): never {
  redirect(`/leads/nuevo?error=${encodeURIComponent(mensaje)}`);
}

export async function crearLead(formData: FormData) {
  const nombre = String(formData.get('nombre') ?? '').trim();
  const telefono = normalizarTelefono(String(formData.get('telefono') ?? ''));
  const centroId = String(formData.get('centro') ?? '');
  const canalId = String(formData.get('canal') ?? '');

  if (!nombre || !telefono) fallar('Nombre y teléfono válido (+34…) son obligatorios.');
  if (!centroId || !canalId) fallar('Centro y canal son obligatorios.');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: perfil }, { data: misCentros }] = await Promise.all([
    supabase.from('perfiles').select('rol').eq('id', user.id).single(),
    supabase.from('perfil_centros').select('centro_id').eq('perfil_id', user.id),
  ]);
  const esDireccion = perfil?.rol === 'direccion';

  // Regla 4: la deduplicación mira TODO el directorio, también centros que
  // este usuario no ve — por eso usa el cliente admin.
  const admin = createAdminClient();
  const caso = await ultimoCasoPorTelefono(admin, telefono);

  const puedeVerlo =
    caso !== null && (esDireccion || (misCentros ?? []).some((c) => c.centro_id === caso.centroId));

  /**
   * ORÁCULO DE EXISTENCIA, cerrado.
   *
   * Antes, si el teléfono existía en un centro que este comercial no ve, se le
   * decía. Evitaba el duplicado, pero convertía el formulario de alta en una
   * forma de preguntarle al sistema «¿es esta persona cliente de Horizonte?»,
   * probando números uno a uno. En un grupo de centros de adicciones, esa
   * respuesta es exactamente lo que no se puede dar.
   *
   * Ahora el comercial no se entera de nada: su alta sigue el curso normal.
   * El duplicado entre centros lo detecta el motor en su siguiente pasada y lo
   * pone en manos de dirección, que sí ve los dos casos y puede unirlos o
   * derivarlos. Se cambia una fuga por un duplicado temporal que alguien con
   * la visión completa resuelve.
   */
  if (caso && puedeVerlo) {
    if (caso.cerrado) {
      await reabrirCaso(admin, {
        caso,
        motivo: `Reapertura manual: el teléfono ${telefono} ha vuelto a contactar`,
        usuarioId: user.id,
      });
      revalidatePath('/leads');
      redirect(
        `/leads/${caso.leadId}?aviso=${encodeURIComponent(
          'Este teléfono ya tenía un caso: se ha reabierto con todo su historial en lugar de crear uno nuevo.',
        )}`,
      );
    }

    redirect(
      `/leads/${caso.leadId}?aviso=${encodeURIComponent(
        'Este teléfono ya tiene un caso abierto: es este. No se ha creado un duplicado.',
      )}`,
    );
  }

  const pipeline = await pipelineYPrimeraEtapa(supabase, centroId);
  if ('error' in pipeline) fallar(pipeline.error);

  const quienContacta = String(formData.get('quien_contacta') ?? '') || null;
  const urgencia = String(formData.get('urgencia') ?? '') || null;
  const relacion = String(formData.get('relacion_con_afectado') ?? '').trim() || null;
  const zona = String(formData.get('zona') ?? '').trim() || null;
  const notas = String(formData.get('notas') ?? '').trim();

  const { data: lead, error: errorLead } = await supabase
    .from('leads')
    .insert({
      centro_id: centroId,
      pipeline_id: pipeline.pipelineId,
      etapa_id: pipeline.etapaId,
      // Los comerciales se quedan como propietarios de lo que dan de alta.
      propietario_id: perfil?.rol === 'admisiones' ? user.id : null,
      nombre,
      telefono,
      quien_contacta: quienContacta as 'familiar' | 'afectado' | 'prescriptor' | 'otro' | null,
      relacion_con_afectado: relacion,
      nombre_afectado: String(formData.get('nombre_afectado') ?? '').trim() || null,
      adiccion_id: String(formData.get('adiccion') ?? '') || null,
      modalidad_interes_id: String(formData.get('modalidad') ?? '') || null,
      urgencia: urgencia as 'alta' | 'media' | 'baja' | null,
      zona,
      prescriptor_nombre: String(formData.get('prescriptor_nombre') ?? '').trim() || null,
      canal_id: canalId,
      subcanal: String(formData.get('subcanal') ?? '').trim() || null,
      estado: 'nuevo',
      origen_sistema: 'manual',
      created_by: user.id,
    })
    .select('id')
    .single();
  if (errorLead || !lead) fallar(`No se pudo crear el lead: ${errorLead?.message}`);

  /**
   * Con el cliente admin, no con la sesion.
   *
   * El telefono es unico en toda la tabla: si esa persona ya existe en un
   * centro que este comercial no ve, insertarla con su sesion fallaria, y el
   * mensaje de error confirmaria que esta en el sistema. Un oraculo de
   * existencia por la puerta de atras.
   *
   * Ademas la persona es global (regla 5): si ya esta, se reutiliza.
   */
  const contacto = await asegurarContacto(
    admin,
    { nombre, telefono, email: String(formData.get('email') ?? '').trim() || null, zona },
    user.id,
  );
  if ('error' in contacto) fallar(`No se pudo crear el contacto: ${contacto.error}`);

  // Toda alta nace con próxima acción con fecha (regla 9), igual que la ingesta web.
  await Promise.all([
    // Este vinculo es lo que le da visibilidad sobre la persona.
    supabase.from('lead_contactos').insert({
      lead_id: lead.id,
      contacto_id: contacto.id,
      tipo: (quienContacta as 'familiar' | 'afectado' | 'prescriptor' | 'otro' | null) ?? 'otro',
      relacion,
      es_principal: true,
    }),
    supabase.from('tareas').insert({
      lead_id: lead.id,
      titulo: 'Primera llamada (intento 1 de la cadencia)',
      vence_at: venceSegunSla(await slaMinutos(supabase)),
      responsable_id: perfil?.rol === 'admisiones' ? user.id : null,
    }),
    notas
      ? supabase
          .from('actividades')
          .insert({ lead_id: lead.id, tipo: 'nota', contenido: notas, usuario_id: user.id })
      : Promise.resolve(null),
  ]);

  revalidatePath('/leads');
  redirect(`/leads/${lead.id}`);
}
