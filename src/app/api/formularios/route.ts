import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizarTelefono } from '@/lib/telefonos';

/**
 * Ingesta de formularios web (WordPress, Google Ads, landings Clientify…).
 *
 * POST /api/formularios  (cabecera `x-webhook-secret` o `?token=`)
 * Acepta JSON o form-data. Campos: nombre* y telefono*; opcionales: email,
 * mensaje, centro (slug), canal (slug), subcanal, adiccion (slug),
 * modalidad (slug), quien_contacta, urgencia, zona, utm_source, utm_medium,
 * utm_campaign, landing_url, origen_sistema, origen_ref (idempotencia).
 *
 * Reglas aplicadas:
 * - Sin centro válido → el lead nace en la bandeja de grupo.
 * - Teléfono ya conocido → NO se crea lead: se REABRE su último caso y vuelve
 *   a su propietario anterior (o al administrador general si está inactivo).
 * - (origen_sistema, origen_ref) repetido → respuesta idempotente, sin duplicar.
 * - Todo lead nuevo nace con una tarea "primera llamada" con vencimiento según
 *   el SLA configurado en la tabla `configuracion`.
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
  if (!secretoEsperado || secreto !== secretoEsperado) {
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

  // Catálogos (nada cableado: todo por slug contra la BD)
  const [{ data: centros }, { data: canales }, { data: config }] = await Promise.all([
    admin.from('centros').select('id, slug, es_bandeja_grupo').eq('activo', true),
    admin.from('canales').select('id, slug').eq('activo', true),
    admin.from('configuracion').select('clave, valor').eq('clave', 'sla_primera_respuesta_minutos'),
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
  const slaMinutos = Number(config?.[0]?.valor ?? 60);

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
  const { data: contactoExistente } = await admin
    .from('contactos')
    .select('id, nombre')
    .eq('telefono', telefono)
    .maybeSingle();

  if (contactoExistente) {
    const { data: vinculo } = await admin
      .from('lead_contactos')
      .select('lead_id, lead:leads (id, propietario_id, created_at)')
      .eq('contacto_id', contactoExistente.id);

    const casos = (vinculo ?? [])
      .map((v) => v.lead)
      .filter(Boolean)
      .sort((a, b) => (a!.created_at < b!.created_at ? 1 : -1));
    const ultimoCaso = casos[0];

    if (ultimoCaso) {
      // REAPERTURA: mismo caso, todo su historial.
      let propietarioId = ultimoCaso.propietario_id;
      if (propietarioId) {
        const { data: perfil } = await admin
          .from('perfiles')
          .select('activo')
          .eq('id', propietarioId)
          .maybeSingle();
        if (!perfil?.activo) propietarioId = null;
      }
      if (!propietarioId) {
        const { data: adminGeneral } = await admin
          .from('perfiles')
          .select('id')
          .eq('rol', 'direccion')
          .eq('activo', true)
          .order('created_at')
          .limit(1)
          .maybeSingle();
        propietarioId = adminGeneral?.id ?? null;
      }

      await admin
        .from('leads')
        .update({ estado: 'reabierto', motivo_perdida_id: null, propietario_id: propietarioId })
        .eq('id', ultimoCaso.id);

      await admin.from('actividades').insert([
        {
          lead_id: ultimoCaso.id,
          tipo: 'reapertura',
          contenido: `Reapertura automática: nuevo formulario del teléfono ${telefono}`,
        },
        ...(notaFormulario
          ? [{ lead_id: ultimoCaso.id, tipo: 'nota' as const, contenido: notaFormulario }]
          : []),
      ]);

      await admin.from('tareas').insert({
        lead_id: ultimoCaso.id,
        titulo: 'Contactar: caso reabierto por nuevo formulario',
        vence_at: new Date(Date.now() + slaMinutos * 60_000).toISOString(),
        responsable_id: propietarioId,
      });

      if (propietarioId) {
        await admin.from('notificaciones').insert({
          usuario_id: propietarioId,
          tipo: 'lead_asignado',
          lead_id: ultimoCaso.id,
          mensaje: `Caso reabierto: nuevo formulario de ${contactoExistente.nombre}`,
        });
      }

      return NextResponse.json({ accion: 'reabierto', lead_id: ultimoCaso.id }, { status: 200 });
    }
  }

  // Lead NUEVO
  const contactoId =
    contactoExistente?.id ??
    (
      await admin
        .from('contactos')
        .insert({
          nombre,
          telefono,
          email: (datos.email ?? '').trim() || null,
          zona: (datos.zona ?? '').trim() || null,
        })
        .select('id')
        .single()
    ).data?.id;
  if (!contactoId) {
    return NextResponse.json({ error: 'No se pudo crear el contacto' }, { status: 500 });
  }

  // Pipeline aplicable: el del centro si lo tiene; si no, el global más antiguo.
  const { data: pipelines } = await admin
    .from('pipelines')
    .select('id, centro_id, created_at')
    .eq('activo', true)
    .or(`centro_id.eq.${centro.id},centro_id.is.null`)
    .order('created_at');
  const pipeline = pipelines?.find((p) => p.centro_id === centro.id) ?? pipelines?.[0];
  if (!pipeline) {
    return NextResponse.json({ error: 'No hay pipeline activo' }, { status: 500 });
  }
  const { data: primeraEtapa } = await admin
    .from('pipeline_etapas')
    .select('id')
    .eq('pipeline_id', pipeline.id)
    .order('orden')
    .limit(1)
    .single();

  const [{ data: adicciones }, { data: modalidades }] = await Promise.all([
    admin.from('adicciones').select('id, slug').eq('activa', true),
    admin.from('modalidades').select('id, slug').eq('activa', true),
  ]);

  const quienContacta = QUIEN_CONTACTA.find((q) => q === (datos.quien_contacta ?? '').trim());
  const urgencia = URGENCIAS.find((u) => u === (datos.urgencia ?? '').trim());

  const { data: lead, error: errorLead } = await admin
    .from('leads')
    .insert({
      centro_id: centro.id,
      pipeline_id: pipeline.id,
      etapa_id: primeraEtapa!.id,
      nombre,
      telefono,
      quien_contacta: quienContacta ?? null,
      relacion_con_afectado: (datos.relacion_con_afectado ?? '').trim() || null,
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

  await admin.from('lead_contactos').insert({
    lead_id: lead.id,
    contacto_id: contactoId,
    tipo: quienContacta ?? 'otro',
    relacion: (datos.relacion_con_afectado ?? '').trim() || null,
    es_principal: true,
  });

  if (notaFormulario) {
    await admin.from('actividades').insert({ lead_id: lead.id, tipo: 'nota', contenido: notaFormulario });
  }

  await admin.from('tareas').insert({
    lead_id: lead.id,
    titulo: 'Primera llamada (intento 1 de la cadencia)',
    vence_at: new Date(Date.now() + slaMinutos * 60_000).toISOString(),
  });

  // Aviso a los usuarios de la bandeja de grupo si el lead nace allí.
  if (centro.es_bandeja_grupo) {
    const { data: usuariosBandeja } = await admin
      .from('perfil_centros')
      .select('perfil_id, perfil:perfiles (activo)')
      .eq('centro_id', centro.id);
    const avisos = (usuariosBandeja ?? [])
      .filter((u) => u.perfil?.activo)
      .map((u) => ({
        usuario_id: u.perfil_id,
        tipo: 'lead_nuevo_bandeja' as const,
        lead_id: lead.id,
        mensaje: `Nuevo lead en la bandeja de grupo: ${nombre}`,
      }));
    if (avisos.length > 0) await admin.from('notificaciones').insert(avisos);
  }

  return NextResponse.json({ accion: 'creado', lead_id: lead.id }, { status: 201 });
}
