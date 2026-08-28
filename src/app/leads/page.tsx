import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { cerrarSesion } from './actions';

const ETIQUETA_ESTADO: Record<string, { texto: string; clases: string }> = {
  nuevo: { texto: 'Nuevo', clases: 'bg-blue-50 text-blue-700 ring-blue-200' },
  contactado: { texto: 'Contactado', clases: 'bg-sky-50 text-sky-700 ring-sky-200' },
  cita_agendada: { texto: 'Cita agendada', clases: 'bg-indigo-50 text-indigo-700 ring-indigo-200' },
  cita_realizada: { texto: 'Cita realizada', clases: 'bg-violet-50 text-violet-700 ring-violet-200' },
  en_valoracion: { texto: 'En valoración', clases: 'bg-amber-50 text-amber-700 ring-amber-200' },
  convertido: { texto: 'Convertido', clases: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  derivado: { texto: 'Derivado', clases: 'bg-cyan-50 text-cyan-700 ring-cyan-200' },
  perdido: { texto: 'Perdido', clases: 'bg-red-50 text-red-700 ring-red-200' },
  no_valido: { texto: 'No válido', clases: 'bg-slate-100 text-slate-600 ring-slate-200' },
  reabierto: { texto: 'Reabierto', clases: 'bg-orange-50 text-orange-700 ring-orange-200' },
};

type FilaLead = {
  id: string;
  nombre: string;
  estado: string;
  created_at: string;
  centro: { nombre: string } | null;
  canal: { nombre: string } | null;
  propietario: { nombre: string } | null;
};

export default async function LeadsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data, error } = await supabase
    .from('leads')
    .select(
      `id, nombre, estado, created_at,
       centro:centros (nombre),
       canal:canales (nombre),
       propietario:perfiles!leads_propietario_id_fkey (nombre)`,
    )
    .order('created_at', { ascending: false });

  const leads = (data ?? []) as unknown as FilaLead[];

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <h1 className="text-lg font-semibold tracking-tight">
            Vida y Tu <span className="text-teal-600">DATA</span>
          </h1>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-500 sm:inline">{user.email}</span>
            <form action={cerrarSesion}>
              <button
                type="submit"
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              >
                Cerrar sesión
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-xl font-semibold">Leads</h2>
          <span className="text-sm text-slate-500">
            {leads.length} {leads.length === 1 ? 'lead visible' : 'leads visibles'}
          </span>
        </div>

        {error ? (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
            No se pudieron cargar los leads: {error.message}
          </p>
        ) : leads.length === 0 ? (
          <p className="rounded-lg bg-white px-4 py-8 text-center text-sm text-slate-500 ring-1 ring-slate-200">
            No hay leads visibles para tu usuario.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Nombre</th>
                  <th className="px-4 py-3 font-medium">Centro</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 font-medium">Propietario</th>
                  <th className="px-4 py-3 font-medium">Canal</th>
                  <th className="px-4 py-3 font-medium">Creado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leads.map((lead) => {
                  const estado = ETIQUETA_ESTADO[lead.estado] ?? {
                    texto: lead.estado,
                    clases: 'bg-slate-100 text-slate-600 ring-slate-200',
                  };
                  return (
                    <tr key={lead.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium">{lead.nombre}</td>
                      <td className="px-4 py-3">{lead.centro?.nombre ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${estado.clases}`}
                        >
                          {estado.texto}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {lead.propietario?.nombre ?? (
                          <span className="inline-block rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
                            Sin asignar
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">{lead.canal?.nombre ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-500">
                        {new Date(lead.created_at).toLocaleDateString('es-ES', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          timeZone: 'Europe/Madrid',
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
