import type { Metadata, Viewport } from 'next';
import { Kumbh_Sans } from 'next/font/google';
import { createClient } from '@/lib/supabase/server';
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

/**
 * El tema se decide en el servidor y viaja en la clase del `<html>`.
 *
 * Podría leerse en el navegador tras cargar, pero entonces cada navegación
 * empezaría en claro y saltaría a oscuro: el destello blanco que el modo oscuro
 * viene precisamente a evitar. Resolverlo aquí cuesta una consulta y lo elimina.
 */
async function temaDelPerfil(): Promise<'claro' | 'oscuro' | 'sistema'> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return 'sistema';

    const { data } = await supabase.from('perfiles').select('tema').eq('id', user.id).maybeSingle();
    return data?.tema ?? 'sistema';
  } catch {
    // Sin sesión, o con la base caída, el sistema operativo decide.
    return 'sistema';
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const tema = await temaDelPerfil();

  return (
    <html lang="es" className={`tema-${tema}`}>
      <body className={`${kumbh.variable} font-sans antialiased`}>{children}</body>
    </html>
  );
}
