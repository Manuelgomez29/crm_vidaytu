/**
 * Documentos para imprimir o guardar como PDF: la factura y el informe mensual.
 *
 * Viven fuera de `(app)` a propósito, para que no les toque el armazón: un menú
 * azul y una barra de búsqueda saldrían en el papel. La dirección no cambia
 * (`/facturacion/123/imprimir`, `/panel/informe`) y cada página comprueba la
 * sesión y el rol por su cuenta, como antes.
 */
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
