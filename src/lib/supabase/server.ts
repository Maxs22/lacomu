import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Cliente de Supabase para Server Components, Server Actions y Route Handlers.
 * Usa la anon key — queda sujeto a las políticas de RLS. La sesión se resuelve
 * a partir de las cookies del request.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Se ignora si setAll se llama desde un Server Component sin
            // capacidad de escribir cookies — el middleware de sesión se
            // encarga de refrescarlas cuando corresponda.
          }
        },
      },
    },
  );
}
