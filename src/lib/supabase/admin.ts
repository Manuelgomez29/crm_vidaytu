import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { obligatoria } from './entorno';

/**
 * Cliente con la SERVICE ROLE: salta RLS. SOLO para código de servidor
 * (rutas API, ingesta, scripts). Jamás importar desde componentes cliente.
 */
export function createAdminClient() {
  return createClient<Database>(
    obligatoria(process.env.NEXT_PUBLIC_SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL'),
    obligatoria(process.env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
