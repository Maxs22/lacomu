import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente de lectura pública SIN cookies.
 *
 * El cliente de `server.ts` resuelve la sesión desde las cookies del
 * request, así que no sirve donde no hay request — como el sitemap, que
 * Next puede generar en build o revalidar en background.
 *
 * Usa la anon key, o sea que sigue sujeto a RLS: ve exactamente lo que ve
 * cualquier visitante sin sesión. Eso es justo lo que tiene que listar un
 * sitemap, y es la razón para no usar acá el cliente de service role.
 */
export function createPublicClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
