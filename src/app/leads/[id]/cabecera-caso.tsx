import Link from 'next/link';
import { BotonLlamada } from '../boton-llamada';

type Motivo = { id: string; nombre: string };

type Contacto = {
  nombre: string | null;
  telefono: string | null;
  tipo: string;
  relacion: string | null;
  id?: string | null;
};

/**
 * Con quién hablas y cómo le llamas, antes que nada.
 *
 * En escritorio esto ya estaba resuelto: «Datos del caso» y «Contactos del
 * caso» viven en la columna lateral, a la derecha y a la vista. Pero en el
 * MÓVIL esa columna no está al lado: está debajo, y debajo de otras siete
 * secciones. Para saber a quién estás llamando había que pasar por el resumen,
 * la actividad, las tareas, las citas, los adjuntos, los presupuestos y la
 * conversión — tres de las cuales se usan una vez cada quince casos.
 *
 * Y faltaba lo principal: el registro de llamada en dos toques SOLO existía en
 * el cajón rápido del tablero. Quien abría la ficha entera —desde «Mi día»,
 * desde el buscador, desde un aviso del móvil— no lo tenía, y esa es la acción
 * que más veces se repite al cabo del día.
 *
 * Así que aquí va lo mismo que hace falta con el teléfono en la oreja: el
 * número marcable, con quién se habla, y el botón. Lo demás sigue donde estaba.
 */
export function CabeceraCaso({
  leadId,
  telefono,
  quienContacta,
  relacion,
  afectado,
  principal,
  motivos,
  cerrado,
}: {
  leadId: string;
  telefono: string | null;
  quienContacta: string;
  /** «madre», «pareja»… del propio caso, cuando el contacto no la trae. */
  relacion: string | null;
  /** Por quién se llama, cuando no es quien descuelga. */
  afectado: string | null;
  principal: Contacto | null;
  motivos: Motivo[];
  cerrado: boolean;
}) {
  // El principal manda: si el caso lo lleva la madre, se llama a la madre y no
  // al teléfono que trajo el formulario (regla 4: el lead es un caso, no una
  // persona). Si no hay principal, queda el del caso.
  const numero = principal?.telefono ?? telefono;
  const conQuien = principal?.nombre ?? null;

  /*
   * El parentesco puede venir de dos sitios y casi nunca de los dos: el
   * contacto lo trae cuando lo escribio alguien a mano, y el CASO lo trae
   * cuando entro por un formulario («quien contacta: familiar, relacion:
   * madre»). Si solo se mirara el contacto, lo normal seria no enseñar nada.
   */
  const parentesco = principal?.relacion ?? relacion ?? null;

  return (
    <section className="mt-3 rounded-xl bg-surface p-4 ring-1 ring-line">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          {numero ? (
            <a
              href={`tel:${numero}`}
              className="num text-[22px] font-bold tracking-tight text-primary hover:underline"
            >
              {numero}
            </a>
          ) : (
            <p className="text-[15px] font-semibold text-warn">Este caso no tiene teléfono</p>
          )}

          <p className="mt-0.5 text-[13px] text-ink2">
            {conQuien ? (
              <>
                Hablas con <b className="text-ink">{conQuien}</b>
                {parentesco ? ` · ${parentesco}` : ''}
                {principal?.id && (
                  <>
                    {' · '}
                    <Link
                      href={`/contactos/${principal.id}`}
                      className="text-primary hover:underline"
                    >
                      ver ficha
                    </Link>
                  </>
                )}
              </>
            ) : (
              <>Quien contacta: {quienContacta}</>
            )}
          </p>

          {/*
            Por quien se llama, cuando no es quien descuelga. Es la mitad de la
            conversacion: no es lo mismo preguntarle a alguien por su situacion
            que preguntarle por la de su hijo, y equivocarse en eso en la
            primera frase cuesta la llamada entera.
          */}
          {afectado && afectado.trim() && afectado.trim() !== conQuien && (
            <p className="mt-0.5 text-[13px] text-ink2">
              Por <b className="text-ink">{afectado}</b>
            </p>
          )}
        </div>

        {/*
          Un caso cerrado no se llama: no se ofrece el boton, porque la llamada
          registraria actividad sobre algo que ya esta perdido o convertido y
          ensuciaria la cadencia. Para retomarlo esta «Reabrir» mas abajo.
        */}
        {!cerrado && numero && (
          <div className="min-w-[min(100%,18rem)] flex-1 sm:max-w-sm">
            <BotonLlamada leadId={leadId} telefono={numero} motivos={motivos} />
          </div>
        )}
      </div>
    </section>
  );
}
