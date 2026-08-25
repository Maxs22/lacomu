import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Rate limit atómico contra la base, no en memoria: en Vercel cada
 * request puede caer en una instancia distinta, así que un Map en memoria
 * no limita nada real.
 *
 * Usa `bump_rate_limit` (INSERT ... ON CONFLICT DO UPDATE ... RETURNING),
 * que incrementa y devuelve el valor en una sola operación — no hay
 * ventana entre "contar" y "decidir" como sí la había en la versión que
 * contaba filas y después insertaba.
 *
 * Deliberadamente permisivo: donar NO requiere login (ver AGENTS.md), así
 * que el límite tiene que dejar pasar el uso normal (incluidos varios
 * donantes detrás de un mismo NAT) y solo frenar automatización obvia.
 */
const WINDOW_SECONDS = 60 * 60;
const MAX_PER_WINDOW = 20;

export async function checkDonationRateLimit(ip: string | null) {
  if (!ip) return { allowed: true as const };

  const admin = createAdminClient();

  // No hay cron en el MVP. Limpiamos una muestra pequeña de requests para
  // que las ventanas viejas no acumulen filas sin sumar infraestructura.
  if (Math.random() < 0.01) {
    await admin.rpc("prune_rate_limit_buckets");
  }

  const { data, error } = await admin.rpc("bump_rate_limit", {
    p_bucket_key: `donation:${ip}`,
    p_window_seconds: WINDOW_SECONDS,
    p_limit: MAX_PER_WINDOW,
  });

  // Si el rate limiter falla, dejamos pasar: preferimos no bloquear una
  // donación legítima por un problema nuestro de infraestructura.
  if (error) return { allowed: true as const };

  return { allowed: data !== false };
}

/** Extrae la IP del cliente de los headers que setea Vercel. */
export function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip");
}
