import type { Metadata, Viewport } from 'next';
import { Kumbh_Sans } from 'next/font/google';
import './globals.css';

// Kumbh Sans: la tipografía que ya comparten Eclipse y Bellamar.
const kumbh = Kumbh_Sans({
  variable: '--font-kumbh',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'Vida y Tu DATA',
  description: 'Plataforma de gestión del Grupo Vida y Tu',
  // Instalable en el móvil: media plantilla trabaja desde el teléfono.
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Vida y Tu', statusBarStyle: 'default' },
  icons: { icon: '/icono.svg', apple: '/icono.svg' },
};

export const viewport: Viewport = {
  themeColor: '#384B71',
  width: 'device-width',
  initialScale: 1,
  // Sin bloquear el zoom: hay gente que necesita ampliar para leer.
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${kumbh.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
