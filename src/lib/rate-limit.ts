import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Rate limit contra la base, no en memoria: en Vercel cada request puede
 * caer en una instancia distinta, así que un Map en memoria no limita
 * nada real (esto ya mordió en otro proyecto — ver memoria de `late`).
 *
 * Cuenta cuántas contributions se crearon desde la misma IP en la ventana
 * y corta si se pasa. Deliberadamente permisivo: donar NO requiere login
 * (ver AGENTS.md), así que el límite tiene que dejar pasar el uso normal
 * (incluidos varios donantes detrás de un mismo NAT) y solo frenar
 * automatización obvia.
 */
export async function checkDonationRateLimit(ip: string | null) {
  if (!ip) return { allowed: true as const };

  const admin = createAdminClient();
  const windowStart = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  // La IP vive en una tabla aparte sin policies de RLS — solo el service
  // role la ve. No está en `contributions` a propósito: el dueño de la
  // campaña puede leer sus contributions enteras y no necesita ese dato
  // personal del donante.
  const { count, error } = await admin
    .from("contribution_client_ips")
    .select("contribution_id", { count: "exact", head: true })
    .eq("client_ip", ip)
    .gte("created_at", windowStart);

  // Si no podemos contar, dejamos pasar: preferimos no bloquear una
  // donación legítima por un problema nuestro de infraestructura.
  if (error) return { allowed: true as const };

  const MAX_PER_HOUR = 20;
  if ((count ?? 0) >= MAX_PER_HOUR) {
    return { allowed: false as const };
  }

  return { allowed: true as const };
}

/** Extrae la IP del cliente de los headers que setea Vercel. */
export function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip");
}
