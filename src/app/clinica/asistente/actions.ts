'use server';

import { redirect } from 'next/navigation';
import { preguntar, type Ambito } from '@/lib/ia';
import { exigirAccesoClinico } from '../guard';

export async function consultarAsistente(formData: FormData) {
  const { supabase, perfil } = await exigirAccesoClinico();

  const ambito = (String(formData.get('ambito') ?? 'clinica') === 'psicologia'
    ? 'psicologia'
    : 'clinica') as Ambito;
  const pregunta = String(formData.get('pregunta') ?? '').trim();

  if (!pregunta) redirect(`/clinica/asistente?ambito=${ambito}`);

  const resultado = await preguntar(supabase, {
    ambito,
    pregunta,
    usuarioId: perfil.id,
    nombre: perfil.nombre,
  });

  /**
   * Ni la pregunta ni la respuesta viajan por la URL: pueden contener nombres
   * de pacientes, y un query string queda en el historial del navegador, en
   * los registros del servidor y en cualquier captura de pantalla. Solo va el
   * id de la consulta, que la pantalla resuelve leyendo la fila.
   */
  redirect(`/clinica/asistente?ambito=${ambito}&consulta=${resultado.consultaId ?? ''}`);
}
