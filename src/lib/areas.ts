import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

/**
 * Qué áreas de la plataforma están encendidas.
 *
 * La plataforma se construye entera pero se ENTREGA por partes. Al arrancar,
 * marketing no puede enviar nada —falta proveedor de correo y hay un contacto
 * con consentimiento—, facturación tiene una factura de prueba y el área
 * clínica es de la fase 3. Enseñarlas el primer día no añade nada: solo da al
 * equipo tres sitios donde no hay nada y una razón para desconfiar del resto.
 *
 * Así que se apagan. Y se apagan como un AJUSTE, no comentando código: el día
 * que haya proveedor de correo, marketing se enciende desde Parámetros y sin
 * desplegar (regla 13). Nada se borra — los datos siguen donde estaban y el
 * área aparece con todo dentro.
 *
 * Apagada NO quiere decir escondida: se sigue viendo en el menú, en gris y con
 * su fase. Que el equipo sepa que la plataforma va a crecer vale más que un
 * menú un poco más corto, y evita la pregunta de si eso existe o no.
 */
export const AREAS = {
  comercial: { texto: 'Área comercial', fase: null },
  administracion: { texto: 'Administración', fase: null },
  marketing: { texto: 'Área de marketing', fase: 'Fase 2' },
  clinica: { texto: 'Área clínica', fase: 'Fase 3' },
  facturacion: { texto: 'Facturación', fase: 'Fase 4' },
} as const;

export type Area = keyof typeof AREAS;

/**
 * Las dos que no se pueden apagar.
 *
 * Sin el área comercial no hay plataforma, y sin administración no hay forma de
 * volver a encender nada — incluida ella misma. Un interruptor que puede
 * dejarte fuera de la habitación del interruptor no es un interruptor.
 */
export const AREAS_FIJAS: Area[] = ['comercial', 'administracion'];

/** Qué área cubre cada ruta. El orden no importa: los prefijos no se solapan. */
const RUTAS: { prefijo: string; area: Area }[] = [
  { prefijo: '/marketing', area: 'marketing' },
  { prefijo: '/clinica', area: 'clinica' },
  { prefijo: '/facturacion', area: 'facturacion' },
];

export function areaDeRuta(ruta: string): Area | null {
  return RUTAS.find((r) => ruta === r.prefijo || ruta.startsWith(r.prefijo + '/'))?.area ?? null;
}

export const CLAVE_CONFIG = 'areas_activas';

/**
 * Lee del ajuste qué está encendido.
 *
 * Ante la duda, MENOS: si el ajuste falta o viene con algo que no es una lista,
 * quedan solo las fijas. Un fallo de lectura que abriera de golpe las áreas a
 * medio terminar sería peor que uno que las cierra, porque se descubre tarde y
 * delante del equipo.
 */
export async function areasActivas(cliente: SupabaseClient<Database>): Promise<Set<Area>> {
  const { data } = await cliente
    .from('configuracion')
    .select('valor')
    .eq('clave', CLAVE_CONFIG)
    .maybeSingle();

  const guardadas = Array.isArray(data?.valor) ? (data.valor as string[]) : [];
  const activas = new Set<Area>(AREAS_FIJAS);
  for (const a of guardadas) {
    if (a in AREAS) activas.add(a as Area);
  }
  return activas;
}
