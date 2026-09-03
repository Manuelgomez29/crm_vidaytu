'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { exigirAccesoEconomico } from './guard';

function volver(ruta: string, aviso?: { error?: string; aviso?: string }): never {
  const q = aviso?.error
    ? `?error=${encodeURIComponent(aviso.error)}`
    : aviso?.aviso
      ? `?aviso=${encodeURIComponent(aviso.aviso)}`
      : '';
  revalidatePath(ruta);
  redirect(`${ruta}${q}`);
}

/** Recalcula base, IVA y total de una factura a partir de sus líneas. */
async function recalcular(
  supabase: Awaited<ReturnType<typeof exigirAccesoEconomico>>['supabase'],
  facturaId: string,
) {
  const [{ data: lineas }, { data: factura }] = await Promise.all([
    supabase.from('factura_lineas').select('cantidad, precio_unitario').eq('factura_id', facturaId),
    supabase.from('facturas').select('iva_porcentaje').eq('id', facturaId).maybeSingle(),
  ]);

  const base = (lineas ?? []).reduce(
    (suma, l) => suma + Number(l.cantidad) * Number(l.precio_unitario),
    0,
  );
  const iva = Number(factura?.iva_porcentaje ?? 0);
  const total = base * (1 + iva / 100);

  await supabase
    .from('facturas')
    .update({ base_imponible: Number(base.toFixed(2)), total: Number(total.toFixed(2)) })
    .eq('id', facturaId);
}

// ---------------------------------------------------------------------------
// Facturas
// ---------------------------------------------------------------------------

/**
 * Crea una factura. Puede nacer de un presupuesto aceptado —lo normal, para
 * que nunca se facture algo que el comercial no propuso— o en blanco.
 */
export async function crearFactura(formData: FormData) {
  const { supabase, perfil } = await exigirAccesoEconomico();

  const presupuestoId = String(formData.get('presupuesto') ?? '') || null;
  let centroId = String(formData.get('centro') ?? '') || null;
  let clienteNombre = String(formData.get('cliente') ?? '').trim();
  let leadId: string | null = null;
  let concepto = 'Servicio';
  let importe = 0;

  if (presupuestoId) {
    const { data: presupuesto } = await supabase
      .from('presupuestos')
      .select(
        'id, importe, descripcion, lead_id, lead:leads (nombre, centro_id), modalidad:modalidades (nombre)',
      )
      .eq('id', presupuestoId)
      .maybeSingle();

    if (!presupuesto) volver('/facturacion', { error: 'Presupuesto no encontrado.' });

    leadId = presupuesto.lead_id;
    centroId = centroId ?? presupuesto.lead?.centro_id ?? null;
    clienteNombre = clienteNombre || (presupuesto.lead?.nombre ?? '');
    concepto = presupuesto.descripcion || presupuesto.modalidad?.nombre || 'Servicio';
    importe = Number(presupuesto.importe ?? 0);
  }

  if (!centroId) volver('/facturacion', { error: 'Elige el centro que factura.' });
  if (!clienteNombre) volver('/facturacion', { error: 'Falta el nombre del cliente.' });

  const { data: ivaConfig } = await supabase
    .from('configuracion')
    .select('valor')
    .eq('clave', 'iva_porcentaje')
    .maybeSingle();

  const { data: factura, error } = await supabase
    .from('facturas')
    .insert({
      centro_id: centroId,
      lead_id: leadId,
      presupuesto_id: presupuestoId,
      cliente_nombre: clienteNombre,
      iva_porcentaje: Number(ivaConfig?.valor ?? 0),
      created_by: perfil.id,
    })
    .select('id')
    .single();

  if (error || !factura) volver('/facturacion', { error: `No se pudo crear: ${error?.message}` });

  if (importe > 0) {
    await supabase.from('factura_lineas').insert({
      factura_id: factura.id,
      concepto,
      cantidad: 1,
      precio_unitario: importe,
    });
    await recalcular(supabase, factura.id);
  }

  redirect(`/facturacion/${factura.id}`);
}

export async function guardarFactura(id: string, formData: FormData) {
  const { supabase } = await exigirAccesoEconomico();
  const ruta = `/facturacion/${id}`;

  const { data: factura } = await supabase
    .from('facturas')
    .select('estado')
    .eq('id', id)
    .maybeSingle();

  // Una factura emitida no se reescribe: se anula y se hace otra. Cambiar los
  // datos de una factura que ya salió es exactamente lo que la gestoría no
  // puede permitir.
  if (factura?.estado !== 'borrador') {
    volver(ruta, { error: 'Solo se puede editar una factura en borrador.' });
  }

  const { error } = await supabase
    .from('facturas')
    .update({
      cliente_nombre: String(formData.get('cliente') ?? '').trim(),
      cliente_nif: String(formData.get('nif') ?? '').trim() || null,
      cliente_direccion: String(formData.get('direccion') ?? '').trim() || null,
      cliente_email: String(formData.get('email') ?? '').trim() || null,
      fecha: String(formData.get('fecha') ?? '') || undefined,
      iva_porcentaje: Number(formData.get('iva') ?? 0),
      notas: String(formData.get('notas') ?? '').trim() || null,
    })
    .eq('id', id);

  if (error) volver(ruta, { error: `No se pudo guardar: ${error.message}` });
  await recalcular(supabase, id);
  volver(ruta, { aviso: 'Factura actualizada.' });
}

export async function anadirLinea(facturaId: string, formData: FormData) {
  const { supabase } = await exigirAccesoEconomico();
  const ruta = `/facturacion/${facturaId}`;

  const concepto = String(formData.get('concepto') ?? '').trim();
  const cantidad = Number(formData.get('cantidad') ?? 1);
  const precio = Number(formData.get('precio') ?? 0);

  if (!concepto) volver(ruta, { error: 'La línea necesita un concepto.' });
  if (!(cantidad > 0)) volver(ruta, { error: 'La cantidad debe ser mayor que cero.' });

  const { count } = await supabase
    .from('factura_lineas')
    .select('id', { count: 'exact', head: true })
    .eq('factura_id', facturaId);

  const { error } = await supabase.from('factura_lineas').insert({
    factura_id: facturaId,
    concepto,
    cantidad,
    precio_unitario: precio,
    orden: (count ?? 0) + 1,
  });

  if (error) volver(ruta, { error: `No se pudo añadir: ${error.message}` });
  await recalcular(supabase, facturaId);
  volver(ruta);
}

export async function borrarLinea(facturaId: string, lineaId: string) {
  const { supabase } = await exigirAccesoEconomico();
  await supabase.from('factura_lineas').delete().eq('id', lineaId);
  await recalcular(supabase, facturaId);
  volver(`/facturacion/${facturaId}`);
}

/**
 * Emitir: asigna número de la serie del centro y del año. Es el punto de no
 * retorno, y por eso el número se consume aquí y no al crear el borrador: una
 * serie con huecos es un problema con la gestoría.
 */
export async function emitirFactura(id: string) {
  const { supabase } = await exigirAccesoEconomico();
  const ruta = `/facturacion/${id}`;

  const { data: factura } = await supabase
    .from('facturas')
    .select('estado, centro_id, fecha, numero, total')
    .eq('id', id)
    .maybeSingle();
  if (!factura) volver(ruta, { error: 'Factura no encontrada.' });
  if (factura.estado !== 'borrador') volver(ruta, { error: 'Esta factura ya está emitida.' });
  if (Number(factura.total) <= 0) {
    volver(ruta, { error: 'Añade al menos una línea con importe antes de emitir.' });
  }

  const ano = Number(factura.fecha.slice(0, 4));
  const { data: numero, error: errorNumero } = await supabase.rpc('siguiente_numero_factura', {
    p_centro: factura.centro_id,
    p_ano: ano,
  });
  if (errorNumero || !numero) {
    volver(ruta, { error: `No se pudo numerar: ${errorNumero?.message}` });
  }

  const { error } = await supabase
    .from('facturas')
    .update({ numero, estado: 'emitida' })
    .eq('id', id);
  if (error) volver(ruta, { error: `No se pudo emitir: ${error.message}` });

  volver(ruta, { aviso: `Factura emitida con el número ${numero}.` });
}

export async function anularFactura(id: string) {
  const { supabase } = await exigirAccesoEconomico();
  // Se anula, no se borra: el número queda consumido y visible, que es
  // justo lo que se espera de una serie de facturación.
  const { error } = await supabase.from('facturas').update({ estado: 'anulada' }).eq('id', id);
  if (error) volver(`/facturacion/${id}`, { error: `No se pudo anular: ${error.message}` });
  volver(`/facturacion/${id}`, { aviso: 'Factura anulada. El número se conserva.' });
}

// ---------------------------------------------------------------------------
// Cobros
// ---------------------------------------------------------------------------

export async function registrarCobro(formData: FormData) {
  const { supabase, perfil } = await exigirAccesoEconomico();
  const ruta = '/facturacion/cobros';

  const importe = Number(formData.get('importe') ?? 0);
  if (!(importe > 0)) volver(ruta, { error: 'El importe debe ser mayor que cero.' });

  const facturaId = String(formData.get('factura') ?? '') || null;
  let centroId = String(formData.get('centro') ?? '') || null;
  let leadId: string | null = null;

  if (facturaId) {
    const { data: factura } = await supabase
      .from('facturas')
      .select('centro_id, lead_id')
      .eq('id', facturaId)
      .maybeSingle();
    if (factura) {
      centroId = factura.centro_id;
      leadId = factura.lead_id;
    }
  }

  if (!centroId) volver(ruta, { error: 'Indica a qué centro entra el cobro.' });

  const { error } = await supabase.from('cobros').insert({
    factura_id: facturaId,
    lead_id: leadId,
    centro_id: centroId,
    fecha: String(formData.get('fecha') ?? '') || undefined,
    importe,
    metodo: String(formData.get('metodo') ?? 'transferencia') as
      | 'transferencia'
      | 'tarjeta'
      | 'efectivo'
      | 'domiciliacion'
      | 'otro',
    es_primer_pago: formData.get('primer_pago') === 'on',
    notas: String(formData.get('notas') ?? '').trim() || null,
    registrado_por: perfil.id,
  });

  if (error) volver(ruta, { error: `No se pudo registrar: ${error.message}` });

  // Si la factura queda cubierta, pasa a cobrada sola.
  if (facturaId) {
    const [{ data: cobros }, { data: factura }] = await Promise.all([
      supabase.from('cobros').select('importe').eq('factura_id', facturaId),
      supabase.from('facturas').select('total, estado').eq('id', facturaId).maybeSingle(),
    ]);
    const cobrado = (cobros ?? []).reduce((s, c) => s + Number(c.importe), 0);
    if (factura && factura.estado === 'emitida' && cobrado >= Number(factura.total)) {
      await supabase.from('facturas').update({ estado: 'cobrada' }).eq('id', facturaId);
    }
  }

  volver(ruta, { aviso: 'Cobro registrado.' });
}

export async function borrarCobro(id: string) {
  const { supabase } = await exigirAccesoEconomico();
  const { error } = await supabase.from('cobros').delete().eq('id', id);
  if (error) volver('/facturacion/cobros', { error: `No se pudo borrar: ${error.message}` });
  volver('/facturacion/cobros', { aviso: 'Cobro borrado.' });
}
