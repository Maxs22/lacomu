import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente con la service role key — bypassa RLS por completo.
 *
 * SOLO usar en código server-side de confianza (Route Handlers, Server
 * Actions). Nunca importar esto en un Client Component ni exponer la key
 * al browser. Esto es lo único que puede leer/escribir mp_connections,
 * que no tiene ninguna policy de RLS a propósito.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
