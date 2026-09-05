/**
 * Generar, guardar y enviar el informe mensual en PDF.
 *
 * Junta tres piezas que ya existían por separado: el cálculo
 * (`informe-mensual.ts`), la maquetación (`pdf/informe.tsx`) y el envío
 * (`email.ts`). Aquí no se calcula ninguna cifra nueva.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { calcularInformeMensual, type InformeMensual } from '@/lib/informe-mensual';
import { emailConfigurado, enviarCorreo } from '@/lib/email';

type Cliente = SupabaseClient<Database>;

export const BUCKET = 'informes';

export type ResultadoInforme =
  | { ok: true; ruta: string; mes: string; informe: InformeMensual; enviado: boolean }
  | { ok: false; error: string };

/**
 * Previsión del mes entrante: presupuestos vivos por la probabilidad de su
 * etapa. Misma fórmula y mismos parámetros que la tarjeta del panel — salen de
 * `configuracion.prevision_probabilidad`, no de constantes.
 */
async function preverIngresos(admin: Cliente): Promise<number | null> {
  const [{ data: config }, { data: presupuestos }] = await Promise.all([
    admin.from('configuracion').select('valor').eq('clave', 'prevision_probabilidad').maybeSingle(),
    admin
      .from('presupuestos')
      .select('importe, estado, lead:leads (estado)')
      .eq('estado', 'propuesto'),
  ]);

  const probabilidades = (config?.valor ?? {}) as Record<string, number>;
  if (!presupuestos || presupuestos.length === 0) return null;

  let total = 0;
  for (const p of presupuestos) {
    const estadoLead = (p.lead as { estado: string } | null)?.estado;
    if (!estadoLead) continue;
    const prob = Number(probabilidades[estadoLead]);
    if (!Number.isFinite(prob)) continue;
    total += Number(p.importe) * (prob / 100);
  }
  return Math.round(total);
}

/**
 * Genera el PDF del mes indicado, lo guarda en el bucket privado y lo registra.
 *
 * Es idempotente por mes: volver a generarlo sobrescribe el fichero y actualiza
 * la fila. Así el botón «generar ahora» se puede pulsar dos veces sin acumular
 * ficheros ni filas.
 */
export async function generarInformeMensual(
  admin: Cliente,
  mes: string,
  opciones: { enviar: boolean; generadoPor?: string },
): Promise<ResultadoInforme> {
  try {
    const informe = await calcularInformeMensual(admin, mes);
    const prevision = await preverIngresos(admin);
    const generado = new Date().toLocaleDateString('es-ES', { timeZone: 'Europe/Madrid' });

    // La maquetación se carga aquí y no arriba: es pesada y solo hace falta al
    // generar, no cada vez que alguien importa este módulo.
    const { generarPdfInforme } = await import('@/lib/pdf/informe');
    const pdf = await generarPdfInforme(informe, prevision, generado);

    const ruta = `${mes}/informe-${mes}.pdf`;
    const { error: errorSubida } = await admin.storage
      .from(BUCKET)
      .upload(ruta, pdf, { contentType: 'application/pdf', upsert: true });

    if (errorSubida) return { ok: false, error: `No se pudo guardar: ${errorSubida.message}` };

    let enviado = false;
    if (opciones.enviar && emailConfigurado()) {
      const { data: direccion } = await admin
        .from('perfiles')
        .select('email')
        .eq('rol', 'direccion')
        .eq('activo', true);

      const destinatarios = (direccion ?? []).map((d) => d.email).filter(Boolean) as string[];
      if (destinatarios.length > 0) {
        const envio = await enviarCorreo({
          para: destinatarios,
          asunto: `Informe de ${informe.titulo} — Grupo Vidaitu`,
          cuerpo:
            `Adjunto el informe de ${informe.titulo}.\n\n` +
            `${informe.leads} casos nuevos · ${informe.conversiones} conversiones validadas.\n\n` +
            `El detalle completo va en el PDF. Los ingresos son de conversiones validadas por dirección.`,
          adjuntos: [{ nombre: `informe-${mes}.pdf`, contenido: pdf }],
        });
        enviado = envio.enviado;
      }
    }

    await admin.from('informes_mensuales').upsert(
      {
        mes: `${mes}-01`,
        ruta_fichero: ruta,
        resumen: {
          leads: informe.leads,
          conversiones: informe.conversiones,
          ingresos: informe.ingresos,
          ticketMedio: informe.ticketMedio,
        },
        generado_at: new Date().toISOString(),
        generado_por: opciones.generadoPor ?? null,
        enviado_at: enviado ? new Date().toISOString() : null,
      },
      { onConflict: 'mes' },
    );

    return { ok: true, ruta, mes, informe, enviado };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Error desconocido generando el PDF.' };
  }
}

/** Enlace firmado y temporal al PDF. Nunca se sirve el bucket en abierto. */
export async function enlaceInforme(admin: Cliente, ruta: string): Promise<string | null> {
  const { data } = await admin.storage.from(BUCKET).createSignedUrl(ruta, 300);
  return data?.signedUrl ?? null;
}
