import type { NextConfig } from 'next';

/**
 * Cabeceras de seguridad que NO dependen de la peticion.
 *
 * La CSP ya no esta aqui: necesita un nonce distinto en cada peticion y eso
 * solo puede darlo el middleware, asi que vive en `src/lib/csp.ts` y la pone
 * `src/middleware.ts`. Ponerla tambien aqui seria peor que no ponerla: el
 * navegador aplicaria LAS DOS y la mas floja seguiria permitiendo lo que la
 * otra prohibe entender.
 */
const esDesarrollo = process.env.NODE_ENV === 'development';

const CABECERAS = [
  // Doble cinturón junto a `frame-ancestors` de la CSP, para navegadores viejos.
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
  /*
   * Las fuentes del PDF no son codigo, asi que Next no las incluye sola en el
   * paquete de la funcion. Sin esto el informe sale en Helvetica en produccion
   * y en Kumbh Sans en local, que es la clase de diferencia que no se detecta
   * hasta que alguien abre el PDF del dia 1.
   */
  outputFileTracingIncludes: {
    '/**': ['./src/lib/pdf/fuentes/**'],
  },
  // No anunciar la versión del framework: es información gratis para quien
  // busca vulnerabilidades conocidas.
  poweredByHeader: false,

  async headers() {
    return [{ source: '/:path*', headers: CABECERAS }];
  },
};

export default nextConfig;
