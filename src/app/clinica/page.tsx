import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { fecha } from '@/lib/fechas';
import { exigirAccesoClinico } from './guard';

const CHIP_CENTRO: Record<string, string> = {
  horizonte: 'chip-hz',
  eclipse: 'chip-ec',
  bellamar: 'chip-bm',
  'bandeja-grupo': 'chip-gr',
};

const CHIP_ESTADO: Record<string, { texto: string; clase: string }> = {
  activo: { texto: 'En tratamiento', clase: 'chip-ok' },
  alta: { texto: 'Alta', clase: 'chip-primary' },
  abandono: { texto: 'Abandono', clase: 'chip-danger' },
  derivado_externo: { texto: 'Derivado fuera', clase: 'chip-mut' },
};

export default async function Pacientes({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; centro?: string; q?: string; aviso?: string }>;
}) {
  const { estado, centro, q, aviso } = await searchParams;
  const { supabase, perfil, esDireccion } = await exigirAccesoClinico();

  let consulta = supabase
    .from('pacientes')
    .select(
      'id, nombre, estado, fecha_ingreso, fecha_alta, created_at, centro:centros (nombre, slug), fase:fases_metodo (nombre), terapeuta:perfiles!pacientes_terapeuta_id_fkey (nombre), modalidad:modalidades (nombre)',
    )
    .order('created_at', { ascending: false });

  if (estado) consulta = consulta.eq('estado', estado as 'activo');
  if (centro) consulta = consulta.eq('centro_id', centro);
  if (q) consulta = consulta.ilike('nombre', `%${q}%`);

  const [{ data: pacientes, error }, { data: centros }] = await Promise.all([
    consulta,
    supabase.from('centros').select('id, nombre').eq('activo', true).order('nombre'),
  ]);

  const lista = pacientes ?? [];
  const sinReferente = lista.filter((p) => !p.terapeuta?.nombre);
  const enTratamiento = lista.filter((p) => p.estado === 'activo').length;

  return (
    <AppShell
      seccion="clinica"
      subseccion="/clinica"
      titulo={esDireccion ? 'Pacientes' : 'Mis pacientes'}
      descripcion={
        esDireccion
          ? `${lista.length} ficha(s) · ${enTratamiento} en tratamiento`
          : `${lista.length} paciente(s) de los que eres referente`
      }
    >
      {aviso && (
        <p className="mb-4 rounded-lg bg-ok-soft px-4 py-3 text-sm text-ok ring-1 ring-ok/25">{aviso}</p>
      )}

      {!esDireccion && (
        <p className="mb-4 rounded-lg bg-surface2 px-4 py-3 text-xs text-ink2">
          Ves únicamente los pacientes de los que eres terapeuta referente. No es un filtro de esta
          pantalla: la base de datos no te devuelve ningún otro.
        </p>
      )}

      {esDireccion && sinReferente.length > 0 && (
        <p className="mb-4 rounded-lg bg-warn-soft px-4 py-3 text-sm text-warn ring-1 ring-warn/25">
          {sinReferente.length} ficha(s) sin terapeuta referente. Mientras no lo tengan, nadie del
          equipo clínico las ve.
        </p>
      )}

      <form className="mb-4 flex flex-wrap items-center gap-2">
        <input
          name="q"
          defaultValue={q ?? ''}
          placeholder="Buscar por nombre…"
          className="campo min-w-48 flex-1"
        />
        <select name="estado" defaultValue={estado ?? ''} className="campo">
          <option value="">Cualquier estado</option>
          <option value="activo">En tratamiento</option>
          <option value="alta">Alta</option>
          <option value="abandono">Abandono</option>
          <option value="derivado_externo">Derivado fuera</option>
        </select>
        {esDireccion && (
          <select name="centro" defaultValue={centro ?? ''} className="campo">
            <option value="">Todos los centros</option>
            {(centros ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        )}
        <button type="submit" className="btn btn-ghost">
          Filtrar
        </button>
      </form>

      {error ? (
        <p className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger ring-1 ring-danger/25">
          No se pudieron cargar los pacientes: {error.message}
        </p>
      ) : lista.length === 0 ? (
        <p className="panel px-4 py-8 text-center text-sm text-ink2">
          {esDireccion
            ? 'Todavía no hay fichas de paciente. Se crean solas al validar una conversión.'
            : `Ahora mismo no eres referente de ningún paciente, ${perfil.nombre.split(' ')[0]}.`}
        </p>
      ) : (
        <div className="panel overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Paciente</th>
                <th>Centro</th>
                <th>Fase</th>
                <th>Referente</th>
                <th>Modalidad</th>
                <th>Estado</th>
                <th>Ingreso</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => {
                const chip = CHIP_ESTADO[p.estado] ?? { texto: p.estado, clase: 'chip-mut' };
                return (
                  <tr key={p.id}>
                    <td>
                      <Link
                        href={`/clinica/${p.id}`}
                        className="font-semibold text-primary hover:underline"
                      >
                        {p.nombre}
                      </Link>
                    </td>
                    <td>
                      {p.centro && (
                        <span className={`chip ${CHIP_CENTRO[p.centro.slug] ?? 'chip-mut'}`}>
                          {p.centro.nombre}
                        </span>
                      )}
                    </td>
                    <td className="text-ink2">{p.fase?.nombre ?? '—'}</td>
                    <td className={p.terapeuta?.nombre ? 'text-ink2' : 'font-semibold text-warn'}>
                      {p.terapeuta?.nombre ?? 'Sin asignar'}
                    </td>
                    <td className="text-ink2">{p.modalidad?.nombre ?? '—'}</td>
                    <td>
                      <span className={`chip ${chip.clase}`}>{chip.texto}</span>
                    </td>
                    <td className="text-ink2">{fecha(p.fecha_ingreso, false)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
