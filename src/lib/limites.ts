/**
 * Límite de peticiones.
 *
 * Frena el abuso de lo que está expuesto: el login, los webhooks, el enlace de
 * baja, el alta de dispositivos y las consultas a la IA.
 *
 * El contador vive en la base de datos, no en memoria del proceso. En un
 * despliegue sin servidor cada petición puede caer en una instancia distinta:
 * un contador en memoria se reinicia solo y no ve lo que hacen las demás, así
 * que da una sensación de protección sin protección ninguna.
 *
 * FALLA ABIERTO. Si la consulta del límite se cae, se deja pasar. Un límite
 * roto que bloquea el login deja al equipo fuera de su propia herramienta, y
 * si la base de datos no responde la plataforma no funciona de todas formas:
 * cerrar aquí no protegería nada y sí rompería el trabajo de doce personas.
 */
import { createAdminClient } from '@/lib/supabase/admin';

/** Los ajustes que trae la migración, por si `configuracion` no responde. */
const POR_DEFECTO: Record<string, { maximo: number; ventana: number }> = {
  login_por_cuenta: { maximo: 10, ventana: 900 },
  login_por_ip: { maximo: 30, ventana: 900 },
  formularios: { maximo: 60, ventana: 60 },
  whatsapp: { maximo: 300, ventana: 60 },
  cron: { maximo: 20, ventana: 60 },
  baja: { maximo: 30, ventana: 3600 },
  push: { maximo: 20, ventana: 3600 },
  ia: { maximo: 40, ventana: 3600 },
};

export type NombreLimite = keyof typeof POR_DEFECTO;

let cacheAjustes: { valor: typeof POR_DEFECTO; hasta: number } | null = null;

/**
 * Los límites salen de `configuracion` (regla 13), con treinta segundos de
 * caché: leerlos de base de datos en cada intento de login añadiría una
 * consulta a la ruta más caliente para un valor que casi nunca cambia.
 */
async function ajustes(): Promise<typeof POR_DEFECTO> {
  if (cacheAjustes && cacheAjustes.hasta > Date.now()) return cacheAjustes.valor;

  try {
    const { data } = await createAdminClient()
      .from('configuracion')
      .select('valor')
      .eq('clave', 'limites_peticiones')
      .maybeSingle();

    const valor =
      data?.valor && typeof data.valor === 'object'
        ? { ...POR_DEFECTO, ...(data.valor as typeof POR_DEFECTO) }
        : POR_DEFECTO;

    cacheAjustes = { valor, hasta: Date.now() + 30_000 };
    return valor;
  } catch {
    return POR_DEFECTO;
  }
}

/**
 * ¿Cabe este intento dentro del límite?
 *
 * `identificador` es lo que se cuenta: una IP, un email, un id de usuario.
 * Devuelve `true` si puede seguir adelante.
 */
export async function dentroDelLimite(
  limite: NombreLimite,
  identificador: string,
): Promise<boolean> {
  try {
    const config = (await ajustes())[limite] ?? POR_DEFECTO[limite];
    const { data, error } = await createAdminClient().rpc('consumir_intento', {
      p_clave: `${limite}:${identificador}`,
      p_maximo: config.maximo,
      p_ventana_segundos: config.ventana,
    });
    if (error) return true; // Falla abierto: ver la cabecera del archivo.
    return data !== false;
  } catch {
    return true;
  }
}

/**
 * IP de quien hace la petición.
 *
 * Detrás de un proxy (Vercel, Cloudflare) la IP real viaja en `x-forwarded-for`
 * y la del socket es la del proxy. Se toma la PRIMERA de la lista, que es la
 * del cliente; las siguientes son proxies intermedios.
 *
 * Cuidado: esa cabecera la puede falsificar quien llegue directo al servidor
 * sin pasar por el proxy. En un despliegue serio el proxy la reescribe y eso
 * no ocurre — pero por eso el límite por IP nunca es la única defensa: el
 * login lleva además el límite por cuenta, que no se puede falsificar.
 */
export function ipDeLaPeticion(cabeceras: Headers): string {
  const reenviada = cabeceras.get('x-forwarded-for');
  if (reenviada) {
    const primera = reenviada.split(',')[0]?.trim();
    if (primera) return primera;
  }
  return cabeceras.get('x-real-ip') ?? cabeceras.get('cf-connecting-ip') ?? 'desconocida';
}
