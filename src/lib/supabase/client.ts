import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/database.types';
import { obligatoria } from './entorno';

export function createClient() {
  return createBrowserClient<Database>(
    obligatoria(process.env.NEXT_PUBLIC_SUPABASE_URL, 'NEXT_PUBLIC_SUPABASE_URL'),
    obligatoria(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  );
}
