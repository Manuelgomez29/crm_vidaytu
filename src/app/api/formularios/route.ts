import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizarTelefono } from '@/lib/telefonos';
import { secretoCoincide } from '@/lib/enlaces';
import { dentroDelLimite, ipDeLaPeticion } from '@/lib/limites';
import {
  anotarEnCasoAbierto,
  pipelineYPrimeraEtapa,
  reabrirCaso,
  slaMinutos,
  ultimoCasoPorTelefono,
  venceSegunSla,
} from '@/lib/casos';

/**
 * Ingesta de formularios web (WordPress, Google Ads, landings Clientify…).
 *
 * POST /api/formularios  (cabecera `x-webhook-secret` o `?token=`)
 * Acepta JSON o form-data. Campos: nombre* y telefono*; opcionales: email,
 * mensaje, centro (slug), canal (slug), subcanal, adiccion (slug),
 * modalidad (slug), quien_contacta, urgencia, zona, utm_source, utm_medium,
 * utm_campaign, landing_url, origen_sistema, origen_ref (idempotencia).
 *
 * Reglas (compartidas con el alta manual en src/lib/casos.ts):
 * - Sin centro válido → el lead nace en la bandeja de grupo.
 * - Teléfono con un caso CERRADO → se reabre aquel, con su propietario.
 * - Teléfono con un caso ABIERTO → no se toca su estado: se anota y se avisa.
 * - (origen_sistema, origen_ref) repetido → respuesta idempotente.
 * - Todo lead nuevo nace con una tarea de primera llamada según el SLA.
 */

type Payload = Record<string, string>;

const QUIEN_CONTACTA = ['familiar', 'afectado', 'prescriptor', 'otro'] as const;
const URGENCIAS = ['alta', 'media', 'baja'] as const;

async function leerPayload(req: NextRequest): Promise<Payload> {
  const tipo = req.headers.get('content-type') ?? '';
  const datos: Payload = {};
  if (tipo.includes('application/json')) {
    const json = (await req.json()) as Record<string, unknown>;
    for (const [clave, valor] of Object.entries(json)) {
      if (valor !== null && valor !== undefined) datos[clave] = String(valor);
    }
  } else {
    const form = await req.formData();
    for (const [clave, valor] of form.entries()) {
      if (typeof valor === 'string') datos[clave] = valor;
    }
  }
  return datos;
}

export async function POST(req: NextRequest) {
  const secretoEsperado = process.env.FORMULARIOS_WEBHOOK_SECRET;
  const secreto =
    req.headers.get('x-webhook-secret') ?? req.nextUrl.searchParams.get('token') ?? '';
  /**
   * El limite va ANTES de comprobar el secreto: si fuera despues, quien no lo
   * conoce podria seguir probando sin freno, que es justo a quien hay que
   * frenar.
   */
  if (!(await dentroDelLimite('formularios', ipDeLaPeticion(req.headers)))) {
    return NextResponse.json({ error: 'Demasiadas peticiones' }, { status: 429 });
  }

  // En tiempo constante: `!==` corta en el primer caracter distinto y filtra
  // cuantos acertaste.
  if (!secretoCoincide(secreto, secretoEsperado)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  let datos: Payload;
  try {
    datos = await leerPayload(req);
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la petición ilegible' }, { status: 400 });
  }

  const nombre = (datos.nombre ?? '').trim();
  const telefono = normalizarTelefono(datos.telefono ?? '');
  if (!nombre || !telefono) {
    return NextResponse.json(
      { error: 'nombre y telefono (válido) son obligatorios' },
      { status: 422 },
    );
  }

  const admin = createAdminClient();
  const origenSistema = (datos.origen_sistema ?? 'formulario_web').trim();
  const origenRef = (datos.origen_ref ?? '').trim() || null;

  // Idempotencia: el mismo envío no crea dos leads.
  if (origenRef) {
    const { data: repetido } = await admin
      .from('leads')
      .select('id')
      .eq('origen_sistema', origenSistema)
      .eq('origen_ref', origenRef)
      .maybeSingle();
    if (repetido) {
      return NextResponse.json({ accion: 'duplicado', lead_id: repetido.id }, { status: 200 });
    }
  }

  const mensaje = (datos.mensaje ?? '').trim();
  const notaFormulario = [
    'Formulario web recibido.',
    mensaje && `Mensaje: ${mensaje}`,
    datos.landing_url && `Página: ${datos.landing_url}`,
    datos.utm_campaign && `Campaña: ${datos.utm_campaign}`,
  ]
    .filter(Boolean)
    .join(' · ');

  // ¿Teléfono conocido? Deduplicación contra TODO el directorio.
  const caso = await ultimoCasoPorTelefono(admin, telefono);
  if (caso) {
    if (caso.cerrado) {
      await reabrirCaso(admin, {
        caso,
        motivo: `Reapertura automática: nuevo formulario del teléfono ${telefono}`,
        notaExtra: notaFormulario || null,
      });
      return NextResponse.json({ accion: 'reabierto', lead_id: caso.leadId }, { status: 200 });
    }
    // Caso abierto: NO se toca su estado ni su etapa; solo se anota y se avisa.
    await anotarEnCasoAbierto(admin, {
      caso,
      nota: notaFormulario || 'Nuevo formulario web recibido para este caso.',
    });
    return NextResponse.json({ accion: 'anotado', lead_id: caso.leadId }, { status: 200 });
  }

  // Catálogos (nada cableado: todo por slug contra la BD)
  const [{ data: centros }, { data: canales }, { data: adicciones }, { data: modalidades }] =
    await Promise.all([
      admin.from('centros').select('id, slug, es_bandeja_grupo').eq('activo', true),
      admin.from('canales').select('id, slug').eq('activo', true),
      admin.from('adicciones').select('id, slug').eq('activa', true),
      admin.from('modalidades').select('id, slug').eq('activa', true),
    ]);

  const centro =
    centros?.find((c) => c.slug === (datos.centro ?? '').trim()) ??
    centros?.find((c) => c.es_bandeja_grupo);
  const canal =
    canales?.find((c) => c.slug === (datos.canal ?? '').trim()) ??
    canales?.find((c) => c.slug === 'formulario_web');
  if (!centro || !canal) {
    return NextResponse.json({ error: 'Catálogos incompletos en la BD' }, { status: 500 });
  }

  const pipeline = await pipelineYPrimeraEtapa(admin, centro.id);
  if ('error' in pipeline) {
    return NextResponse.json({ error: pipeline.error }, { status: 500 });
  }

  const { data: contactoNuevo, error: errorContacto } = await admin
    .from('contactos')
    .insert({
      nombre,
      telefono,
      email: (datos.email ?? '').trim() || null,
      zona: (datos.zona ?? '').trim() || null,
    })
    .select('id')
    .single();
  if (errorContacto || !contactoNuevo) {
    return NextResponse.json(
      { error: `No se pudo crear el contacto: ${errorContacto?.message}` },
      { status: 500 },
    );
  }

  const quienContacta = QUIEN_CONTACTA.find((q) => q === (datos.quien_contacta ?? '').trim());
  const urgencia = URGENCIAS.find((u) => u === (datos.urgencia ?? '').trim());
  const relacion = (datos.relacion_con_afectado ?? '').trim() || null;

  const { data: lead, error: errorLead } = await admin
    .from('leads')
    .insert({
      centro_id: centro.id,
      pipeline_id: pipeline.pipelineId,
      etapa_id: pipeline.etapaId,
      nombre,
      telefono,
      quien_contacta: quienContacta ?? null,
      relacion_con_afectado: relacion,
      nombre_afectado: (datos.nombre_afectado ?? '').trim() || null,
      adiccion_id: adicciones?.find((a) => a.slug === (datos.adiccion ?? '').trim())?.id ?? null,
      modalidad_interes_id:
        modalidades?.find((m) => m.slug === (datos.modalidad ?? '').trim())?.id ?? null,
      urgencia: urgencia ?? null,
      zona: (datos.zona ?? '').trim() || null,
      canal_id: canal.id,
      subcanal: (datos.subcanal ?? '').trim() || null,
      estado: 'nuevo',
      utm_source: (datos.utm_source ?? '').trim() || null,
      utm_medium: (datos.utm_medium ?? '').trim() || null,
      utm_campaign: (datos.utm_campaign ?? '').trim() || null,
      landing_url: (datos.landing_url ?? '').trim() || null,
      origen_sistema: origenSistema,
      origen_ref: origenRef,
    })
    .select('id')
    .single();
  if (errorLead || !lead) {
    return NextResponse.json(
      { error: `No se pudo crear el lead: ${errorLead?.message}` },
      { status: 500 },
    );
  }

  const minutos = await slaMinutos(admin);
  const usuariosBandeja = centro.es_bandeja_grupo
    ? ((
        await admin
          .from('perfil_centros')
          .select('perfil_id, perfil:perfiles (activo)')
          .eq('centro_id', centro.id)
      ).data ?? []
      ).filter((u) => u.perfil?.activo)
    : [];

  await Promise.all([
    admin.from('lead_contactos').insert({
      lead_id: lead.id,
      contacto_id: contactoNuevo.id,
      tipo: quienContacta ?? 'otro',
      relacion,
      es_principal: true,
    }),
    admin.from('tareas').insert({
      lead_id: lead.id,
      titulo: 'Primera llamada (intento 1 de la cadencia)',
      vence_at: venceSegunSla(minutos),
    }),
    notaFormulario
      ? admin.from('actividades').insert({
          lead_id: lead.id,
          tipo: 'nota',
          contenido: notaFormulario,
        })
      : Promise.resolve(null),
    usuariosBandeja.length > 0
      ? admin.from('notificaciones').insert(
          usuariosBandeja.map((u) => ({
            usuario_id: u.perfil_id,
            tipo: 'lead_nuevo_bandeja' as const,
            lead_id: lead.id,
            mensaje: `Nuevo lead en la bandeja de grupo: ${nombre}`,
          })),
        )
      : Promise.resolve(null),
  ]);

  return NextResponse.json({ accion: 'creado', lead_id: lead.id }, { status: 201 });
}
