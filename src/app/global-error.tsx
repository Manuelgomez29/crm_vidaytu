'use client';

/**
 * El último cortafuegos: cuando lo que falla es el propio armazón.
 *
 * `error.tsx` cubre las pantallas, pero si revienta el layout raíz —el que pinta
 * el `<html>`— ese no llega a montarse y Next enseña su pantalla en blanco con
 * «Application error». Esta la sustituye, y por eso tiene que traer su propio
 * `<html>` y `<body>`: en este punto no hay ninguno.
 *
 * Y por lo mismo no puede usar las clases del sistema de diseño ni la
 * tipografía: si ha fallado el layout, puede que la hoja de estilos tampoco
 * esté. Va todo en estilos en línea a propósito, para que se lea aunque no
 * cargue nada más.
 *
 * Lo único que no cabe en línea es el tema oscuro, que necesita una consulta de
 * medios. Va en un `<style>` suelto —sin depender de nada— porque quien tiene
 * el móvil en oscuro y se encuentra de golpe una pantalla blanca entera cree
 * que ha pasado algo peor de lo que ha pasado.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <head>
        <style>{`
          @media (prefers-color-scheme: dark) {
            body { background: #171A21 !important; color: #ECEBE7 !important; }
            .caja { background: #1F232C !important; border-color: #333844 !important; }
            .texto { color: #A7ACBA !important; }
          }
        `}</style>
      </head>
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#F7F6F2',
          color: '#242B3A',
          fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
          padding: '1rem',
        }}
      >
        <div
          className="caja"
          style={{
            maxWidth: '32rem',
            background: '#fff',
            border: '1px solid #E2DFD6',
            borderRadius: 12,
            padding: '1.5rem',
          }}
        >
          <h1 style={{ fontSize: 17, margin: '0 0 8px' }}>Vidaitu DATA no ha podido arrancar</h1>
          <p
            className="texto"
            style={{ fontSize: 14, lineHeight: 1.5, color: '#5A6272', margin: '0 0 16px' }}
          >
            Ha fallado algo de la propia aplicación, no de tus datos: lo que estuviera guardado
            sigue guardado. Vuelve a intentarlo, y si sigue igual avisa con el código de abajo.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              background: '#384B71',
              color: '#fff',
              border: 0,
              borderRadius: 8,
              padding: '9px 16px',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Intentar de nuevo
          </button>
          {error.digest && (
            <p className="texto" style={{ fontSize: 12, color: '#5A6272', marginTop: 16 }}>
              Código del error: <b style={{ fontFamily: 'monospace' }}>{error.digest}</b>
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
