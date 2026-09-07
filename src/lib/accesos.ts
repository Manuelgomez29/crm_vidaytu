/**
 * Quién entra y quién está dentro.
 *
 * Dos cosas distintas que conviene no mezclar aunque se miren en la misma
 * pantalla:
 *
 *   · El registro de accesos es de SEGURIDAD. Lo importante no son las entradas
 *     buenas, son las malas: veinte fallos seguidos contra la misma cuenta de
 *     madrugada es exactamente lo que nadie ve hasta que ya es tarde.
 *
 *   · La presencia es OPERATIVA. Sirve para saber a quién se le puede pasar un
 *     caso urgente ahora mismo. No es control horario y no debe convertirse en
 *     uno: se guarda una marca de tiempo por persona, que se pisa a sí misma.
 *     No hay historial de ayer, a propósito.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

type Cliente = SupabaseClient<Database>;

export type Etapa = 'clave' | '2fa' | 'salida';

const RETENCION_POR_DEFECTO = 90;
const PRESENCIA_POR_DEFECTO = 5;

/** El navegador, en corto. «Chrome en Android» dice lo que hace falta. */
export function dispositivo(agente: string | null): string {
  if (!agente) return 'desconocido';
  const sistema = /Android/i.test(agente)
    ? 'Android'
    : /iPhone|iPad|iPod/i.test(agente)
      ? 'iPhone o iPad'
      : /Mac OS X/i.test(agente)
        ? 'Mac'
        : /Windows/i.test(agente)
          ? 'Windows'
          : /Linux/i.test(agente)
            ? 'Linux'
            : 'otro';
  const navegador = /Edg\//i.test(agente)
    ? 'Edge'
    : /OPR\/|Opera/i.test(agente)
      ? 'Opera'
      : /Chrome\//i.test(agente)
        ? 'Chrome'
        : /Firefox\//i.test(agente)
          ? 'Firefox'
          : /Safari\//i.test(agente)
            ? 'Safari'
            : 'navegador';
  return `${navegador} en ${sistema}`;
}

/**
 * Deja constancia de un intento de entrada.
 *
 * Se escribe con la clave de servicio porque en el momento del fallo NO hay
 * sesión: quien no ha conseguido entrar no tiene identidad con la que insertar
 * nada. Y aunque la hubiera, tampoco se le dejaría: si un usuario pudiera
 * escribir aquí, podría ahogar el registro en ruido y esconder ahí sus propios
 * intentos.
 *
 * Nunca lanza. Un registro de seguridad que tumba el login convierte un
 * problema de auditoría en una caída del servicio, que es peor.
 */
export async function registrarAcceso(
  admin: Cliente,
  datos: {
    email: string;
    exito: boolean;
    etapa: Etapa;
    motivo?: string | null;
    ip?: string | null;
    agente?: string | null;
    usuarioId?: string | null;
  },
): Promise<void> {
  try {
    let usuarioId = datos.usuarioId ?? null;

    /*
     * Si no viene el id, se busca por correo. Que no aparezca es información
     * en sí misma —alguien probando un correo que aquí no existe— y por eso la
     * fila se escribe igual, con el usuario a nulo.
     */
    if (!usuarioId) {
      const { data } = await admin
        .from('perfiles')
        .select('id')
        .eq('email', datos.email)
        .maybeSingle();
      usuarioId = data?.id ?? null;
    }

    await admin.from('accesos').insert({
      usuario_id: usuarioId,
      email: datos.email.slice(0, 200),
      exito: datos.exito,
      etapa: datos.etapa,
      motivo: datos.motivo ?? null,
      ip: datos.ip ?? null,
      // Los agentes largos no aportan nada y ensucian la tabla.
      agente: datos.agente?.slice(0, 300) ?? null,
    });
  } catch {
    // Ver arriba: esto jamás puede impedir entrar ni dejar de entrar.
  }
}

/** Borra los accesos más viejos que el plazo configurado. Lo llama el motor. */
export async function limpiarAccesos(admin: Cliente): Promise<number> {
  const { data: cfg } = await admin
    .from('configuracion')
    .select('valor')
    .eq('clave', 'accesos_retencion_dias')
    .maybeSingle();

  const dias = Number(cfg?.valor) || RETENCION_POR_DEFECTO;
  const limite = new Date(Date.now() - dias * 86_400_000).toISOString();

  const { data } = await admin.from('accesos').delete().lt('created_at', limite).select('id');

  return (data ?? []).length;
}

export type Conectado = {
  id: string;
  nombre: string;
  rol: string;
  vistoAt: string;
  minutos: number;
  /** Dentro de la ventana de presencia: se le puede pasar algo ahora mismo. */
  ahora: boolean;
};

/**
 * Quién tiene la aplicación abierta, y quién la ha tenido hoy.
 *
 * Devuelve a todo el equipo activo, no solo a los conectados: en una pantalla
 * que sirve para decidir a quién pasarle un caso urgente, saber quién NO está
 * vale exactamente lo mismo que saber quién sí.
 */
export async function quienEstaDentro(supabase: Cliente): Promise<{
  gente: Conectado[];
  ventanaMinutos: number;
}> {
  const [{ data: cfg }, { data: perfiles }, { data: presencias }] = await Promise.all([
    supabase.from('configuracion').select('valor').eq('clave', 'presencia_minutos').maybeSingle(),
    supabase.from('perfiles').select('id, nombre, rol').eq('activo', true).order('nombre'),
    supabase.from('presencia_app').select('perfil_id, visto_at'),
  ]);

  const ventanaMinutos = Number(cfg?.valor) || PRESENCIA_POR_DEFECTO;
  const visto = new Map((presencias ?? []).map((p) => [p.perfil_id, p.visto_at]));
  const ahora = Date.now();

  const gente: Conectado[] = (perfiles ?? [])
    .map((p) => {
      const vistoAt = visto.get(p.id) ?? null;
      const minutos = vistoAt
        ? Math.floor((ahora - Date.parse(vistoAt)) / 60_000)
        : Number.POSITIVE_INFINITY;
      return {
        id: p.id,
        nombre: p.nombre,
        rol: p.rol as string,
        vistoAt: vistoAt ?? '',
        minutos,
        ahora: minutos <= ventanaMinutos,
      };
    })
    .sort((a, b) => a.minutos - b.minutos);

  return { gente, ventanaMinutos };
}
