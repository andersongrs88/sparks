import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client para uso em rotas API (server-side).
 * Usa SERVICE_ROLE para bypass de RLS.
 */
export function getServerSupabase() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase server-side não configurado. Defina SUPABASE_URL (ou NEXT_PUBLIC_SUPABASE_URL) e SUPABASE_SERVICE_ROLE_KEY na Vercel."
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}
