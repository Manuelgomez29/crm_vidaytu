import type { NextConfig } from 'next';

/**
 * Cabeceras de seguridad.
 *
 * Sin ellas el navegador no tiene ninguna instrucción sobre qué se le permite
 * hacer a esta aplicación, y aquí se manejan datos de salud: cuanto menos
 * dependa la seguridad de que nadie cometa un error en el código, mejor.
 *
 * La CSP es la pieza importante. Restringe de dónde puede cargarse cada tipo
 * de recurso, así que un XSS que se colara —una nota de un lead pintada sin
 * escapar, una plantilla de correo, un nombre con etiquetas— no podría enviar
 * los datos a ningún sitio ni cargar un script de fuera.
 *
 * `'unsafe-inline'` en los estilos es necesario para Tailwind y para los
 * estilos que Next inyecta; en scripts NO está, que es donde importa.
 * `'unsafe-eval'` solo en desarrollo, porque lo usa el recargado en caliente.
 */
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const esDesarrollo = process.env.NODE_ENV === 'development';

const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${esDesarrollo ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  // Las imágenes pueden venir del almacenamiento privado por URL firmada.
  `img-src 'self' data: blob: ${supabase}`,
  // A dónde puede hablar el navegador: la propia app y Supabase (REST,
  // almacenamiento y el websocket de tiempo real). Nada más.
  `connect-src 'self' ${supabase} ${supabase.replace('https://', 'wss://')}`,
  // Los adjuntos y documentos se abren por redirección al almacenamiento.
  `form-action 'self'`,
  // Nadie puede meter esta aplicación en un iframe: es lo que evita el
  // clickjacking sobre botones como «validar conversión» o «anonimizar».
  "frame-ancestors 'none'",
  // La vista previa de campañas usa un iframe con sandbox y srcDoc.
  "frame-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  ...(esDesarrollo ? [] : ['upgrade-insecure-requests']),
].join('; ');

const CABECERAS = [
  { key: 'Content-Security-Policy', value: CSP },
  // Doble cinturón junto a frame-ancestors, para navegadores viejos.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Que la URL de un caso no viaje al hacer clic en un enlace externo: lleva
  // el id del lead y acabaría en los registros de otro sitio.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // La aplicación no necesita ninguna de estas.
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  },
  // Un año de HTTPS obligatorio. Solo en producción: en local no hay TLS y
  // el navegador recordaría el dominio como solo-HTTPS para siempre.
  ...(esDesarrollo
    ? []
    : [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]),
];

const nextConfig: NextConfig = {
  // No anunciar la versión del framework: es información gratis para quien
  // busca vulnerabilidades conocidas.
  poweredByHeader: false,

  async headers() {
    return [{ source: '/:path*', headers: CABECERAS }];
  },
};

export default nextConfig;
