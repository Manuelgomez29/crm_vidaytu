import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

/**
 * La copia nocturna de HighLevel.
 *
 * Durante el piloto, el trabajo comercial de Método HOME ocurre en HighLevel:
 * clasificaciones, responsables, etapas y conversaciones. Ese trabajo es lo
 * que hace falta para volver en enero, y hoy vive en una suscripción que se
 * corta el día que no se pague, sin plazo de gracia.
 *
 * Esto se lo trae entero, cada noche, y lo guarda tal cual. No lo traduce al
 * modelo: una traducción con un fallo es una pérdida silenciosa que no se
 * descubre hasta el día que hace falta. El original se queda, y traducir se
 * puede repetir.
 */

const BASE = 'https://services.leadconnectorhq.com';
const VERSION = '2021-07-28';

/** Cuántas páginas se piden como mucho por recurso y pasada. */
const TOPE_PAGINAS = 60;
/** Cuántas conversaciones se recorren para traer sus mensajes, por pasada. */
const TOPE_CONVERSACIONES = 400;

type Fila = { tipo: string; ref: string; refPadre?: string | null; contenido: unknown };

function cabeceras(token: string) {
  return { Authorization: `Bearer ${token}`, Version: VERSION, Accept: 'application/json' };
}

async function pedir(token: string, ruta: string): Promise<Record<string, unknown>> {
  const url = ruta.startsWith('http') ? ruta : BASE + ruta;
  const r = await fetch(url, { headers: cabeceras(token) });
  if (!r.ok) {
    const cuerpo = (await r.text()).slice(0, 300);
    throw new Error(`HighLevel ${r.status} en ${ruta}: ${cuerpo}`);
  }
  return (await r.json()) as Record<string, unknown>;
}

/**
 * Guarda o refresca un lote en el espejo.
 *
 * `visto_at` se actualiza siempre, aunque el contenido no haya cambiado: es lo
 * que permite saber más adelante que algo dejó de estar allí —porque su última
 * vez vista se quedó atrás— en vez de que desaparezca sin rastro.
 */
async function espejar(
  admin: SupabaseClient<Database>,
  sistema: string,
  filas: Fila[],
): Promise<number> {
  if (filas.length === 0) return 0;
  const ahora = new Date().toISOString();

  // En lotes: una subcuenta con miles de contactos no cabe en una sentencia.
  let escritas = 0;
  for (let i = 0; i < filas.length; i += 250) {
    const lote = filas.slice(i, i + 250).map((f) => ({
      sistema,
      tipo: f.tipo,
      ref: f.ref,
      ref_padre: f.refPadre ?? null,
      contenido: f.contenido as never,
      visto_at: ahora,
    }));
    const { error } = await admin
      .from('canal_espejo')
      .upsert(lote, { onConflict: 'sistema,tipo,ref' });
    if (error) throw new Error(`Espejo: ${error.message}`);
    escritas += lote.length;
  }
  return escritas;
}

type Recuentos = Record<string, number>;

/**
 * ¿Toca copiar?
 *
 * El motor corre cada 15 minutos; la copia es diaria. En vez de un cron aparte
 * —que es una pieza más que puede pararse sin que nadie se entere— se mira
 * cuándo fue la última pasada buena y se decide aquí.
 */
export async function tocaCopiar(admin: SupabaseClient<Database>): Promise<boolean> {
  const { data: cfg } = await admin
    .from('configuracion')
    .select('valor')
    .eq('clave', 'canal_copia_cada_horas')
    .maybeSingle();
  const horas = Number(cfg?.valor) || 24;

  const { data: ultima } = await admin
    .from('canal_copias')
    .select('inicio')
    .eq('ok', true)
    .order('inicio', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!ultima) return true;
  return Date.now() - Date.parse(ultima.inicio) >= horas * 3_600_000;
}

/**
 * Se lo trae todo.
 *
 * Cada recurso se pagina hasta agotarlo. Si una lista viene llena y no hay por
 * dónde seguir, se marca `truncado` y se sigue con el resto: una copia
 * incompleta que se cree completa es exactamente la que falla el día que hace
 * falta, así que queda escrito.
 */
export async function copiarDeHighLevel(admin: SupabaseClient<Database>): Promise<{
  /*
   * DOS MOTIVOS MUY DISTINTOS PARA NO COPIAR, Y NO PUEDEN CONTARSE IGUAL.
   *
   * «No tocaba» es el sistema funcionando: la copia es diaria y el motor pasa
   * cada 15 minutos. «Sin credencial» es que NO HAY COPIA DE NADA, que es una
   * emergencia con un contrato que se corta sin aviso.
   *
   * Los dos decían lo mismo, y la pantalla del motor mostraba «no tocaba»
   * mientras el respaldo llevaba días sin existir. Eso es exactamente el fallo
   * silencioso que esta pieza venía a evitar.
   */
  saltada?: 'sin_credencial' | 'no_tocaba';
  recuentos?: Recuentos;
  truncado?: boolean;
}> {
  const token = process.env.HIGHLEVEL_TOKEN;
  const loc = process.env.HIGHLEVEL_LOCATION_ID;
  if (!token || !loc) return { saltada: 'sin_credencial' };

  const inicio = new Date().toISOString();
  const { data: copia } = await admin
    .from('canal_copias')
    .insert({ sistema: 'highlevel', inicio })
    .select('id')
    .single();

  const recuentos: Recuentos = {};
  let truncado = false;

  const anotar = async (tipo: string, filas: Fila[]) => {
    recuentos[tipo] = (recuentos[tipo] ?? 0) + filas.length;
    await espejar(admin, 'highlevel', filas);
  };

  try {
    // --- Lo que no pagina: la subcuenta y sus catálogos ---------------------
    const sub = await pedir(token, `/locations/${loc}`);
    await anotar('subcuenta', [{ tipo: 'subcuenta', ref: loc, contenido: sub.location ?? sub }]);

    const campos = (await pedir(token, `/locations/${loc}/customFields`)).customFields as
      | { id: string }[]
      | undefined;
    await anotar(
      'campo',
      (campos ?? []).map((c) => ({ tipo: 'campo', ref: c.id, contenido: c })),
    );

    const valores = (await pedir(token, `/locations/${loc}/customValues`)).customValues as
      | { id: string }[]
      | undefined;
    await anotar(
      'valor',
      (valores ?? []).map((v) => ({ tipo: 'valor', ref: v.id, contenido: v })),
    );

    const usuarios = (await pedir(token, `/users/?locationId=${loc}`)).users as
      | { id: string }[]
      | undefined;
    await anotar(
      'usuario',
      (usuarios ?? []).map((u) => ({ tipo: 'usuario', ref: u.id, contenido: u })),
    );

    const embudos = (await pedir(token, `/opportunities/pipelines?locationId=${loc}`)).pipelines as
      | { id: string }[]
      | undefined;
    await anotar(
      'embudo',
      (embudos ?? []).map((p) => ({ tipo: 'embudo', ref: p.id, contenido: p })),
    );

    // --- Contactos: paginan por cursor --------------------------------------
    let siguiente: string | null = `/contacts/?locationId=${loc}&limit=100`;
    let paginas = 0;
    while (siguiente && paginas < TOPE_PAGINAS) {
      const pagina: Record<string, unknown> = await pedir(token, siguiente);
      const lista = (pagina.contacts ?? []) as { id: string }[];
      await anotar(
        'contacto',
        lista.map((c) => ({ tipo: 'contacto', ref: c.id, contenido: c })),
      );
      const meta = (pagina.meta ?? {}) as { nextPageUrl?: string | null };
      siguiente = meta.nextPageUrl ?? null;
      paginas++;
      if (!siguiente && lista.length === 100) truncado = true;
    }
    if (paginas >= TOPE_PAGINAS) truncado = true;

    // --- Oportunidades: paginan por número de página ------------------------
    for (let p = 1; p <= TOPE_PAGINAS; p++) {
      const pagina = await pedir(
        token,
        `/opportunities/search?location_id=${loc}&limit=100&page=${p}`,
      );
      const lista = (pagina.opportunities ?? []) as { id: string }[];
      await anotar(
        'oportunidad',
        lista.map((o) => ({ tipo: 'oportunidad', ref: o.id, contenido: o })),
      );
      if (lista.length < 100) break;
      if (p === TOPE_PAGINAS) truncado = true;
    }

    // --- Conversaciones, y los mensajes de cada una -------------------------
    const conv = await pedir(token, `/conversations/search?locationId=${loc}&limit=100`);
    const conversaciones = (conv.conversations ?? []) as { id: string }[];
    await anotar(
      'conversacion',
      conversaciones.map((c) => ({ tipo: 'conversacion', ref: c.id, contenido: c })),
    );
    if (conversaciones.length === 100) truncado = true;

    /*
     * Los mensajes son el motivo de todo esto: sin ellos se vuelve con una
     * lista de nombres. Por eso se recorren una a una aunque salga caro.
     */
    for (const c of conversaciones.slice(0, TOPE_CONVERSACIONES)) {
      const m = await pedir(token, `/conversations/${c.id}/messages`);
      const sobre = (m.messages ?? {}) as { messages?: { id: string }[]; nextPage?: boolean };
      await anotar(
        'mensaje',
        (sobre.messages ?? []).map((x) => ({
          tipo: 'mensaje',
          ref: x.id,
          refPadre: c.id,
          contenido: x,
        })),
      );
      if (sobre.nextPage) truncado = true;
    }
    if (conversaciones.length > TOPE_CONVERSACIONES) truncado = true;

    await admin
      .from('canal_copias')
      .update({ fin: new Date().toISOString(), ok: true, recuentos, truncado })
      .eq('id', copia!.id);

    return { recuentos, truncado };
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : 'Error desconocido';
    await admin
      .from('canal_copias')
      .update({ fin: new Date().toISOString(), ok: false, recuentos, truncado, error: mensaje })
      .eq('id', copia!.id);
    // Se relanza: el motor lo marca como fase fallida y queda en rojo. Una
    // copia que falla en silencio da confianza sin dar respaldo.
    throw e;
  }
}
