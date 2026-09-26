import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { BarraVistas } from '@/app/leads/barra-vistas';
import { FiltrosPlegables } from '@/app/leads/filtros-plegables';
import { misVistas, type Vista } from '@/app/leads/vistas';
import { clasesEtiqueta, clasesCentro } from '@/lib/colores';
import { normalizarTelefono } from '@/lib/telefonos';
import { contactosDelSegmento, type FiltroSegmento } from '@/lib/segmentos';

/** Personas por página. Cabe en una pantalla sin tener que buscar dos veces. */
const POR_PAGINA = 50;

type FilaContacto = {
  id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  zona: string | null;
  consentimiento_marketing: boolean;
  origen: string | null;
  recorrido: { nombre: string; slug: string } | null;
  contacto_etiquetas: { etiqueta: { id: string; nombre: string; color: string | null } | null }[];
  lead_contactos: {
    lead_id: string;
    lead: { centro: { nombre: string; slug: string } | null } | null;
  }[];
};

/**
 * Los centros de los que viene una persona, sin repetir.
 *
 * Se deduce de sus casos en vez de guardarse como etiqueta, y es a propósito.
 * Una etiqueta «Bellamar» se escribe una vez y se queda ahí para siempre: el
 * día que ese caso se derive de Eclipse a Bellamar —que es el camino normal de
 * un ingreso— la etiqueta diría una cosa y el caso otra. Esto se lee del caso
 * cada vez, así que no puede desfasarse.
 *
 * Y sale lo que deja ver RLS: quien no tiene Bellamar no verá aquí Bellamar,
 * igual que no ve esos casos. La lista vacía es información: significa que esa
 * persona tiene casos en centros ajenos, o que todavía no tiene ninguno.
 */
/**
 * El enlace a otra página, con los filtros puestos.
 *
 * Si al pasar de página se perdieran, la página 2 enseñaría el directorio
 * entero y quien la abriera creería que su búsqueda daba eso.
 */
function enlacePagina(filtros: Record<string, string | undefined>, n: number): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filtros)) {
    if (v && k !== 'pagina' && k !== 'aviso') p.set(k, v);
  }
  if (n > 1) p.set('pagina', String(n));
  const q = p.toString();
  return q ? `/contactos?${q}` : '/contactos';
}

const ROTULO_ORIGEN: Record<string, string> = {
  highlevel: 'HighLevel',
  zerochats: 'Instagram',
  manychat: 'Instagram',
  formulario: 'Formulario web',
};

function centrosDe(c: FilaContacto): { nombre: string; slug: string }[] {
  const vistos = new Map<string, { nombre: string; slug: string }>();
  for (const v of c.lead_contactos ?? []) {
    // PostgREST devuelve la relación como objeto o como lista según el caso.
    const lead = Array.isArray(v.lead) ? v.lead[0] : v.lead;
    const centro = Array.isArray(lead?.centro) ? lead?.centro[0] : lead?.centro;
    if (centro?.slug) vistos.set(centro.slug, centro);
  }
  return [...vistos.values()];
}

export default async function DirectorioContactos({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    etiqueta?: string;
    lista?: string;
    consent?: string;
    vista?: string;
    aviso?: string;
    servicio?: string;
    origen?: string;
    pagina?: string;
  }>;
}) {
  const filtros = await searchParams;
  const supabase = await createClient();

  // Vistas guardadas de esta persona para el directorio (solo las suyas: RLS).
  const vistas = await misVistas('contactos');
  const filtrosPuestos = Object.fromEntries(
    Object.entries(filtros).filter(([k, v]) => v && k !== 'vista') as [string, string][],
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: perfilRol } = await supabase
    .from('perfiles')
    .select('rol')
    .eq('id', user.id)
    .maybeSingle();
  if (perfilRol?.rol === 'terapeuta') redirect('/agenda');

  const [
    { data: etiquetas },
    { data: listas },
    { count: totalContactos },
    { data: centrosCat },
    { data: recorridosCat },
  ] = await Promise.all([
    supabase.from('etiquetas').select('id, nombre, color').eq('activa', true).order('nombre'),
    supabase.from('listas').select('id, nombre, tipo, filtro').order('nombre'),
    supabase.from('contactos').select('id', { count: 'exact', head: true }),
    supabase.from('centros').select('nombre, slug').eq('activo', true).order('nombre'),
    supabase.from('recorridos').select('nombre, slug').eq('activo', true).order('orden'),
  ]);

  // Recuento de cada lista y segmento para el panel lateral.
  const recuentos = new Map<string, number>();
  await Promise.all(
    (listas ?? []).map(async (l) => {
      if (l.tipo === 'estatica') {
        const { count } = await supabase
          .from('lista_contactos')
          .select('contacto_id', { count: 'exact', head: true })
          .eq('lista_id', l.id);
        recuentos.set(l.id, count ?? 0);
      } else {
        const ids = await contactosDelSegmento(supabase, (l.filtro ?? {}) as FiltroSegmento);
        recuentos.set(l.id, ids.length);
      }
    }),
  );

  // Filtro por lista: estática = sus miembros; dinámica = se calcula ahora.
  let idsDeLista: string[] | null = null;
  const listaElegida = listas?.find((l) => l.id === filtros.lista);
  if (listaElegida) {
    if (listaElegida.tipo === 'estatica') {
      const { data: miembros } = await supabase
        .from('lista_contactos')
        .select('contacto_id')
        .eq('lista_id', listaElegida.id);
      idsDeLista = (miembros ?? []).map((m) => m.contacto_id);
    } else {
      idsDeLista = await contactosDelSegmento(
        supabase,
        (listaElegida.filtro ?? {}) as FiltroSegmento,
      );
    }
  }

  let idsDeEtiqueta: string[] | null = null;
  if (filtros.etiqueta) {
    const { data: conEtiqueta } = await supabase
      .from('contacto_etiquetas')
      .select('contacto_id')
      .eq('etiqueta_id', filtros.etiqueta);
    idsDeEtiqueta = (conEtiqueta ?? []).map((c) => c.contacto_id);
  }

  let ids: string[] | null = null;
  if (idsDeLista !== null && idsDeEtiqueta !== null) {
    const enLista = new Set(idsDeLista);
    ids = idsDeEtiqueta.filter((id) => enLista.has(id));
  } else {
    ids = idsDeLista ?? idsDeEtiqueta;
  }

  const busqueda = (filtros.q ?? '').trim();
  const comoTelefono = busqueda ? normalizarTelefono(busqueda) : null;

  /*
   * El centro se resuelve ANTES, porque hace falta para decidir la forma de
   * la consulta y no se puede esperar dentro de ella.
   */
  const slugCentro = filtros.servicio?.startsWith('centro:') ? filtros.servicio.slice(7) : null;
  const idCentro = slugCentro
    ? ((await supabase.from('centros').select('id').eq('slug', slugCentro).maybeSingle()).data
        ?.id ?? null)
    : null;
  const idRecorrido =
    !slugCentro && filtros.servicio
      ? ((
          await supabase.from('recorridos').select('id').eq('slug', filtros.servicio).maybeSingle()
        ).data?.id ?? null)
      : null;

  /*
   * FILTRAR POR CENTRO SIN TRAERSE LOS CASOS.
   *
   * La primera versión pedía todos los leads de ese centro, sacaba los
   * identificadores de sus contactos y los metía en un `in(...)`. Con cien
   * personas va; con tres mil, la lista de identificadores no cabe en la URL
   * y la consulta falla — y antes de eso, la propia lectura de leads se
   * habría cortado en mil sin avisar.
   *
   * Con `!inner` lo hace la base: solo salen las personas que tienen un caso
   * en ese centro, en una sola consulta y sin límite que la traicione.
   */
  const seleccion = (inner: boolean) => `id, nombre, telefono, email, zona,
       consentimiento_marketing, origen,
       recorrido:recorridos (nombre, slug),
       contacto_etiquetas (etiqueta:etiquetas (id, nombre, color)),
       lead_contactos${inner ? '!inner' : ''} (lead_id,
         lead:leads${inner ? '!inner' : ''} (centro_id, centro:centros (nombre, slug)))`;

  /*
   * La lista y el recuento tienen que llevar los MISMOS filtros. Construirlos
   * dos veces a mano es la forma segura de que un día se separen, así que se
   * construyen con la misma función.
   */
  const construir = (contar: boolean) => {
    let q = contar
      ? supabase
          .from('contactos')
          .select(seleccion(!!idCentro), { count: 'exact', head: true })
      : supabase.from('contactos').select(seleccion(!!idCentro));

    if (busqueda) {
      q = q.or(
        [
          `nombre.ilike.%${busqueda}%`,
          `email.ilike.%${busqueda}%`,
          `telefono.ilike.%${busqueda}%`,
          ...(comoTelefono ? [`telefono.eq.${comoTelefono}`] : []),
        ].join(','),
      );
    }
    if (filtros.consent === 'si') q = q.eq('consentimiento_marketing', true);
    if (filtros.consent === 'no') q = q.eq('consentimiento_marketing', false);
    if (filtros.origen) q = q.eq('origen', filtros.origen);
    if (idCentro) q = q.eq('lead_contactos.lead.centro_id', idCentro);
    if (idRecorrido) q = q.eq('recorrido_id', idRecorrido);
    if (ids !== null) q = q.in('id', ids);
    return q;
  };

  if (ids !== null && ids.length === 0) {
    // Filtro que no deja a nadie: evitamos una consulta con lista vacía.
    return (
      <Pagina
        pagina={1}
        paginas={1}
        totalFiltrado={0}
        vistas={vistas}
        filtrosPuestos={filtrosPuestos}
        etiquetas={etiquetas ?? []}
        listas={listas ?? []}
        centros={centrosCat ?? []}
        recorridos={recorridosCat ?? []}
        recuentos={recuentos}
        total={totalContactos ?? 0}
        filtros={filtros}
        contactos={[]}
      />
    );
  }

  const consulta = construir(false).order('nombre').order('id');
  const contarConsulta = construir(true);

  /*
   * El recuento va con los MISMOS filtros que la lista. Antes se enseñaba el
   * total del directorio junto a una lista filtrada, y no cuadraban.
   *
   * `count: 'planned'` no vale aquí: para paginar hace falta el número exacto,
   * o la última página sale vacía.
   */
  const { count: totalFiltrado } = await contarConsulta;

  const paginas = Math.max(1, Math.ceil((totalFiltrado ?? 0) / POR_PAGINA));
  const pagina = Math.min(Math.max(1, Number(filtros.pagina) || 1), paginas);
  const desde = (pagina - 1) * POR_PAGINA;

  const { data, error } = await consulta.range(desde, desde + POR_PAGINA - 1);

  return (
    <Pagina
      pagina={pagina}
      paginas={paginas}
      totalFiltrado={totalFiltrado ?? 0}
      vistas={vistas}
      filtrosPuestos={filtrosPuestos}
      etiquetas={etiquetas ?? []}
      listas={listas ?? []}
      centros={centrosCat ?? []}
      recorridos={recorridosCat ?? []}
      recuentos={recuentos}
      total={totalContactos ?? 0}
      filtros={filtros}
      contactos={(data ?? []) as unknown as FilaContacto[]}
      error={error?.message}
    />
  );
}

function Pagina({
  pagina,
  paginas,
  totalFiltrado,
  etiquetas,
  listas,
  centros,
  recorridos,
  recuentos,
  total,
  filtros,
  contactos,
  error,
  vistas,
  filtrosPuestos,
}: {
  pagina: number;
  paginas: number;
  totalFiltrado: number;
  etiquetas: { id: string; nombre: string; color: string | null }[];
  listas: { id: string; nombre: string; tipo: string }[];
  centros: { nombre: string; slug: string }[];
  recorridos: { nombre: string; slug: string }[];
  recuentos: Map<string, number>;
  total: number;
  filtros: {
    q?: string;
    etiqueta?: string;
    lista?: string;
    consent?: string;
    vista?: string;
    aviso?: string;
    servicio?: string;
    origen?: string;
    pagina?: string;
  };
  contactos: FilaContacto[];
  error?: string;
  vistas: Vista[];
  filtrosPuestos: Record<string, string>;
}) {
  const hayFiltros = Boolean(filtros.q || filtros.etiqueta || filtros.lista || filtros.consent);

  return (
    <AppShell
      seccion="contactos"
      subseccion="/contactos"
      titulo="Contactos"
      // Ya no todas tienen teléfono: quien llega por Instagram no lo da, y
      // decir que se deduplica por él sería describir algo que dejó de ser
      // cierto para la mayoría de esta lista.
      descripcion={`${total} personas · de los centros y de los canales sociales`}
    >
      {filtros.aviso && (
        <p className="mb-2 rounded-lg bg-warn-soft px-4 py-2 text-sm text-warn ring-1 ring-warn/25">
          {filtros.aviso}
        </p>
      )}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[230px_1fr]">
        {/* Panel de vistas: listas fijas y segmentos que se recalculan solos. */}
        <aside className="panel order-last p-2.5 lg:order-none">
          <p className="px-2.5 pb-1 pt-2 text-[10.5px] uppercase tracking-[0.1em] text-muted">
            Vistas
          </p>
          <Link
            href="/contactos"
            className={`flex items-center justify-between rounded-md px-2.5 py-1.5 text-[13px] font-medium transition ${
              !filtros.lista
                ? 'bg-primary-soft font-semibold text-primary'
                : 'text-ink2 hover:bg-ground'
            }`}
          >
            Todos <span className="num">{total}</span>
          </Link>

          {(['estatica', 'dinamica'] as const).map((tipo) => {
            const delTipo = listas.filter((l) => l.tipo === tipo);
            if (delTipo.length === 0) return null;
            return (
              <div key={tipo}>
                <p className="px-2.5 pb-1 pt-3 text-[10.5px] uppercase tracking-[0.1em] text-muted">
                  {tipo === 'estatica' ? 'Listas' : 'Segmentos'}
                </p>
                {delTipo.map((l) => (
                  <Link
                    key={l.id}
                    href={`/contactos?lista=${l.id}`}
                    className={`flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-[13px] transition ${
                      filtros.lista === l.id
                        ? 'bg-primary-soft font-semibold text-primary'
                        : 'font-medium text-ink2 hover:bg-ground'
                    }`}
                  >
                    <span className="truncate">{l.nombre}</span>
                    <span className="num shrink-0">{recuentos.get(l.id) ?? 0}</span>
                  </Link>
                ))}
              </div>
            );
          })}

          <Link
            href="/contactos/listas"
            className="mt-2 block rounded-md px-2.5 py-1.5 text-[13px] font-semibold text-primary hover:bg-ground"
          >
            + Nueva lista o segmento
          </Link>
        </aside>

        <div>
          <BarraVistas
            pantalla="contactos"
            vistas={vistas}
            filtrosActuales={filtrosPuestos}
            vistaActiva={filtros.vista}
          />

          <FiltrosPlegables
            puestos={
              [filtros.q, filtros.servicio, filtros.origen, filtros.etiqueta, filtros.consent]
                .filter(Boolean).length
            }
          >
            <form method="get" className="mb-4 flex flex-wrap items-end gap-2 text-sm">
            <input
              name="q"
              defaultValue={filtros.q ?? ''}
              placeholder="Nombre, teléfono o email…"
              className="campo min-w-48 flex-1"
            />
            {/*
              Los dos ejes, cada uno con su desplegable. El de servicio mezcla
              centros y recorridos a propósito: quien lo usa no piensa «esto es
              un centro y esto un recorrido», piensa «enséñame los de Bellamar»
              o «los de HOME». El prefijo distingue las dos consultas por
              detrás, donde sí son distintas.
            */}
            <select
              name="servicio"
              defaultValue={filtros.servicio ?? ''}
              className="campo w-44 shrink-0"
            >
              <option value="">Cualquier servicio</option>
              {centros.map((c) => (
                <option key={c.slug} value={`centro:${c.slug}`}>
                  {c.nombre}
                </option>
              ))}
              {recorridos.map((r) => (
                <option key={r.slug} value={r.slug}>
                  {r.nombre}
                </option>
              ))}
            </select>

            <select
              name="origen"
              defaultValue={filtros.origen ?? ''}
              className="campo w-40 shrink-0"
            >
              <option value="">Cualquier origen</option>
              {Object.entries(ROTULO_ORIGEN).map(([clave, texto]) => (
                <option key={clave} value={clave}>
                  {texto}
                </option>
              ))}
            </select>

            <input type="hidden" name="lista" value={filtros.lista ?? ''} />

            {/*
              Los dos de menos uso, plegados. Con cinco desplegables la barra
              se partía en dos líneas y ninguno destacaba; los que se usan a
              diario son buscar y servicio, y esos se quedan a la vista.
              `open` cuando alguno está puesto, para que un filtro activo no
              quede escondido detrás de un botón.
            */}
            <details className="relative shrink-0" open={Boolean(filtros.etiqueta || filtros.consent)}>
              <summary className="btn btn-ghost cursor-pointer list-none whitespace-nowrap [&::-webkit-details-marker]:hidden">
                Más filtros
              </summary>
              <div className="panel absolute right-0 z-20 mt-2 flex w-64 flex-col gap-2 p-3">
                <label className="etiqueta-campo">
                  Etiqueta
                  <select name="etiqueta" defaultValue={filtros.etiqueta ?? ''} className="campo">
                    <option value="">Cualquiera</option>
                    {etiquetas.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.nombre}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="etiqueta-campo">
                  Consentimiento de marketing
                  <select name="consent" defaultValue={filtros.consent ?? ''} className="campo">
                    <option value="">Indiferente</option>
                    <option value="si">Con consentimiento</option>
                    <option value="no">Sin consentimiento</option>
                  </select>
                </label>
                <button type="submit" className="btn btn-primary">
                  Aplicar
                </button>
              </div>
            </details>
            <button type="submit" className="btn btn-primary shrink-0">
              Buscar
            </button>
              {hayFiltros && (
                <Link href="/contactos" className="px-2 py-2 text-primary hover:underline">
                  Limpiar
                </Link>
              )}
            </form>
          </FiltrosPlegables>

          {error ? (
            <p className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger ring-1 ring-danger/25">
              No se pudo cargar el directorio: {error}
            </p>
          ) : contactos.length === 0 ? (
            <p className="rounded-lg bg-surface px-4 py-8 text-center text-sm text-ink2 ring-1 ring-line">
              Ningún contacto coincide con la búsqueda.
            </p>
          ) : (
            <>
              <p className="mb-2 text-sm text-ink2">
                {totalFiltrado} contacto{totalFiltrado === 1 ? '' : 's'}
                {paginas > 1 && ` · página ${pagina} de ${paginas}`}
              </p>
              <div className="panel hidden overflow-x-auto sm:block">
                <table className="tabla min-w-[720px] table-fixed">
                  <thead>
                    <tr>
                      {/*
                        Anchos declarados, no repartidos por el navegador. Con
                        reparto automático el nombre —que es lo que se busca—
                        se quedaba en 81 px y partido en tres líneas, mientras
                        una etiqueta larga de centro se llevaba 245.
                      */}
                      <th className="w-[24%]">Nombre</th>
                      <th className="w-[16%]">Servicio</th>
                      <th className="w-[10%]">Origen</th>
                      <th className="w-[13%]">Teléfono</th>
                      <th className="w-[12%]">Email</th>
                      <th className="w-[12%]">Etiquetas</th>
                      <th className="w-[13%]">Marketing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contactos.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <Link
                            href={`/contactos/${c.id}`}
                            className="block truncate font-semibold hover:text-primary hover:underline"
                            title={c.nombre}
                          >
                            {c.nombre}
                          </Link>
                          {/* La zona ocupaba una columna entera para dos
                              palabras: cabe aquí, como lo que es. */}
                          <span className="block truncate text-xs text-muted">
                            {/* «0 casos» en cada fila es ruido: la mayoría de
                                las personas de redes no tienen ninguno. */}
                            {[
                              c.zona,
                              c.lead_contactos.length > 0
                                ? `${c.lead_contactos.length} caso${c.lead_contactos.length === 1 ? '' : 's'}`
                                : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </td>
                        <td>
                          {/*
                            SERVICIO: el centro cuando lo hay, y si no el
                            recorrido. Son la misma pregunta —«para qué
                            consulta»— contestada por dos caminos: el centro
                            sale de sus casos, el recorrido está en la persona.
                          */}
                          <div className="flex min-w-0 flex-wrap gap-1">
                            {centrosDe(c).map((centro) => (
                              <span
                                key={centro.slug}
                                title={centro.nombre}
                                className={`chip max-w-full truncate ${clasesCentro(centro.slug).chip}`}
                              >
                                {centro.nombre}
                              </span>
                            ))}
                            {centrosDe(c).length === 0 &&
                              (c.recorrido ? (
                                <span className="chip chip-gr max-w-full truncate">
                                  {c.recorrido.nombre}
                                </span>
                              ) : (
                                <span className="text-muted">Sin aclarar</span>
                              ))}
                          </div>
                        </td>
                        <td className="text-ink2">
                          {c.origen ? (ROTULO_ORIGEN[c.origen] ?? c.origen) : '—'}
                        </td>
                        <td className="num truncate text-ink2">{c.telefono ?? '—'}</td>
                        <td className="num truncate text-ink2" title={c.email ?? undefined}>
                          {c.email ?? '—'}
                        </td>
                        <td>
                          {/*
                            Una etiqueta y el resto contado. Con todas, las
                            filas de dos etiquetas medían 85 px frente a 60 y
                            la lista dejaba de barrerse de un vistazo. Las
                            demás están a un paso, en la ficha, y el título
                            las enseña sin moverse de aquí.
                          */}
                          {(() => {
                            const etqs = c.contacto_etiquetas
                              .map((ce) => ce.etiqueta)
                              .filter((e): e is NonNullable<typeof e> => Boolean(e));
                            if (etqs.length === 0) return <span className="text-muted">—</span>;
                            return (
                              <div
                                className="flex min-w-0 items-center gap-1"
                                title={etqs.map((e) => e.nombre).join(' · ')}
                              >
                                <span
                                  className={`min-w-0 truncate rounded-full px-2 py-0.5 text-[11px] ring-1 ${clasesEtiqueta(etqs[0].color)}`}
                                >
                                  {etqs[0].nombre}
                                </span>
                                {etqs.length > 1 && (
                                  <span className="num shrink-0 text-[11px] text-muted">
                                    +{etqs.length - 1}
                                  </span>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        <td>
                          {c.consentimiento_marketing ? (
                            <span className="rounded-full bg-ok-soft px-2 py-0.5 text-[11px] font-medium text-ok ring-1 ring-ok/25">
                              Sí
                            </span>
                          ) : (
                            <span className="text-muted">No</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/*
                EN EL MÓVIL, FICHAS. La tabla mide 878 px dentro de 341: había
                que arrastrarla de lado para leer un teléfono. Y esta pantalla se
                abre sobre todo con el móvil en la mano y una llamada entrando —
                «¿quién es este número?»—, así que el teléfono va grande, primero
                y se marca tocándolo.
              */}
              <ul className="flex flex-col gap-2 sm:hidden">
                {contactos.map((c) => {
                  const centros = centrosDe(c);
                  return (
                    <li key={c.id} className="panel p-3">
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={`/contactos/${c.id}`}
                          className="font-semibold hover:text-primary hover:underline"
                        >
                          {c.nombre}
                        </Link>
                        {c.lead_contactos.length > 0 && (
                          <span className="num shrink-0 text-xs text-muted">
                            {c.lead_contactos.length} caso{c.lead_contactos.length === 1 ? '' : 's'}
                          </span>
                        )}
                      </div>

                      {/* Sin número no hay nada que marcar: se dice, en vez
                          de ofrecer un enlace que no llama a nadie. */}
                      {c.telefono ? (
                        <a
                          href={`tel:${c.telefono}`}
                          className="num mt-1 block text-[15px] font-semibold text-primary"
                        >
                          {c.telefono}
                        </a>
                      ) : (
                        <p className="mt-1 text-[13px] text-muted">Sin teléfono</p>
                      )}
                      {c.email && <p className="num text-xs text-ink2">{c.email}</p>}

                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        {centros.map((centro) => (
                          <span key={centro.slug} className={`chip ${clasesCentro(centro.slug).chip}`}>
                            {centro.nombre}
                          </span>
                        ))}
                        {c.contacto_etiquetas.map(
                          (ce) =>
                            ce.etiqueta && (
                              <span
                                key={ce.etiqueta.id}
                                className={`rounded-full px-2 py-0.5 text-[11px] ring-1 ${clasesEtiqueta(ce.etiqueta.color)}`}
                              >
                                {ce.etiqueta.nombre}
                              </span>
                            ),
                        )}
                        {centros.length === 0 && c.recorrido && (
                          <span className="chip chip-gr">{c.recorrido.nombre}</span>
                        )}
                        {c.origen && (
                          <span className="text-[11px] text-muted">
                            vía {ROTULO_ORIGEN[c.origen] ?? c.origen}
                          </span>
                        )}
                        {c.zona && <span className="text-[11px] text-muted">{c.zona}</span>}
                      </div>
                    </li>
                  );
                })}
              </ul>

              {paginas > 1 && (
                <nav
                  aria-label="Páginas de contactos"
                  className="mt-4 flex items-center justify-between gap-2 text-sm"
                >
                  {pagina > 1 ? (
                    <Link href={enlacePagina(filtros, pagina - 1)} className="btn btn-ghost">
                      ← Anterior
                    </Link>
                  ) : (
                    <span className="btn btn-ghost pointer-events-none opacity-40">← Anterior</span>
                  )}

                  <span className="num text-ink2">
                    {pagina} de {paginas}
                  </span>

                  {pagina < paginas ? (
                    <Link href={enlacePagina(filtros, pagina + 1)} className="btn btn-ghost">
                      Siguiente →
                    </Link>
                  ) : (
                    <span className="btn btn-ghost pointer-events-none opacity-40">
                      Siguiente →
                    </span>
                  )}
                </nav>
              )}
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
