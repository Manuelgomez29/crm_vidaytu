import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { createAdminClient } from '@/lib/supabase/admin';
import { puestaEnMarcha, resumen, type Punto } from '@/lib/puesta-en-marcha';
import { exigirDireccion } from '../guard';

export const dynamic = 'force-dynamic';

/**
 * Lo que falta para arrancar.
 *
 * No es una lista escrita a mano: cada punto se comprueba contra la base o
 * contra las variables del servidor en el momento de abrir la pantalla. Por eso
 * puede decirse sin miedo «ya está»: nadie lo ha marcado, se ha mirado.
 *
 * Los pendientes van ARRIBA y los resueltos abajo y plegados. Una lista donde
 * lo hecho y lo que falta pesan lo mismo obliga a leerla entera cada vez, y una
 * lista que hay que leer entera deja de leerse.
 */
function Fila({ p }: { p: Punto }) {
  return (
    <li
      className={`rounded-lg p-3 ring-1 ${
        p.hecho
          ? 'ring-line'
          : p.gravedad === 'bloquea'
            ? 'bg-danger-soft ring-danger/25'
            : 'bg-warn-soft ring-warn/25'
      }`}
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <span aria-hidden className={p.hecho ? 'text-ok' : 'text-ink2'}>
          {p.hecho ? '✓' : '○'}
        </span>
        <b className="text-[13.5px]">{p.titulo}</b>
        {!p.hecho && (
          <span className={`chip ${p.gravedad === 'bloquea' ? 'chip-danger' : 'chip-warn'}`}>
            {p.gravedad === 'bloquea' ? 'Bloquea' : 'Conviene'}
          </span>
        )}
        {p.donde && !p.hecho && (
          <Link href={p.donde.href} className="ml-auto text-xs text-primary hover:underline">
            {p.donde.texto} →
          </Link>
        )}
      </div>
      {!p.hecho && <p className="mt-1 max-w-[80ch] text-[12.5px] text-ink2">{p.porQue}</p>}
      <p className="mt-1 text-[11.5px] text-muted">{p.detalle}</p>
    </li>
  );
}

export default async function PuestaEnMarcha() {
  const { supabase, perfil } = await exigirDireccion();
  if (perfil?.alcance !== 'grupo') redirect('/admin');

  const puntos = await puestaEnMarcha(supabase, createAdminClient());
  const { bloquean, convienen, hechos, total } = resumen(puntos);
  const listo = bloquean.length === 0 && convienen.length === 0;

  return (
    <AppShell
      seccion="admin"
      subseccion="/admin/puesta-en-marcha"
      titulo="Puesta en marcha"
      descripcion="Lo que falta antes del primer caso real"
    >
      <div
        className={`mb-5 rounded-xl p-4 ring-1 ${
          bloquean.length > 0
            ? 'bg-danger-soft ring-danger/25'
            : listo
              ? 'bg-ok-soft ring-ok/25'
              : 'bg-warn-soft ring-warn/25'
        }`}
      >
        <p className="num text-2xl font-bold">
          {hechos} de {total}
        </p>
        <p className="mt-0.5 max-w-[80ch] text-[13px] text-ink2">
          {bloquean.length > 0 ? (
            <>
              Hay <b>{bloquean.length}</b> cosa(s) que impiden trabajar con normalidad
              {convienen.length > 0 ? ` y ${convienen.length} que conviene resolver` : ''}. Nada de
              esto se comprueba de memoria: cada línea sale de una consulta hecha ahora mismo.
            </>
          ) : listo ? (
            <>Todo comprobado. Se puede empezar.</>
          ) : (
            <>
              Nada impide trabajar. Quedan <b>{convienen.length}</b> cosa(s) que conviene resolver
              para que la plataforma haga todo lo que sabe hacer.
            </>
          )}
        </p>
      </div>

      {bloquean.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 text-[11px] uppercase tracking-[0.1em] text-danger">
            Impide trabajar
          </h2>
          <ul className="flex flex-col gap-2">
            {bloquean.map((p) => (
              <Fila key={p.clave} p={p} />
            ))}
          </ul>
        </section>
      )}

      {convienen.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 text-[11px] uppercase tracking-[0.1em] text-warn">
            Conviene resolver
          </h2>
          <ul className="flex flex-col gap-2">
            {convienen.map((p) => (
              <Fila key={p.clave} p={p} />
            ))}
          </ul>
        </section>
      )}

      {hechos > 0 && (
        <details className="panel p-4">
          <summary className="cursor-pointer text-[13px] font-semibold text-ink2">
            Ya resuelto ({hechos})
          </summary>
          <ul className="mt-3 flex flex-col gap-2">
            {puntos
              .filter((p) => p.hecho)
              .map((p) => (
                <Fila key={p.clave} p={p} />
              ))}
          </ul>
        </details>
      )}

      <p className="mt-4 max-w-[80ch] text-xs text-muted">
        Lo que no se puede comprobar desde aquí no sale en esta lista, y son dos cosas que hay que
        hacer a mano igualmente: guardar en sitio seguro los datos de acceso de quien administra la
        plataforma, y activar las copias de seguridad con recuperación a un punto en el tiempo
        (PITR) en Supabase. Una lista con casillas que nadie ha mirado es peor que no tenerla.
      </p>
    </AppShell>
  );
}
