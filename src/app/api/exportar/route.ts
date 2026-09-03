import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Exportación a CSV. SOLO dirección (regla 11) y cada descarga queda auditada
 * con quién, qué y cuándo. Los datos salen de la sesión de quien exporta, así
 * que RLS sigue aplicando.
 */

type Exportable = 'leads' | 'contactos' | 'conversiones' | 'citas';

/** Escapa un valor para CSV: comillas dobladas y campo entrecomillado. */
function celda(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  const texto = typeof valor === 'object' ? JSON.stringify(valor) : String(valor);
  return `"${texto.replace(/"/g, '""')}"`;
}

function aCsv(filas: Record<string, unknown>[]): string {
  if (filas.length === 0) return '';
  const columnas = Object.keys(filas[0]);
  const cabecera = columnas.map(celda).join(';');
  const cuerpo = filas.map((f) => columnas.map((c) => celda(f[c])).join(';'));
  // Punto y coma y BOM: es lo que espera Excel en español.
  return `﻿${[cabecera, ...cuerpo].join('\r\n')}`;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data: perfil } = await supabase
    .from('perfiles')
    .select('rol')
    .eq('id', user.id)
    .maybeSingle();
  if (perfil?.rol !== 'direccion') {
    return NextResponse.json({ error: 'Solo dirección puede exportar' }, { status: 403 });
  }

  const que = (req.nextUrl.searchParams.get('que') ?? 'leads') as Exportable;
  const desde = req.nextUrl.searchParams.get('desde');
  const hasta = req.nextUrl.searchParams.get('hasta');

  let filas: Record<string, unknown>[] = [];

  if (que === 'leads') {
    let consulta = supabase
      .from('leads')
      .select(
        `nombre, telefono, estado, urgencia, zona, subcanal, created_at, primera_respuesta_at,
         utm_source, utm_medium, utm_campaign,
         centro:centros (nombre), canal:canales (nombre), adiccion:adicciones (nombre),
         modalidad:modalidades!leads_modalidad_interes_id_fkey (nombre),
         propietario:perfiles!leads_propietario_id_fkey (nombre),
         motivo:motivos_perdida (nombre)`,
      )
      .order('created_at', { ascending: false });
    if (desde) consulta = consulta.gte('created_at', desde);
    if (hasta) consulta = consulta.lte('created_at', hasta);

    const { data } = await consulta;
    filas = (data ?? []).map((l) => ({
      nombre: l.nombre,
      telefono: l.telefono,
      centro: l.centro?.nombre,
      estado: l.estado,
      propietario: l.propietario?.nombre,
      canal: l.canal?.nombre,
      subcanal: l.subcanal,
      adiccion: l.adiccion?.nombre,
      modalidad: l.modalidad?.nombre,
      urgencia: l.urgencia,
      zona: l.zona,
      motivo_perdida: l.motivo?.nombre,
      creado: l.created_at,
      primera_respuesta: l.primera_respuesta_at,
      utm_source: l.utm_source,
      utm_medium: l.utm_medium,
      utm_campaign: l.utm_campaign,
    }));
  } else if (que === 'contactos') {
    const { data } = await supabase
      .from('contactos')
      .select(
        'nombre, telefono, email, zona, consentimiento_marketing, consentimiento_marketing_at, consentimiento_marketing_origen, created_at',
      )
      .order('nombre');
    filas = (data ?? []) as Record<string, unknown>[];
  } else if (que === 'conversiones') {
    let consulta = supabase
      .from('conversiones')
      .select(
        `fecha_inicio, importe_primer_pago, estado, validada_at, created_at,
         centro:centros (nombre), modalidad:modalidades (nombre), lead:leads (nombre, telefono)`,
      )
      .order('created_at', { ascending: false });
    if (desde) consulta = consulta.gte('created_at', desde);
    if (hasta) consulta = consulta.lte('created_at', hasta);

    const { data } = await consulta;
    filas = (data ?? []).map((c) => ({
      caso: c.lead?.nombre,
      telefono: c.lead?.telefono,
      centro: c.centro?.nombre,
      modalidad: c.modalidad?.nombre,
      importe_primer_pago: c.importe_primer_pago,
      estado: c.estado,
      fecha_inicio: c.fecha_inicio,
      registrada: c.created_at,
      validada: c.validada_at,
    }));
  } else if (que === 'citas') {
    let consulta = supabase
      .from('citas')
      .select(
        `inicio, fin, tipo, modalidad_cita, estado,
         centro:centros (nombre), profesional:perfiles (nombre), lead:leads (nombre, telefono)`,
      )
      .order('inicio', { ascending: false });
    if (desde) consulta = consulta.gte('inicio', desde);
    if (hasta) consulta = consulta.lte('inicio', hasta);

    const { data } = await consulta;
    filas = (data ?? []).map((c) => ({
      caso: c.lead?.nombre,
      telefono: c.lead?.telefono,
      centro: c.centro?.nombre,
      profesional: c.profesional?.nombre,
      tipo: c.tipo,
      modalidad: c.modalidad_cita,
      estado: c.estado,
      inicio: c.inicio,
      fin: c.fin,
    }));
  } else {
    return NextResponse.json({ error: 'No sé exportar eso' }, { status: 400 });
  }

  // La auditoría es append-only y sus triggers no cubren las lecturas: la
  // exportación se registra a mano con la service role.
  await createAdminClient()
    .from('auditoria')
    .insert({
      tabla: que,
      accion: 'EXPORTACION',
      usuario_id: user.id,
      datos_nuevos: { filas: filas.length, desde, hasta },
    });

  const fecha = new Date().toISOString().slice(0, 10);
  return new NextResponse(aCsv(filas), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="vidaytu-${que}-${fecha}.csv"`,
    },
  });
}
