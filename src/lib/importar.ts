/**
 * Importación de contactos y casos históricos (Clientify, Zerochats, o
 * cualquier CSV que alguien exporte de otra herramienta).
 *
 * Principios:
 *
 * · DEDUPLICA POR TELÉFONO contra todo el sistema, igual que la ingesta de
 *   formularios. Importar dos veces el mismo fichero no crea nada nuevo.
 * · NO PISA lo que ya hay. Si el contacto existe, solo rellena los huecos:
 *   un email vacío se completa, uno distinto NO se sobrescribe. Lo que hay en
 *   la plataforma se ha ganado hablando con la persona; lo que viene en un CSV
 *   viejo puede estar desactualizado.
 * · EL CONSENTIMIENTO NO SE IMPORTA A LA LIGERA. Solo se marca si la columna
 *   lo dice explícitamente, y se registra con fecha y origen. Sin eso, entra
 *   como «sin consentimiento»: es preferible perder envíos a mandar correos a
 *   quien no los autorizó.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { normalizarTelefono } from '@/lib/telefonos';

type Cliente = SupabaseClient<Database>;

export type ResultadoImportacion = {
  filas: number;
  contactosCreados: number;
  contactosActualizados: number;
  omitidos: number;
  errores: string[];
};

/**
 * Lector de CSV que aguanta comillas, comas dentro de campos y saltos de
 * línea dentro de comillas. No se usa librería: es medio kilobyte de código y
 * evita una dependencia más que mantener.
 */
export function leerCsv(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let campo = '';
  let enComillas = false;

  // Quita el BOM que Excel pone al principio.
  const contenido = texto.replace(/^﻿/, '');

  for (let i = 0; i < contenido.length; i++) {
    const c = contenido[i];

    if (enComillas) {
      if (c === '"') {
        if (contenido[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          enComillas = false;
        }
      } else {
        campo += c;
      }
      continue;
    }

    if (c === '"') {
      enComillas = true;
    } else if (c === ',' || c === ';') {
      fila.push(campo);
      campo = '';
    } else if (c === '\n') {
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = '';
    } else if (c !== '\r') {
      campo += c;
    }
  }

  if (campo !== '' || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }

  return filas.filter((f) => f.some((v) => v.trim() !== ''));
}

function normalizarCabecera(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_');
}

/** Nombres de columna que aceptamos para cada campo. */
const ALIAS: Record<string, string[]> = {
  nombre: ['nombre', 'name', 'first_name', 'nombre_completo', 'full_name', 'contacto'],
  apellidos: ['apellidos', 'last_name', 'apellido'],
  telefono: ['telefono', 'phone', 'movil', 'mobile', 'telefono_movil', 'celular'],
  email: ['email', 'correo', 'correo_electronico', 'e_mail'],
  zona: ['zona', 'ciudad', 'city', 'poblacion', 'provincia'],
  notas: ['notas', 'notes', 'observaciones', 'comentarios'],
  consentimiento: ['consentimiento', 'consent', 'acepta_marketing', 'opt_in', 'marketing'],
};

function mapearColumnas(cabecera: string[]): Record<string, number> {
  const normalizadas = cabecera.map(normalizarCabecera);
  const mapa: Record<string, number> = {};
  for (const [campo, alias] of Object.entries(ALIAS)) {
    const indice = normalizadas.findIndex((c) => alias.includes(c));
    if (indice >= 0) mapa[campo] = indice;
  }
  return mapa;
}

/** ¿El valor de la columna de consentimiento dice que sí, sin ambigüedad? */
function esSi(valor: string | undefined): boolean {
  const v = (valor ?? '').trim().toLowerCase();
  return ['si', 'sí', 'yes', 'true', '1', 'x', 'acepta', 'suscrito'].includes(v);
}

export async function importarContactos(
  admin: Cliente,
  csv: string,
  opciones: { origen: string; etiquetaId?: string | null },
): Promise<ResultadoImportacion> {
  const filas = leerCsv(csv);
  const resultado: ResultadoImportacion = {
    filas: 0,
    contactosCreados: 0,
    contactosActualizados: 0,
    omitidos: 0,
    errores: [],
  };

  if (filas.length < 2) {
    resultado.errores.push('El fichero no tiene cabecera y al menos una fila de datos.');
    return resultado;
  }

  const columnas = mapearColumnas(filas[0]);
  if (columnas.telefono === undefined) {
    resultado.errores.push(
      'No encuentro la columna del teléfono. Debe llamarse «telefono», «movil», «phone» o similar.',
    );
    return resultado;
  }

  const cuerpo = filas.slice(1);
  resultado.filas = cuerpo.length;

  for (const [indice, fila] of cuerpo.entries()) {
    const linea = indice + 2; // +1 por la cabecera, +1 porque los humanos cuentan desde 1
    const dame = (campo: string) =>
      columnas[campo] !== undefined ? (fila[columnas[campo]] ?? '').trim() : '';

    const telefono = normalizarTelefono(dame('telefono'));
    if (!telefono) {
      resultado.omitidos++;
      if (resultado.errores.length < 15) {
        resultado.errores.push(`Línea ${linea}: teléfono vacío o no válido («${dame('telefono')}»).`);
      }
      continue;
    }

    const nombre = [dame('nombre'), dame('apellidos')].filter(Boolean).join(' ').trim();
    if (!nombre) {
      resultado.omitidos++;
      if (resultado.errores.length < 15) {
        resultado.errores.push(`Línea ${linea}: sin nombre.`);
      }
      continue;
    }

    const { data: existente } = await admin
      .from('contactos')
      .select('id, email, zona, notas, consentimiento_marketing')
      .eq('telefono', telefono)
      .maybeSingle();

    const consiente = columnas.consentimiento !== undefined && esSi(dame('consentimiento'));

    if (existente) {
      // Solo se rellenan huecos. Nunca se pisa un dato existente.
      const parche: Database['public']['Tables']['contactos']['Update'] = {};
      if (!existente.email && dame('email')) parche.email = dame('email');
      if (!existente.zona && dame('zona')) parche.zona = dame('zona');
      if (!existente.notas && dame('notas')) parche.notas = dame('notas');
      if (consiente && !existente.consentimiento_marketing) {
        parche.consentimiento_marketing = true;
        parche.consentimiento_marketing_at = new Date().toISOString();
        parche.consentimiento_marketing_origen = `importación ${opciones.origen}`;
      }

      if (Object.keys(parche).length > 0) {
        await admin.from('contactos').update(parche).eq('id', existente.id);
        resultado.contactosActualizados++;
      } else {
        resultado.omitidos++;
      }

      if (opciones.etiquetaId) {
        await admin
          .from('contacto_etiquetas')
          .upsert(
            { contacto_id: existente.id, etiqueta_id: opciones.etiquetaId },
            { onConflict: 'contacto_id,etiqueta_id', ignoreDuplicates: true },
          );
      }
      continue;
    }

    const { data: creado, error } = await admin
      .from('contactos')
      .insert({
        nombre,
        telefono,
        email: dame('email') || null,
        zona: dame('zona') || null,
        notas: dame('notas') || null,
        consentimiento_marketing: consiente,
        consentimiento_marketing_at: consiente ? new Date().toISOString() : null,
        consentimiento_marketing_origen: consiente ? `importación ${opciones.origen}` : null,
      })
      .select('id')
      .single();

    if (error || !creado) {
      resultado.omitidos++;
      if (resultado.errores.length < 15) {
        resultado.errores.push(`Línea ${linea}: ${error?.message ?? 'no se pudo crear'}.`);
      }
      continue;
    }

    resultado.contactosCreados++;

    if (opciones.etiquetaId) {
      await admin
        .from('contacto_etiquetas')
        .insert({ contacto_id: creado.id, etiqueta_id: opciones.etiquetaId });
    }
  }

  return resultado;
}
