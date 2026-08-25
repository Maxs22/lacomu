/**
 * Los embeds "to-one" de PostgREST (cuando la FK vive en la tabla que
 * estás consultando, ej. campaigns.owner_id -> profiles.id) devuelven un
 * OBJETO en runtime — verificado contra la base real. Pero sin tipos
 * generados (`supabase gen types` necesita Docker corriendo, no
 * disponible en este entorno, ver AGENTS.md) supabase-js tipa TODOS los
 * embeds como array sin poder distinguir la cardinalidad real.
 *
 * Este helper normaliza cualquiera de las dos formas, así no hace falta
 * acordarse la dirección de cada FK cada vez que se escribe un select con
 * embeds anidados — evita repetir el bug de "row.owner?.[0]" que rompía
 * en silencio cuando el embed en realidad ya era un objeto.
 */
export function unwrapOne<T>(value: T | T[] | null | undefined): T | null {
  if (value === null || value === undefined) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}
