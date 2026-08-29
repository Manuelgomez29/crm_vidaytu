import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Cabecera } from '@/components/cabecera';
import { etiquetaEstado } from '@/lib/estados';
import { fecha } from '@/lib/fechas';
import {
  anadirAListaEstatica,
  anadirEtiqueta,
  cambiarConsentimiento,
  guardarContacto,
  quitarDeLista,
  quitarEtiqueta,
} from '../actions';

const inputClase =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-200';
const botonClase =
  'rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-teal-700';
const botonSecundario =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100';

const TIPO_CONTACTO: Record<string, string> = {
  familiar: 'Familiar',
  afectado: 'Afectado',
  prescriptor: 'Prescriptor',
  otro: 'Otro',
};

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl bg-white p-4 ring-1 ring-slate-200">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{titulo}</h3>
      {children}
    </section>
  );
}

export default async function FichaContacto({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; aviso?: string }>;
}) {
  const { id } = await params;
  const { error: errorMsg, aviso } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: contacto } = await supabase
    .from('contactos')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!contacto) notFound();

  const [{ data: susEtiquetas }, { data: etiquetas }, { data: listas }, { data: enListas }, { data: casos }] =
    await Promise.all([
      supabase
        .from('contacto_etiquetas')
        .select('etiqueta_id, aplicada_por, etiqueta:etiquetas (id, nombre)')
        .eq('contacto_id', id),
      supabase.from('etiquetas').select('id, nombre').eq('activa', true).order('nombre'),
      supabase.from('listas').select('id, nombre, tipo').eq('tipo', 'estatica').order('nombre'),
      supabase.from('lista_contactos').select('lista_id, lista:listas (id, nombre)').eq('contacto_id', id),
      // Solo se ven los casos que permita RLS: un comercial de otro centro no
      // verá aquí los casos de centros ajenos.
      supabase
        .from('lead_contactos')
        .select(
          'tipo, relacion, es_principal, lead:leads (id, nombre, estado, created_at, centro:centros (nombre))',
        )
        .eq('contacto_id', id),
    ]);

  const idsPuestas = new Set((susEtiquetas ?? []).map((e) => e.etiqueta_id));
  const disponibles = (etiquetas ?? []).filter((e) => !idsPuestas.has(e.id));
  const idsListas = new Set((enListas ?? []).map((l) => l.lista_id));
  const listasDisponibles = (listas ?? []).filter((l) => !idsListas.has(l.id));

  return (
    <div className="min-h-screen">
      <Cabecera email={user.email ?? ''} />

      <main className="mx-auto max-w-5xl px-4 py-6">
        <Link href="/contactos" className="text-sm text-teal-700 hover:underline">
          ← Volver al directorio
        </Link>

        {errorMsg && (
          <p className="mt-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 ring-1 ring-red-200">
            {errorMsg}
          </p>
        )}
        {aviso && (
          <p className="mt-3 rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-800 ring-1 ring-emerald-200">
            {aviso}
          </p>
        )}

        <h2 className="mt-3 text-2xl font-semibold">{contacto.nombre}</h2>
        <p className="text-sm text-slate-500">
          {contacto.telefono}
          {contacto.email && ` · ${contacto.email}`} · en el directorio desde{' '}
          {fecha(contacto.created_at, false)}
        </p>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <Seccion titulo="Datos de la persona">
            <form action={guardarContacto.bind(null, contacto.id)} className="flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                  Nombre *
                  <input name="nombre" defaultValue={contacto.nombre} required className={inputClase} />
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                  Teléfono *
                  <input name="telefono" defaultValue={contacto.telefono} required className={inputClase} />
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                  Email
                  <input name="email" type="email" defaultValue={contacto.email ?? ''} className={inputClase} />
                </label>
                <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                  Zona
                  <input name="zona" defaultValue={contacto.zona ?? ''} className={inputClase} />
                </label>
              </div>
              <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
                Notas
                <textarea name="notas" rows={3} defaultValue={contacto.notas ?? ''} className={inputClase} />
              </label>
              <p className="text-xs text-slate-400">
                Minimización de datos: aquí no se guardan diagnósticos ni documentos de identidad.
              </p>
              <button type="submit" className={`${botonClase} self-start`}>
                Guardar
              </button>
            </form>
          </Seccion>

          <div className="flex flex-col gap-4">
            <Seccion titulo="Consentimiento de marketing">
              {contacto.consentimiento_marketing ? (
                <div className="flex flex-col gap-3">
                  <p className="text-sm">
                    <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                      Concedido
                    </span>{' '}
                    el {fecha(contacto.consentimiento_marketing_at)}
                  </p>
                  <p className="text-sm text-slate-600">
                    Origen: {contacto.consentimiento_marketing_origen ?? '—'}
                  </p>
                  <form action={cambiarConsentimiento.bind(null, contacto.id)}>
                    <input type="hidden" name="conceder" value="no" />
                    <button type="submit" className={botonSecundario}>
                      Retirar consentimiento
                    </button>
                  </form>
                </div>
              ) : (
                <form action={cambiarConsentimiento.bind(null, contacto.id)} className="flex flex-col gap-2">
                  <input type="hidden" name="conceder" value="si" />
                  <p className="text-sm text-slate-600">
                    Sin consentimiento: este contacto queda fuera de cualquier envío.
                  </p>
                  <input
                    name="origen"
                    placeholder="Origen (p. ej. casilla del formulario web, consentimiento verbal en cita…)"
                    className={inputClase}
                  />
                  <button type="submit" className={`${botonClase} self-start`}>
                    Registrar consentimiento
                  </button>
                </form>
              )}
            </Seccion>

            <Seccion titulo="Etiquetas">
              <div className="mb-3 flex flex-wrap gap-2">
                {(susEtiquetas ?? []).map(
                  (ce) =>
                    ce.etiqueta && (
                      <form
                        key={ce.etiqueta.id}
                        action={quitarEtiqueta.bind(null, contacto.id, ce.etiqueta.id)}
                      >
                        <button
                          type="submit"
                          title="Quitar etiqueta"
                          className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700 ring-1 ring-slate-200 transition hover:bg-red-50 hover:text-red-700 hover:ring-red-200"
                        >
                          {ce.etiqueta.nombre}
                          {ce.aplicada_por === null && ' (auto)'} ×
                        </button>
                      </form>
                    ),
                )}
                {(susEtiquetas ?? []).length === 0 && (
                  <span className="text-sm text-slate-400">Sin etiquetas.</span>
                )}
              </div>
              <form action={anadirEtiqueta.bind(null, contacto.id)} className="flex flex-wrap gap-2">
                <select name="etiqueta" defaultValue="" className={inputClase}>
                  <option value="">Etiqueta existente…</option>
                  {disponibles.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nombre}
                    </option>
                  ))}
                </select>
                <input name="nueva" placeholder="…o crear una nueva" className={`${inputClase} min-w-0 flex-1`} />
                <button type="submit" className={botonSecundario}>
                  Añadir
                </button>
              </form>
            </Seccion>

            <Seccion titulo="Listas">
              <ul className="mb-3 flex flex-col gap-1.5">
                {(enListas ?? []).map(
                  (l) =>
                    l.lista && (
                      <li key={l.lista.id} className="flex items-center justify-between gap-2 text-sm">
                        <span>{l.lista.nombre}</span>
                        <form action={quitarDeLista.bind(null, contacto.id, l.lista.id)}>
                          <button type="submit" className="text-xs text-slate-500 hover:text-red-600 hover:underline">
                            Quitar
                          </button>
                        </form>
                      </li>
                    ),
                )}
                {(enListas ?? []).length === 0 && (
                  <li className="text-sm text-slate-400">En ninguna lista estática.</li>
                )}
              </ul>
              {listasDisponibles.length > 0 ? (
                <form action={anadirAListaEstatica.bind(null, contacto.id)} className="flex gap-2">
                  <select name="lista" defaultValue="" className={`${inputClase} min-w-0 flex-1`}>
                    <option value="">Añadir a una lista…</option>
                    {listasDisponibles.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.nombre}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className={botonSecundario}>
                    Añadir
                  </button>
                </form>
              ) : (
                <Link href="/contactos/listas" className="text-sm text-teal-700 hover:underline">
                  Crear una lista
                </Link>
              )}
              <p className="mt-2 text-xs text-slate-400">
                Los segmentos dinámicos no se rellenan a mano: se calculan por sus criterios.
              </p>
            </Seccion>
          </div>
        </div>

        <div className="mt-4">
          <Seccion titulo="Casos en los que participa">
            <ul className="flex flex-col gap-2">
              {(casos ?? []).map(
                (c) =>
                  c.lead && (
                    <li
                      key={c.lead.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-slate-100"
                    >
                      <div>
                        <Link href={`/leads/${c.lead.id}`} className="font-medium hover:text-teal-700 hover:underline">
                          {c.lead.nombre}
                        </Link>
                        <p className="text-xs text-slate-500">
                          {c.lead.centro?.nombre} · {TIPO_CONTACTO[c.tipo] ?? c.tipo}
                          {c.relacion && ` (${c.relacion})`}
                          {c.es_principal && ' · contacto principal'} · {fecha(c.lead.created_at, false)}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${
                          etiquetaEstado(c.lead.estado).clases
                        }`}
                      >
                        {etiquetaEstado(c.lead.estado).texto}
                      </span>
                    </li>
                  ),
              )}
              {(casos ?? []).length === 0 && (
                <li className="text-sm text-slate-400">
                  Ningún caso visible para tu usuario. Puede tener casos en centros a los que no
                  tienes acceso.
                </li>
              )}
            </ul>
          </Seccion>
        </div>
      </main>
    </div>
  );
}
