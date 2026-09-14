/**
 * Motor de etiquetado automático.
 *
 * Ejecuta las reglas que dirección y los comerciales definen en
 * Contactos → Etiquetas ("si canal = Instagram → Lolo Drago"). Recorre los
 * casos, mira qué contactos participan en ellos y les pone la etiqueta.
 *
 * Dos decisiones importantes:
 *
 * · La etiqueta se aplica al CONTACTO, no al caso, porque la persona es
 *   global (regla 5) y el email marketing segmenta personas.
 * · El motor solo AÑADE. Nunca retira una etiqueta que ya está puesta,
 *   aunque el caso deje de cumplir la condición: quien llegó una vez por
 *   Instagram llegó por Instagram, y borrarlo reescribiría la historia.
 *   Retirar una etiqueta es siempre una decisión humana.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import type { CampoRegla, CondicionRegla } from '@/lib/reglas';

type Cliente = SupabaseClient<Database>;

export type ResultadoEtiquetado = {
  reglas: number;
  etiquetasAplicadas: number;
};

/** Normaliza para comparar sin acentos, mayúsculas ni espacios sobrantes. */
function normalizar(valor: string | null | undefined): string {
  return (valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

type CasoParaReglas = {
  id: string;
  estado: string;
  centro_id: string;
  canal_id: string;
  modalidad_interes_id: string | null;
  motivo_perdida_id: string | null;
};

/** Valor del caso para el campo de una condición, ya normalizado. */
function valoresDelCaso(
  caso: CasoParaReglas,
  campo: CampoRegla,
  nombres: {
    canales: Map<string, string[]>;
    centros: Map<string, string[]>;
    modalidades: Map<string, string[]>;
    motivos: Map<string, string[]>;
  },
): string[] {
  switch (campo) {
    case 'estado':
      return [normalizar(caso.estado)];
    case 'canal':
      return nombres.canales.get(caso.canal_id) ?? [];
    case 'centro':
      return nombres.centros.get(caso.centro_id) ?? [];
    case 'modalidad':
      return caso.modalidad_interes_id
        ? (nombres.modalidades.get(caso.modalidad_interes_id) ?? [])
        : [];
    case 'motivo_perdida':
      return caso.motivo_perdida_id ? (nombres.motivos.get(caso.motivo_perdida_id) ?? []) : [];
    default:
      return [];
  }
}

export async function ejecutarEtiquetado(admin: Cliente): Promise<ResultadoEtiquetado> {
  const { data: reglas } = await admin
    .from('reglas_etiquetado')
    .select('id, condicion, etiqueta_id')
    .eq('activa', true);

  if (!reglas || reglas.length === 0) return { reglas: 0, etiquetasAplicadas: 0 };

  // Catálogos: cada id admite varios textos (nombre y slug), para que una
  // regla escrita como "Instagram" case igual que una escrita como "instagram".
  const [{ data: canales }, { data: centros }, { data: modalidades }, { data: motivos }] =
    await Promise.all([
      admin.from('canales').select('id, nombre, slug'),
      admin.from('centros').select('id, nombre, slug'),
      admin.from('modalidades').select('id, nombre, slug'),
      admin.from('motivos_perdida').select('id, nombre, slug'),
    ]);

  const indexar = (filas: { id: string; nombre: string; slug: string }[] | null) =>
    new Map((filas ?? []).map((f) => [f.id, [normalizar(f.nombre), normalizar(f.slug)]]));

  const nombres = {
    canales: indexar(canales),
    centros: indexar(centros),
    modalidades: indexar(modalidades),
    motivos: indexar(motivos),
  };

  const { data: casos } = await admin
    .from('leads')
    .select('id, estado, centro_id, canal_id, modalidad_interes_id, motivo_perdida_id');
  if (!casos || casos.length === 0) return { reglas: reglas.length, etiquetasAplicadas: 0 };

  // Contactos de cada caso, en una sola consulta.
  const { data: vinculos } = await admin
    .from('lead_contactos')
    .select('lead_id, contacto_id, tipo');
  const contactosPorCaso = new Map<string, { id: string; tipo: string }[]>();
  for (const v of vinculos ?? []) {
    const lista = contactosPorCaso.get(v.lead_id) ?? [];
    lista.push({ id: v.contacto_id, tipo: v.tipo });
    contactosPorCaso.set(v.lead_id, lista);
  }

  const aInsertar: {
    contacto_id: string;
    etiqueta_id: string;
    regla_id: string;
    aplicada_por: null;
  }[] = [];
  const yaVisto = new Set<string>();

  for (const regla of reglas) {
    const condicion = regla.condicion as unknown as CondicionRegla;
    if (!condicion?.campo || !condicion?.valor) continue;
    const buscado = normalizar(condicion.valor);

    /*
     * `tipo_contacto` no mira al caso sino a cada persona dentro de el, asi que
     * el filtro no puede aplicarse antes del bucle: en un caso donde estan la
     * madre y el hijo, la regla «afectado» tiene que coger al hijo y dejar a la
     * madre fuera. Los demas campos si son del caso y valen para todos sus
     * contactos por igual.
     */
    const porContacto = condicion.campo === 'tipo_contacto';

    for (const caso of casos as CasoParaReglas[]) {
      if (!porContacto && !valoresDelCaso(caso, condicion.campo, nombres).includes(buscado)) {
        continue;
      }

      for (const vinculo of contactosPorCaso.get(caso.id) ?? []) {
        if (porContacto && normalizar(vinculo.tipo) !== buscado) continue;

        const contactoId = vinculo.id;
        const clave = `${contactoId}:${regla.etiqueta_id}`;
        if (yaVisto.has(clave)) continue;
        yaVisto.add(clave);
        aInsertar.push({
          contacto_id: contactoId,
          etiqueta_id: regla.etiqueta_id,
          regla_id: regla.id,
          // null = aplicada por regla, no por una persona. Es lo que distingue
          // una etiqueta automática de una manual en la ficha del contacto.
          aplicada_por: null,
        });
      }
    }
  }

  if (aInsertar.length === 0) return { reglas: reglas.length, etiquetasAplicadas: 0 };

  // `unique (contacto_id, etiqueta_id)` hace el trabajo: lo que ya estaba se
  // ignora, así que el motor puede correr cada quince minutos sin duplicar.
  const { data: insertadas, error } = await admin
    .from('contacto_etiquetas')
    .upsert(aInsertar, { onConflict: 'contacto_id,etiqueta_id', ignoreDuplicates: true })
    .select('id');

  if (error) throw new Error(`Motor de etiquetado: ${error.message}`);

  return { reglas: reglas.length, etiquetasAplicadas: (insertadas ?? []).length };
}
