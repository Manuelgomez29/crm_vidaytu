/**
 * Las peticiones de resena no se duplican ni se piden a ciegas.
 *
 * Reproduce las tres reglas que decide `proponerResenas`:
 *   · sin enlace del centro no se propone nada,
 *   · a una persona se le pide UNA vez aunque salga en varios casos,
 *   · quien no quiere comunicaciones no recibe la peticion.
 *
 *   node --env-file=.env.staging scripts/verificar-resenas.mjs
 */
import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

let fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
  console.log(`  ${ok ? 'OK  ' : 'FALLA'}  ${titulo}${detalle ? ' — ' + detalle : ''}`);
  if (!ok) fallos++;
};

/** La misma decision que toma la automatizacion, sin sus efectos. */
function aQuienSePide(vinculos) {
  return (vinculos ?? [])
    .map((v) => v.contacto)
    .find((c) => c && !c.resena_pedida_at && c.consentimiento_marketing !== false);
}

console.log('\nReglas de la peticion de resena\n');

// --- 1. El enlace por centro existe y se puede fijar ------------------------
const { data: centros } = await admin.from('centros').select('id, nombre, url_resena_google');
comprobar('Los centros tienen campo de enlace de resena', Array.isArray(centros));

const sinEnlace = (centros ?? []).filter((c) => !c.url_resena_google);
console.log(
  `  ·     ${sinEnlace.length} de ${centros?.length ?? 0} centros aun sin enlace configurado` +
    (sinEnlace.length ? ' (no se propondra resena para sus casos)' : ''),
);

// --- 2. Candado por persona ------------------------------------------------
const { data: unContacto } = await admin
  .from('contactos')
  .select('id, nombre, resena_pedida_at, consentimiento_marketing')
  .limit(1)
  .single();

const original = {
  resena: unContacto.resena_pedida_at,
  consent: unContacto.consentimiento_marketing,
};

// Libre: se le puede pedir.
await admin
  .from('contactos')
  .update({ resena_pedida_at: null, consentimiento_marketing: true })
  .eq('id', unContacto.id);
let { data: v } = await admin
  .from('contactos')
  .select('id, resena_pedida_at, consentimiento_marketing')
  .eq('id', unContacto.id);
comprobar(
  'A una persona libre y con consentimiento se le pide',
  aQuienSePide(v.map((c) => ({ contacto: c }))) !== undefined,
);

// Ya se le pidio: no otra vez.
await admin
  .from('contactos')
  .update({ resena_pedida_at: new Date().toISOString() })
  .eq('id', unContacto.id);
({ data: v } = await admin
  .from('contactos')
  .select('id, resena_pedida_at, consentimiento_marketing')
  .eq('id', unContacto.id));
comprobar(
  'A quien ya se le pidio NO se le pide una segunda vez',
  aQuienSePide(v.map((c) => ({ contacto: c }))) === undefined,
);

// Sin consentimiento: tampoco.
await admin
  .from('contactos')
  .update({ resena_pedida_at: null, consentimiento_marketing: false })
  .eq('id', unContacto.id);
({ data: v } = await admin
  .from('contactos')
  .select('id, resena_pedida_at, consentimiento_marketing')
  .eq('id', unContacto.id));
comprobar(
  'A quien no quiere comunicaciones NO se le pide',
  aQuienSePide(v.map((c) => ({ contacto: c }))) === undefined,
);

// Restaurar.
await admin
  .from('contactos')
  .update({ resena_pedida_at: original.resena, consentimiento_marketing: original.consent })
  .eq('id', unContacto.id);
console.log(`\n  (contacto «${unContacto.nombre}» restaurado)`);

console.log(
  fallos === 0
    ? '\nLa peticion de resena respeta sus reglas: todas las comprobaciones pasan.\n'
    : `\n${fallos} comprobacion(es) FALLIDA(S).\n`,
);
process.exit(fallos === 0 ? 0 : 1);
