/**
 * Nacimiento del paciente: el único punto donde el área comercial toca el área
 * clínica, y lo hace en un solo sentido.
 *
 * Al validarse una conversión se crea la ficha de paciente con un TRASPASO
 * LIMPIO: pasan los datos básicos que hacen falta para empezar (nombre,
 * teléfono, centro, modalidad, adicción) y NO pasa nada del historial
 * comercial — ni presupuestos, ni notas de la negociación, ni por qué canal
 * llegó, ni cuánto se regateó. El terapeuta no necesita saber eso y la familia
 * no espera que lo sepa.
 *
 * El vínculo `lead_id` queda guardado, pero solo lo usan las métricas de
 * dirección (¿cuánto tarda un lead en convertirse en paciente?). Ninguna
 * consulta clínica lo sigue hacia atrás.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

type Cliente = SupabaseClient<Database>;

export type ResultadoAlta = {
  creado: boolean;
  pacienteId?: string;
  motivo?: string;
};

/**
 * Crea la ficha de paciente de un caso convertido. Idempotente: si ya existe
 * una ficha para ese caso, no hace nada — validar dos veces no puede duplicar
 * a una persona.
 */
export async function crearPacienteDesdeCaso(
  admin: Cliente,
  leadId: string,
  creadoPor: string | null,
): Promise<ResultadoAlta> {
  const { data: existente } = await admin
    .from('pacientes')
    .select('id')
    .eq('lead_id', leadId)
    .maybeSingle();
  if (existente) return { creado: false, pacienteId: existente.id, motivo: 'Ya tenía ficha.' };

  const { data: caso } = await admin
    .from('leads')
    .select('id, nombre, telefono, centro_id, adiccion_id, modalidad_interes_id, nombre_afectado')
    .eq('id', leadId)
    .maybeSingle();
  if (!caso) return { creado: false, motivo: 'Caso no encontrado.' };

  // La conversión puede haberse hecho sobre el centro de destino de una
  // derivación: la ficha nace donde se va a tratar, no donde entró el lead.
  const { data: conversion } = await admin
    .from('conversiones')
    .select('centro_id, modalidad_id')
    .eq('lead_id', leadId)
    .eq('estado', 'validada')
    .order('validada_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: primeraFase } = await admin
    .from('fases_metodo')
    .select('id')
    .eq('activa', true)
    .order('orden')
    .limit(1)
    .maybeSingle();

  /**
   * El caso es de una situación, no de una persona: si consta el nombre de la
   * persona afectada, es ESA la que empieza tratamiento, no quien llamó.
   */
  const nombrePaciente = caso.nombre_afectado?.trim() || caso.nombre;

  const { data: paciente, error } = await admin
    .from('pacientes')
    .insert({
      lead_id: caso.id,
      centro_id: conversion?.centro_id ?? caso.centro_id,
      nombre: nombrePaciente,
      // El teléfono solo viaja si es el de la persona afectada. Si quien
      // contactó fue un familiar, el número es suyo y no del paciente.
      telefono: caso.nombre_afectado ? null : caso.telefono,
      adiccion_id: caso.adiccion_id,
      modalidad_id: conversion?.modalidad_id ?? caso.modalidad_interes_id,
      fase_id: primeraFase?.id ?? null,
      // Sin terapeuta: lo asigna dirección. Una ficha sin referente aparece
      // destacada en la lista clínica, igual que un lead sin propietario.
      terapeuta_id: null,
      created_by: creadoPor,
    })
    .select('id')
    .single();

  if (error || !paciente) {
    return { creado: false, motivo: error?.message ?? 'No se pudo crear la ficha.' };
  }

  return { creado: true, pacienteId: paciente.id };
}
