'use server';

import { createClient } from '@/lib/supabase/server';
import { normalizarTelefono } from '@/lib/telefonos';
import { patronesDeBusqueda, valorSeguro } from '@/lib/busqueda';

export type ResultadoRapido = {
  tipo: 'caso' | 'contacto';
  id: string;
  nombre: string;
  detalle: string;
  href: string;
};

/**
 * Sanea lo tecleado antes de meterlo en un filtro `or()` de PostgREST.
 *
 * En ese filtro la coma separa condiciones y los parentesis agrupan: un nombre
 * con una coma no busca mal, rompe la consulta entera o la convierte en otra
 * distinta. RLS sigue protegiendo los datos —no se puede leer de otro centro
 * por mucho que se retuerza el filtro— pero un buscador que revienta al teclear
 * «Garcia, Ana» es un buscador que nadie usa.
 */
/*
 * Antes esto sustituía por espacios las comas, paréntesis y dos puntos, para que
 * no rompieran el filtro. No rompía —pero tampoco encontraba: quien buscaba
 * «García, Ana» acababa buscando «García Ana», que no está en ningún sitio, y
 * la paleta contestaba «sin resultados» con toda la seguridad del mundo.
 *
 * Ahora el valor se escapa como es debido en `@/lib/busqueda` y aquí solo se
 * normalizan espacios y se recorta la longitud.
 */
function sanear(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim().slice(0, 60);
}

/**
 * Búsqueda para la paleta de comandos. Devuelve poco y rápido: la paleta se
 * usa mientras se teclea, no para revisar resultados.
 *
 * No lleva comprobación de rol propia a propósito: usa el cliente con la
 * sesión de quien busca, así que RLS decide qué filas salen. Un comercial de
 * Horizonte no encuentra casos de Eclipse ni sabiendo el nombre exacto.
 */
export async function buscarRapido(termino: string): Promise<ResultadoRapido[]> {
  const busqueda = sanear(termino ?? '');
  if (busqueda.length < 2) return [];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const comoTelefono = normalizarTelefono(busqueda);
  const patrones = [
    patronesDeBusqueda(busqueda, ['nombre', 'telefono']),
    ...(comoTelefono ? [`telefono.eq.${valorSeguro(comoTelefono)}`] : []),
  ].join(',');

  const [{ data: leads }, { data: contactos }] = await Promise.all([
    supabase
      .from('leads')
      .select('id, nombre, telefono, estado, centro:centros (nombre)')
      .or(patrones)
      .order('created_at', { ascending: false })
      .limit(8),
    supabase
      .from('contactos')
      .select('id, nombre, telefono, email')
      .or(`${patrones},${patronesDeBusqueda(busqueda, ['email'])}`)
      .order('nombre')
      .limit(6),
  ]);

  const casos: ResultadoRapido[] = (leads ?? []).map((l) => ({
    tipo: 'caso',
    id: l.id,
    nombre: l.nombre,
    detalle: [(l.centro as { nombre: string } | null)?.nombre, l.telefono]
      .filter(Boolean)
      .join(' · '),
    href: `/leads/${l.id}`,
  }));

  const personas: ResultadoRapido[] = (contactos ?? []).map((c) => ({
    tipo: 'contacto',
    id: c.id,
    nombre: c.nombre,
    detalle: [c.telefono, c.email].filter(Boolean).join(' · '),
    href: `/contactos/${c.id}`,
  }));

  return [...casos, ...personas];
}
