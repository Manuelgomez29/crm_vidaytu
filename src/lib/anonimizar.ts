/**
 * Anonimización por retención (RGPD, artículo 5.1.e: los datos no se guardan
 * más tiempo del necesario).
 *
 * TRES DECISIONES DELIBERADAS:
 *
 * 1. APAGADO POR DEFECTO. El plazo de retención es una decisión jurídica del
 *    grupo, no técnica. La propuesta de partida son 12 meses desde que el caso
 *    se cerró, pero eso lo confirma el asesor: hasta entonces la plataforma no
 *    borra nada por su cuenta.
 *
 * 2. ANONIMIZA, NO BORRA. Las filas se quedan, sin datos personales. Así las
 *    métricas históricas siguen cuadrando —cuántos leads entraron en 2026 por
 *    Instagram, cuántos se perdieron por precio— sin conservar a quién
 *    pertenecían. Borrar destruiría el histórico del negocio para proteger
 *    algo que se puede proteger sin destruirlo.
 *
 * 3. NUNCA TOCA CASOS ABIERTOS NI CONVERTIDOS. Solo perdidos y no válidos que
 *    llevan cerrados más del plazo. Un caso convertido tiene detrás una
 *    relación contractual con su propio plazo de conservación, y ese no lo
 *    decide esta función.
 *
 * Un contacto solo se anonimiza si TODOS sus casos son anonimizables: la misma
 * persona puede haber vuelto por otro caso que sigue vivo.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

type Cliente = SupabaseClient<Database>;

export type CandidatosAnonimizacion = {
  meses: number;
  casos: { id: string; nombre: string; estado: string; cerrado: string }[];
  contactos: number;
};

/** Teléfono irrepetible y sintáctica­mente válido, para no chocar con el UNIQUE. */
function telefonoAnonimo(): string {
  // El prefijo +99 no existe como país: nadie lo confundirá con un número real.
  return `+99${Date.now().toString().slice(-9)}${Math.floor(Math.random() * 900 + 100)}`;
}

/**
 * Qué se anonimizaría, sin tocar nada. Es lo que la pantalla enseña antes de
 * que nadie pulse: una acción irreversible se mira antes de hacerse.
 */
export async function candidatosAnonimizacion(
  cliente: Cliente,
  meses: number,
): Promise<CandidatosAnonimizacion> {
  const limite = new Date();
  limite.setMonth(limite.getMonth() - meses);

  const { data: casos } = await cliente
    .from('leads')
    .select('id, nombre, estado, cerrado_at')
    .in('estado', ['perdido', 'no_valido'])
    // Por `cerrado_at`, no por `updated_at`: el segundo lo pisa el trigger en
    // cada edición, y un caso cerrado hace un año en el que alguien corrige
    // una coma volvería a empezar el reloj desde cero.
    .not('cerrado_at', 'is', null)
    .lte('cerrado_at', limite.toISOString())
    .not('nombre', 'like', 'Anonimizado%')
    .order('cerrado_at')
    .limit(500);

  const ids = (casos ?? []).map((c) => c.id);
  let contactos = 0;

  if (ids.length > 0) {
    const { data: vinculos } = await cliente
      .from('lead_contactos')
      .select('contacto_id, lead_id')
      .in('lead_id', ids);

    const candidatos = new Set((vinculos ?? []).map((v) => v.contacto_id));

    if (candidatos.size > 0) {
      // Los que además participan en algún caso que NO se anonimiza quedan fuera.
      const { data: otros } = await cliente
        .from('lead_contactos')
        .select('contacto_id, lead_id')
        .in('contacto_id', Array.from(candidatos));

      const conCasoVivo = new Set(
        (otros ?? []).filter((o) => !ids.includes(o.lead_id)).map((o) => o.contacto_id),
      );
      contactos = Array.from(candidatos).filter((c) => !conCasoVivo.has(c)).length;
    }
  }

  return {
    meses,
    casos: (casos ?? []).map((c) => ({
      id: c.id,
      nombre: c.nombre,
      estado: c.estado,
      cerrado: (c.cerrado_at as string).slice(0, 10),
    })),
    contactos,
  };
}

export type ResultadoAnonimizacion = {
  casos: number;
  contactos: number;
  actividades: number;
};

/**
 * Ejecuta la anonimización. Requiere la service role: toca filas de todos los
 * centros y tiene que poder hacerlo aunque quien la lanza no las vea todas.
 */
export async function anonimizar(
  admin: Cliente,
  meses: number,
  lanzadaPor: string | null,
): Promise<ResultadoAnonimizacion> {
  const candidatos = await candidatosAnonimizacion(admin, meses);
  if (candidatos.casos.length === 0) return { casos: 0, contactos: 0, actividades: 0 };

  const ids = candidatos.casos.map((c) => c.id);

  // 1. Los casos. Se conserva lo que hace falta para las métricas —centro,
  //    canal, estado, motivo de pérdida, fechas— y se va lo que identifica.
  for (const id of ids) {
    await admin
      .from('leads')
      .update({
        nombre: 'Anonimizado (retención RGPD)',
        telefono: telefonoAnonimo(),
        nombre_afectado: null,
        relacion_con_afectado: null,
        prescriptor_nombre: null,
        zona: null,
      })
      .eq('id', id);
  }

  // 2. El historial. El contenido de una nota puede llevar nombres, apellidos
  //    y la situación entera de una familia: se sustituye, pero la fila se
  //    queda para que el rastro de que hubo actividad no desaparezca.
  const { data: actividades } = await admin
    .from('actividades')
    .update({ contenido: 'Contenido anonimizado por retención' })
    .in('lead_id', ids)
    .select('id');

  // 3. Los contactos que solo participaban en estos casos.
  const { data: vinculos } = await admin
    .from('lead_contactos')
    .select('contacto_id, lead_id')
    .in('lead_id', ids);
  const candidatosContacto = new Set((vinculos ?? []).map((v) => v.contacto_id));

  let contactosAnonimizados = 0;
  if (candidatosContacto.size > 0) {
    const { data: otros } = await admin
      .from('lead_contactos')
      .select('contacto_id, lead_id')
      .in('contacto_id', Array.from(candidatosContacto));
    const conCasoVivo = new Set(
      (otros ?? []).filter((o) => !ids.includes(o.lead_id)).map((o) => o.contacto_id),
    );

    for (const contactoId of candidatosContacto) {
      if (conCasoVivo.has(contactoId)) continue;
      const { error } = await admin
        .from('contactos')
        .update({
          nombre: 'Anonimizado (retención RGPD)',
          telefono: telefonoAnonimo(),
          email: null,
          zona: null,
          notas: null,
          consentimiento_marketing: false,
        })
        .eq('id', contactoId);
      if (!error) contactosAnonimizados++;
    }
  }

  // 4. La auditoría. Es append-only y sobrevive a todo: aquí queda que se
  //    anonimizó, cuántas filas y con qué plazo, sin decir de quién eran.
  await admin.from('auditoria').insert({
    tabla: 'leads',
    accion: 'ANONIMIZACION',
    usuario_id: lanzadaPor,
    datos_nuevos: {
      meses,
      casos: ids.length,
      contactos: contactosAnonimizados,
      actividades: (actividades ?? []).length,
    },
  });

  return {
    casos: ids.length,
    contactos: contactosAnonimizados,
    actividades: (actividades ?? []).length,
  };
}
