import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ejecutarAlertas } from '@/lib/alertas';

/**
 * Motor de alertas. Pensado para llamarse cada 15–30 minutos desde un cron
 * (Vercel Cron, GitHub Actions, cron-job.org…), protegido por secreto.
 *
 *   POST /api/tareas-programadas   con cabecera `x-cron-secret` o `?token=`
 *
 * Es idempotente: cada aviso lleva clave única, así que llamarlo de más no
 * duplica nada. Devuelve el recuento de lo que ha hecho.
 */
export async function POST(req: NextRequest) {
  const secretoEsperado = process.env.CRON_SECRET;
  const secreto = req.headers.get('x-cron-secret') ?? req.nextUrl.searchParams.get('token') ?? '';
  if (!secretoEsperado || secreto !== secretoEsperado) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const resultado = await ejecutarAlertas(createAdminClient());
    return NextResponse.json({ ok: true, ...resultado }, { status: 200 });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : 'Error desconocido';
    return NextResponse.json({ error: mensaje }, { status: 500 });
  }
}

// Algunos cron solo saben hacer GET.
export const GET = POST;
