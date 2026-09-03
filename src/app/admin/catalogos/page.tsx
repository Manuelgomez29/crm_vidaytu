import { AppShell } from '@/components/app-shell';
import { exigirDireccion } from '../guard';
import { Avisos, botonAdmin, botonAdminSecundario, inputAdmin } from '../nav';
import { crearElementoCatalogo, editarElementoCatalogo, type Catalogo } from '../actions';

type Elemento = { id: string; nombre: string; slug: string; activo: boolean };

function Bloque({
  catalogo,
  titulo,
  descripcion,
  elementos,
}: {
  catalogo: Catalogo;
  titulo: string;
  descripcion: string;
  elementos: Elemento[];
}) {
  return (
    <section className="rounded-xl bg-surface p-4 ring-1 ring-line">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-ink2">{titulo}</h3>
      <p className="mb-3 mt-0.5 text-xs text-ink2">{descripcion}</p>

      <form action={crearElementoCatalogo.bind(null, catalogo)} className="mb-3 flex flex-wrap gap-2">
        <input name="nombre" placeholder="Nuevo…" className={`${inputAdmin} min-w-40 flex-1`} />
        <button type="submit" className={botonAdmin}>
          Añadir
        </button>
      </form>

      <ul className="flex flex-col gap-1.5">
        {elementos.map((e) => (
          <li key={e.id}>
            <form
              action={editarElementoCatalogo.bind(null, catalogo, e.id)}
              className={`flex flex-wrap items-center gap-2 ${e.activo ? '' : 'opacity-60'}`}
            >
              <input name="nombre" defaultValue={e.nombre} className={`${inputAdmin} min-w-40 flex-1`} />
              <label className="flex items-center gap-1.5 text-sm text-ink2">
                <input type="checkbox" name="activo" defaultChecked={e.activo} /> Activo
              </label>
              <button type="submit" className={botonAdminSecundario}>
                Guardar
              </button>
            </form>
          </li>
        ))}
        {elementos.length === 0 && <li className="text-sm text-muted">Vacío.</li>}
      </ul>
    </section>
  );
}

export default async function AdminCatalogos({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; aviso?: string }>;
}) {
  const { error: errorMsg, aviso } = await searchParams;
  const { supabase, user } = await exigirDireccion();

  const [{ data: canales }, { data: adicciones }, { data: modalidades }, { data: motivos }] =
    await Promise.all([
      supabase.from('canales').select('id, nombre, slug, activo').order('nombre'),
      supabase.from('adicciones').select('id, nombre, slug, activa').order('nombre'),
      supabase.from('modalidades').select('id, nombre, slug, activa').order('nombre'),
      supabase.from('motivos_perdida').select('id, nombre, slug, activo').order('nombre'),
    ]);

  const normalizar = (
    filas: { id: string; nombre: string; slug: string; activo?: boolean; activa?: boolean }[] | null,
  ): Elemento[] =>
    (filas ?? []).map((f) => ({
      id: f.id,
      nombre: f.nombre,
      slug: f.slug,
      activo: f.activo ?? f.activa ?? true,
    }));

  return (
    <AppShell
      seccion="admin"
      subseccion="/admin/catalogos"
      titulo="Catálogos"
      descripcion="Los desplegables de toda la plataforma"
    >
        <Avisos error={errorMsg} aviso={aviso} />
        <p className="mb-4 text-sm text-ink2">
          Los desplegables de toda la plataforma salen de aquí. Desactivar un elemento lo retira de
          los formularios sin tocar los casos que ya lo usan.
        </p>

        <div className="grid gap-4 lg:grid-cols-2">
          <Bloque
            catalogo="canales"
            titulo="Canales de entrada"
            descripcion="De dónde llega el lead: Meta Ads, formulario web, Instagram, prescriptor…"
            elementos={normalizar(canales)}
          />
          <Bloque
            catalogo="modalidades"
            titulo="Modalidades de tratamiento"
            descripcion="Ambulatorio, centro de día, online, piso tutelado, ingreso residencial…"
            elementos={normalizar(modalidades)}
          />
          <Bloque
            catalogo="motivos_perdida"
            titulo="Motivos de pérdida"
            descripcion="Obligatorios al marcar un lead como perdido: alimentan las métricas."
            elementos={normalizar(motivos)}
          />
          <Bloque
            catalogo="adicciones"
            titulo="Adicciones"
            descripcion="Solo para clasificar el interés comercial. Nunca es un diagnóstico."
            elementos={normalizar(adicciones)}
          />
        </div>
      </AppShell>
  );
}
