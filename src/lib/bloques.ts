/**
 * Correos por bloques: del contenido estructurado al HTML y al texto.
 *
 * Quien redacta elige bloques —título, párrafo, botón, imagen, separador— y es
 * esta función la que decide cómo se ven. Así todos los correos del grupo
 * salen iguales entre sí y con la marca del centro, y nadie tiene que saber
 * HTML para mandar una guía.
 *
 * Es una función PURA y sin dependencias: la usan el servidor (para guardar lo
 * que se envía) y el navegador (para la vista previa mientras se edita), y las
 * dos tienen que pintar exactamente lo mismo.
 *
 * Lo que NO hace, a propósito:
 *   · No pone el pie de baja ni el píxel de apertura: eso lo añade `componer()`
 *     en el envío, para que ninguna campaña pueda salir sin ellos.
 *   · No sustituye {nombre}: también lo hace el envío, persona a persona.
 *   · No reescribe los enlaces para contar clics: ídem.
 *
 * HTML de correo, no de web: tablas, estilos en línea, 600 px de ancho y
 * fuentes del sistema. Los clientes de correo no entienden otra cosa.
 */

export type Bloque =
  | { tipo: 'titulo'; texto: string }
  | { tipo: 'parrafo'; texto: string }
  | { tipo: 'boton'; texto: string; url: string }
  | { tipo: 'imagen'; url: string; alt: string }
  | { tipo: 'separador' };

export type MarcaCorreo = {
  /** Nombre que firma: «Bellamar», «Eclipse», «Vidaitu». */
  nombre: string;
  /** Color principal del centro, para el botón y el título. */
  color: string;
};

export const MARCA_POR_DEFECTO: MarcaCorreo = { nombre: 'Vidaitu', color: '#384B71' };

export const TIPOS_BLOQUE = ['titulo', 'parrafo', 'boton', 'imagen', 'separador'] as const;

/**
 * La marca con la que firma un correo, a partir del centro de la campaña.
 * Los colores son los del sistema de diseño (chips y bordes por centro); el
 * nombre es el del centro tal como está en la base. Sin centro = el grupo.
 */
export function marcaDeCentro(centro: { slug?: string | null; nombre?: string | null } | null | undefined): MarcaCorreo {
  const colores: Record<string, string> = {
    horizonte: '#2E5C48',
    eclipse: '#4E506B',
    bellamar: '#384B71',
  };
  if (!centro?.slug) return MARCA_POR_DEFECTO;
  return { nombre: centro.nombre ?? MARCA_POR_DEFECTO.nombre, color: colores[centro.slug] ?? MARCA_POR_DEFECTO.color };
}

const MAX_BLOQUES = 40;
const MAX_TEXTO = 4000;

function escapar(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Solo https. Un enlace http en un correo de un centro de salud es, como poco,
 * un aviso del navegador al pulsarlo; y `javascript:` o una ruta suelta no
 * pueden entrar nunca. La prueba cazó que la primera versión dejaba pasar http.
 */
function urlSegura(u: string): string | null {
  const limpia = u.trim();
  if (!/^https:\/\//i.test(limpia)) return null;
  try {
    return new URL(limpia).toString();
  } catch {
    return null;
  }
}

/**
 * Comprueba lo que llega del editor y lo deja en una lista de bloques válida.
 * Devuelve el problema en texto si algo no vale: es lo que verá quien redacta.
 */
export function validarBloques(entrada: unknown): { bloques: Bloque[] } | { error: string } {
  if (!Array.isArray(entrada)) return { error: 'El contenido del correo no se ha podido leer.' };
  if (entrada.length === 0) return { error: 'El correo no tiene ningún bloque.' };
  if (entrada.length > MAX_BLOQUES) return { error: `Demasiados bloques (máximo ${MAX_BLOQUES}).` };

  const bloques: Bloque[] = [];
  for (const [i, b] of entrada.entries()) {
    const n = `Bloque ${i + 1}`;
    if (!b || typeof b !== 'object') return { error: `${n}: no es un bloque.` };
    const x = b as Record<string, unknown>;
    const texto = typeof x.texto === 'string' ? x.texto.trim() : '';
    if (texto.length > MAX_TEXTO) return { error: `${n}: el texto es demasiado largo.` };

    switch (x.tipo) {
      case 'titulo':
      case 'parrafo':
        if (!texto) return { error: `${n}: el ${x.tipo} está vacío.` };
        bloques.push({ tipo: x.tipo, texto });
        break;
      case 'boton': {
        const url = urlSegura(String(x.url ?? ''));
        if (!texto) return { error: `${n}: el botón necesita un texto.` };
        if (!url) return { error: `${n}: el botón necesita un enlace que empiece por https://.` };
        bloques.push({ tipo: 'boton', texto, url });
        break;
      }
      case 'imagen': {
        const url = urlSegura(String(x.url ?? ''));
        if (!url) return { error: `${n}: la imagen necesita una dirección que empiece por https://.` };
        bloques.push({ tipo: 'imagen', url, alt: typeof x.alt === 'string' ? x.alt.trim().slice(0, 200) : '' });
        break;
      }
      case 'separador':
        bloques.push({ tipo: 'separador' });
        break;
      default:
        return { error: `${n}: tipo desconocido.` };
    }
  }
  return { bloques };
}

/** Un párrafo puede llevar saltos de línea: en HTML son <br>. */
function parrafoHtml(texto: string): string {
  return escapar(texto).replaceAll('\n', '<br>');
}

/**
 * Genera el HTML del correo y su versión en texto plano.
 *
 * El texto plano no es un extra: es lo que leen los clientes sin HTML, los
 * lectores de pantalla y el filtro de términos clínicos. Tiene que decir lo
 * mismo que el HTML, botón incluido.
 */
export function renderizarBloques(
  bloques: Bloque[],
  marca: MarcaCorreo = MARCA_POR_DEFECTO,
): { html: string; texto: string } {
  const fuente = "font-family:'Kumbh Sans',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif";
  const color = /^#[0-9a-f]{6}$/i.test(marca.color) ? marca.color : MARCA_POR_DEFECTO.color;

  const partesHtml: string[] = [];
  const partesTexto: string[] = [];

  for (const b of bloques) {
    switch (b.tipo) {
      case 'titulo':
        partesHtml.push(
          `<h1 style="margin:0 0 16px;${fuente};font-size:24px;line-height:1.25;font-weight:700;color:${color}">${escapar(b.texto)}</h1>`,
        );
        partesTexto.push(b.texto.toUpperCase());
        break;
      case 'parrafo':
        partesHtml.push(
          `<p style="margin:0 0 16px;${fuente};font-size:16px;line-height:1.6;color:#242B3A">${parrafoHtml(b.texto)}</p>`,
        );
        partesTexto.push(b.texto);
        break;
      case 'boton':
        partesHtml.push(
          `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 20px"><tr><td style="border-radius:8px;background:${color}"><a href="${escapar(b.url)}" style="display:inline-block;padding:12px 22px;${fuente};font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px">${escapar(b.texto)}</a></td></tr></table>`,
        );
        partesTexto.push(`${b.texto}: ${b.url}`);
        break;
      case 'imagen':
        partesHtml.push(
          `<img src="${escapar(b.url)}" alt="${escapar(b.alt)}" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0;border-radius:8px;margin:0 0 16px">`,
        );
        if (b.alt) partesTexto.push(`[${b.alt}]`);
        break;
      case 'separador':
        partesHtml.push('<hr style="border:none;border-top:1px solid #E2DFD6;margin:20px 0">');
        partesTexto.push('—');
        break;
    }
  }

  const html = [
    '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title></title></head>',
    '<body style="margin:0;padding:0;background:#F7F6F2">',
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F7F6F2"><tr><td align="center" style="padding:24px 12px">',
    '<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:12px"><tr><td style="padding:32px 28px">',
    partesHtml.join(''),
    `<p style="margin:24px 0 0;${fuente};font-size:14px;line-height:1.5;color:#5A6272">${escapar(marca.nombre)}</p>`,
    '</td></tr></table>',
    '</td></tr></table></body></html>',
  ].join('');

  const texto = `${partesTexto.join('\n\n')}\n\n${marca.nombre}`;
  return { html, texto };
}
