import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/app-shell';
import { etiquetaEstado } from '@/lib/estados';
import { normalizarTelefono } from '@/lib/telefonos';
import { patronesDeBusqueda, valorSeguro } from '@/lib/busqueda';
import { hace } from '@/lib/fechas';

/**
 * Búsqueda global por nombre o teléfono. Devuelve casos y personas por
 * separado, cada cosa limitada por lo que RLS deja ver a quien busca.
 */
type VinculoContacto = {
  es_principal: boolean;
  contacto: { id: string; nombre: string; telefono: string | null } | null;
};
type VinculoCaso = { lead: { id: string; nombre: string } | null };

/**
 * Quién es quien llama, respecto a la persona afectada.
 *
 * Se dice la relación, no el nombre del afectado: esto es un listado que puede
 * mirarse con alguien delante, y ahí sobra todo lo que no haga falta (regla 11).
 */
function quienEs(quienContacta: string | null, relacion: string | null) {
  if (relacion) return ` (${relacion})`;
  if (quienContacta === 'afectado') return ' (la propia persona)';
  if (quienContacta === 'familiar') return ' (un familiar)';
  if (quienContacta === 'prescriptor') return ' (prescriptor)';
  return '';
}

export default async function Buscar({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('rol')
    .eq('id', user.id)
    .maybeSingle();
  if (perfil?.rol === 'terapeuta') redirect('/agenda');

  const busqueda = (q ?? '').trim();

  /*
   * Se busca por texto y, si lo tecleado parece un teléfono, también en E.164.
   *
   * El valor va escapado: la coma es el separador de condiciones en `or()`, y
   * buscar «Gómez, Ana» —lo que sale al copiar un nombre de una lista— tumbaba
   * esta página entera con un error de sintaxis.
   */
  const comoTelefono = normalizarTelefono(busqueda);
  const patrones = busqueda
    ? [
        patronesDeBusqueda(busqueda, ['nombre', 'telefono']),
        ...(comoTelefono ? [`telefono.eq.${valorSeguro(comoTelefono)}`] : []),
      ].join(',')
    : '';

  const [{ data: leads }, { data: contactos }] = busqueda
    ? await Promise.all([
        supabase
          .from('leads')
          /*
           * Con su gente. Un caso NO es una persona —por la misma situación
           * pueden llamar la madre, la pareja y el propio afectado—, así que el
           * resultado tiene que decir a quién se llama, no solo cómo se llama el
           * caso. Sin esto, encontrabas el caso y seguías sin saber a quién
           * marcar.
           */
          .select(
            `id, nombre, telefono, estado, created_at, quien_contacta, relacion_con_afectado,
             centro:centros (nombre),
             lead_contactos (es_principal, contacto:contactos (id, nombre, telefono))`,
          )
          .or(patrones)
          .order('created_at', { ascending: false })
          .limit(25),
        supabase
          .from('contactos')
          // Con los casos por su NOMBRE, no un recuento: «2 casos» no dice nada
          // que se pueda usar; «Prueba Cuatro, Prueba Ocho» sí.
          .select('id, nombre, telefono, email, lead_contactos (lead:leads (id, nombre))')
          .or(`${patrones},${patronesDeBusqueda(busqueda, ['email'])}`)
          .order('nombre')
          .limit(25),
      ])
    : [{ data: [] }, { data: [] }];

  return (
    <AppShell
      seccion="leads"
      titulo="Búsqueda"
      descripcion={busqueda ? `Resultados para «${busqueda}»` : 'Busca por nombre o teléfono'}
    >
      <form method="get" className="mb-5 flex max-w-xl gap-2">
        <input
          name="q"
          defaultValue={busqueda}
          placeholder="Nombre o teléfono…"
          autoFocus
          className="campo flex-1"
        />
        <button type="submit" className="btn btn-primary">
          Buscar
        </button>
      </form>

      {!busqueda ? (
        <p className="text-sm text-muted">
          Escribe un nombre o un teléfono. El teléfono funciona con o sin prefijo.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <section>
            <h3 className="mb-2 text-[11px] uppercase tracking-[0.1em] text-muted">
              Casos ({(leads ?? []).length})
            </h3>
            <div className="flex flex-col gap-2">
              {(leads ?? []).map((l) => {
                const estado = etiquetaEstado(l.estado);
                const gente = (l.lead_contactos ?? []) as VinculoContacto[];
                const principal = gente.find((v) => v.es_principal) ?? gente[0];
                return (
                  <Link key={l.id} href={`/leads/${l.id}`} className="panel block p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        {/* Que se vea que es un CASO y no una persona: son dos
                            cosas distintas y el nombre del caso suele ser el de
                            quien llamó, que es justo lo que despista. */}
                        <span className="chip chip-primary">Caso</span>
                        <b className="text-[13.5px]">{l.nombre}</b>
                      </span>
                      <span className={`chip ${estado.clases}`}>{estado.texto}</span>
                    </div>

                    <p className="mt-1 text-xs text-ink2">
                      {principal?.contacto ? (
                        <>
                          Llama a <b className="text-ink">{principal.contacto.nombre}</b>
                          {quienEs(l.quien_contacta, l.relacion_con_afectado)}
                          {' · '}
                          <span className="num">{principal.contacto.telefono ?? l.telefono}</span>
                          {gente.length > 1 && (
                            <span className="text-muted">
                              {' '}
                              (+{gente.length - 1} persona{gente.length > 2 ? 's' : ''} más)
                            </span>
                          )}
                        </>
                      ) : (
                        /* Un caso sin persona vinculada es un caso al que no se
                           puede llamar. Se dice, en vez de dejar el hueco. */
                        <span className="text-warn-ink">
                          Sin persona asociada · <span className="num">{l.telefono}</span>
                        </span>
                      )}
                    </p>

                    <p className="mt-0.5 text-xs text-muted">
                      {l.centro?.nombre} · entró {hace(l.created_at)}
                    </p>
                  </Link>
                );
              })}
              {(leads ?? []).length === 0 && (
                <p className="text-sm text-muted">Ningún caso coincide.</p>
              )}
            </div>
          </section>

          <section>
            <h3 className="mb-2 text-[11px] uppercase tracking-[0.1em] text-muted">
              Personas ({(contactos ?? []).length})
            </h3>
            <div className="flex flex-col gap-2">
              {(contactos ?? []).map((c) => (
                <Link key={c.id} href={`/contactos/${c.id}`} className="panel block p-3">
                  <span className="flex items-center gap-2">
                    <span className="chip chip-mut">Persona</span>
                    <b className="text-[13.5px]">{c.nombre}</b>
                  </span>
                  <p className="num mt-1 text-xs text-ink2">
                    {c.telefono}
                    {c.email && ` · ${c.email}`}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {/* Los casos por su nombre y no un recuento: «2 casos» no es
                        una respuesta, «Prueba Cuatro y Prueba Ocho» sí. */}
                    {(c.lead_contactos ?? []).length === 0
                      ? 'Sin ningún caso'
                      : `En: ${(c.lead_contactos as VinculoCaso[])
                          .map((v) => v.lead?.nombre)
                          .filter(Boolean)
                          .join(' · ')}`}
                  </p>
                </Link>
              ))}
              {(contactos ?? []).length === 0 && (
                <p className="text-sm text-muted">Ninguna persona coincide.</p>
              )}
            </div>
          </section>
        </div>
      )}
    </AppShell>
  );
}
