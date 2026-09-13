import { AppShell } from '@/components/app-shell';
import { redirect } from 'next/navigation';
import { exigirDireccion } from '../guard';
import { inputAdmin, botonAdmin } from '../nav';
import { AltaDeFuente, RegenerarToken } from './formularios';
import { alternarFuente } from './actions';

export const dynamic = 'force-dynamic';

/**
 * Por dónde entran los leads.
 *
 * Cada landing con su llave y su sitio. Lo importante de esta pantalla no es
 * dar de alta —eso se hace una vez— sino la columna de la derecha: cuándo trajo
 * la última persona. Una landing rota y una campaña sin demanda se ven igual
 * desde dentro, porque las dos consisten en que no llega nadie.
 */
function haceCuanto(iso: string | null): { texto: string; alarma: boolean } {
  if (!iso) return { texto: 'todavía nada', alarma: false };
  const horas = Math.floor((Date.now() - Date.parse(iso)) / 3_600_000);
  if (horas < 1) return { texto: 'hace menos de una hora', alarma: false };
  if (horas < 36) return { texto: `hace ${horas} h`, alarma: false };
  const dias = Math.round(horas / 24);
  // Tres días sin un solo lead en una landing con campaña activa es raro.
  return { texto: `hace ${dias} días`, alarma: dias >= 3 };
}

export default async function AdminCaptacion() {
  const { supabase, perfil } = await exigirDireccion();
  if (perfil?.rol !== 'direccion') redirect('/leads');

  const [{ data: fuentes }, { data: centros }, { data: canales }, { data: modalidades }] =
    await Promise.all([
      supabase
        .from('fuentes_captacion')
        .select(
          'id, slug, nombre, activa, subcanal, ultimo_lead_at, total_leads, centro:centros (nombre), canal:canales (nombre), modalidad:modalidades (nombre)',
        )
        .order('nombre'),
      supabase
        .from('centros')
        .select('id, nombre')
        .eq('activo', true)
        .eq('es_bandeja_grupo', false)
        .order('nombre'),
      supabase.from('canales').select('id, nombre').eq('activo', true).order('nombre'),
      supabase.from('modalidades').select('id, nombre').eq('activa', true).order('nombre'),
    ]);

  /*
   * La dirección sale de la configuración del entorno, no escrita aquí.
   * Estaba puesta a mano y eso es lo que hace que un día se copie una URL que
   * ya no es —y quien monte la landing no tiene forma de saberlo—. Si el
   * entorno no la tiene, se dice, en vez de enseñar algo que parece bueno.
   */
  const urlApp = (process.env.NEXT_PUBLIC_URL_APP ?? '').replace(/\/+$/, '');
  const urlBuena = /^https:\/\//.test(urlApp);

  return (
    <AppShell
      seccion="admin"
      subseccion="/admin/captacion"
      titulo="Captación"
      descripcion="Por dónde entran los leads, y si siguen entrando"
    >
      <p className="mb-4 max-w-[76ch] text-sm text-ink2">
        Cada landing o formulario tiene su propio token. El{' '}
        <b>centro y el canal los decide esta pantalla</b>, no lo que envíe la landing: un token
        acaba en manos de quien la monta, y no puede servir para meter casos en un centro que no es
        el suyo.
      </p>

      {/* ---------------- Las que hay ---------------- */}
      <section className="panel mb-5 p-4">
        <h2 className="mb-3 text-sm font-semibold">
          Fuentes <span className="font-normal text-ink2">({(fuentes ?? []).length})</span>
        </h2>

        {(fuentes ?? []).length === 0 ? (
          <p className="text-sm text-muted">
            Todavía no hay ninguna. Lo que entre por el secreto global sigue funcionando como hasta
            ahora.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {(fuentes ?? []).map((f) => {
              const visto = haceCuanto(f.ultimo_lead_at);
              return (
                <li
                  key={f.id}
                  className={`rounded-lg p-3 ring-1 ${f.activa ? 'ring-line' : 'opacity-60 ring-line'}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <b className="text-[13.5px]">{f.nombre}</b>
                    <code className="chip chip-mut">{f.slug}</code>
                    <span className={`chip ${f.centro ? 'chip-primary' : 'chip-warn'}`}>
                      {f.centro?.nombre ?? 'Bandeja de grupo'}
                    </span>
                    {f.modalidad && <span className="chip chip-mut">{f.modalidad.nombre}</span>}
                    {!f.activa && <span className="chip chip-danger">Apagada</span>}

                    <span className="ml-auto flex items-center gap-3 text-xs">
                      <span className={visto.alarma ? 'font-semibold text-danger' : 'text-ink2'}>
                        Último lead: {visto.texto}
                      </span>
                      <span className="num text-muted">{f.total_leads} en total</span>
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-4">
                    <span className="text-xs text-muted">
                      Canal: {f.canal?.nombre}
                      {f.subcanal ? ` · ${f.subcanal}` : ''}
                    </span>
                    <form action={alternarFuente.bind(null, f.id, !f.activa)}>
                      <button type="submit" className="text-xs text-primary hover:underline">
                        {f.activa ? 'Apagar' : 'Encender'}
                      </button>
                    </form>
                    <RegenerarToken id={f.id} nombre={f.nombre} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ---------------- Alta ---------------- */}
      <section className="panel mb-5 p-4">
        <h2 className="mb-3 text-sm font-semibold">Dar de alta una fuente</h2>
        <AltaDeFuente
          centros={centros ?? []}
          canales={canales ?? []}
          modalidades={modalidades ?? []}
          clases={{ input: inputAdmin, boton: botonAdmin }}
        />
      </section>

      {/* ---------------- Cómo se conecta ---------------- */}
      <section className="panel p-4">
        <h2 className="mb-1 text-sm font-semibold">Qué darle a quien monte la landing</h2>
        <p className="mb-3 max-w-[76ch] text-xs text-ink2">
          Una petición por cada formulario enviado. Solo <b>nombre</b> y <b>telefono</b> son
          obligatorios.
        </p>
        <pre className="overflow-x-auto rounded-lg bg-surface2 p-3 text-[12px] leading-relaxed">
          {`POST ${urlBuena ? urlApp : '(falta NEXT_PUBLIC_URL_APP)'}/api/formularios
Content-Type: application/json
x-fuente-token: (el token de la fuente)

{
  "nombre": "Nombre y apellidos",
  "telefono": "+34600000000",
  "email": "opcional@ejemplo.com",
  "mensaje": "Lo que escriba en el formulario",
  "quien_contacta": "familiar",     // familiar | afectado | prescriptor | otro
  "landing_url": "https://…",
  "utm_source": "meta",
  "utm_campaign": "…",
  "origen_ref": "id-unico-del-envio"
}`}
        </pre>
        {!urlBuena && (
          <p className="mt-2 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger ring-1 ring-danger/25">
            En este entorno <code>NEXT_PUBLIC_URL_APP</code> no es una dirección https, así que la
            de arriba no se puede dar por buena{urlApp ? ` (dice «${urlApp}»)` : ''}. En producción
            tiene que apuntar al dominio real.
          </p>
        )}
        <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5 text-xs text-ink2">
          <li>
            <b>El token va en la cabecera, nunca en la página.</b> Si el formulario lo envía el
            navegador con JavaScript, el token queda a la vista de cualquiera que mire el código y
            deja de proteger nada. Tiene que enviarlo el servidor de la landing.
          </li>
          <li>
            <b>`origen_ref`</b> es el identificador del envío. Si llega dos veces el mismo, no se
            crea un caso duplicado. Vale cualquier cosa única: el id del envío en la landing, o la
            marca de tiempo con el teléfono.
          </li>
          <li>
            Si el teléfono ya tiene un caso <b>cerrado</b>, se reabre con su propietario anterior.
            Si lo tiene <b>abierto</b>, no se toca: se anota y se avisa. Es la regla 4, la misma que
            en el alta manual.
          </li>
          <li>
            La respuesta dice qué pasó: <code>creado</code>, <code>reabierto</code>,{' '}
            <code>anotado</code> o <code>duplicado</code>.
          </li>
        </ul>
      </section>
    </AppShell>
  );
}
