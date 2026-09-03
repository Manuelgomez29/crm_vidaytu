import type { Metadata } from 'next';
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
