'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { preguntar } from '@/lib/ia';

/**
 * Copiloto de direccion: preguntas al dashboard en lenguaje natural.
 *
 * Usa la misma infraestructura que el asistente clinico y la misma garantia:
 * el contexto se lee con la sesion de quien pregunta. Un comercial que llegara
 * aqui recibiria solo los numeros de sus centros — pero no llega, porque la
 * pantalla es de direccion.
 */
export async function consultarPanel(formData: FormData) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('nombre, rol')
    .eq('id', user.id)
    .maybeSingle();
  if (perfil?.rol !== 'direccion') redirect('/leads');

  const pregunta = String(formData.get('pregunta') ?? '').trim();
  if (!pregunta) redirect('/panel/asistente');

  const resultado = await preguntar(supabase, {
    ambito: 'direccion',
    pregunta,
    usuarioId: user.id,
    nombre: perfil.nombre,
  });

  // Solo el id: ni la pregunta ni la respuesta viajan por la URL.
  redirect(`/panel/asistente?consulta=${resultado.consultaId ?? ''}`);
}
