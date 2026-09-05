'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * Mantiene «Mi día» al día sin recargar a mano.
 *
 * Reutiliza el mismo mecanismo que el tablero (`postgres_changes` sobre las
 * tablas que se ven en pantalla) en vez de montar infraestructura aparte. El
 * canal lleva nombre propio para no pisar el del kanban cuando alguien tenga
 * las dos pantallas abiertas.
 *
 * RLS sigue aplicando a lo que se recarga: el aviso llega, pero cada uno vuelve
 * a leer solo lo suyo.
 */
export function RefrescoVivo() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const canal = supabase
      .channel('mi-dia')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () =>
        router.refresh(),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tareas' }, () =>
        router.refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [router]);

  return null;
}
