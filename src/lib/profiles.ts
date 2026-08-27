import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { unwrapOne } from "@/lib/supabase/embed";
import type { Campaign } from "@/lib/campaigns";

export type PublicProfile = {
  id: string;
  handle: string;
  fullName: string | null;
  avatarUrl: string | null;
  mpConnected: boolean;
};

/** Determinístico a partir del id — solo para variar el placeholder sin foto. */
function toneFromId(id: string): "primary" | "secondary" {
  const sum = id.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return sum % 2 === 0 ? "primary" : "secondary";
}

/**
 * Si el handle fue retirado por un renombre, devuelve el handle actual de
 * esa persona para poder redirigir. Un handle retirado por borrado de
 * cuenta devuelve null: no hay a dónde mandar a nadie.
 *
 * Esto es lo que hace que renombrarse no rompa los links ya compartidos.
 */
export async function getCurrentHandleFor(
  retiredHandle: string,
): Promise<string | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("retired_handles")
    .select("profile:profiles!profile_id(handle)")
    .eq("handle", retiredHandle.toLowerCase())
    .maybeSingle();

  return unwrapOne(data?.profile)?.handle ?? null;
}

export async function getProfileByHandle(
  handle: string,
): Promise<PublicProfile | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, handle, full_name, avatar_url")
    .eq("handle", handle.toLowerCase())
    .maybeSingle();

  if (error || !data) return null;

  // mp_connections no tiene policies de RLS a propósito: solo el service
  // role la lee, y acá solo importa si existe la fila o no.
  const admin = createAdminClient();
  const { data: conn } = await admin
    .from("mp_connections")
    .select("profile_id")
    .eq("profile_id", data.id)
    .maybeSingle();

  return {
    id: data.id,
    handle: data.handle,
    fullName: data.full_name,
    avatarUrl: data.avatar_url,
    mpConnected: Boolean(conn),
  };
}

/** Campañas publicadas de una persona, para su página pública. */
export async function getCampaignsByProfile(profileId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("campaigns")
    .select(
      "id, slug, title, description, goal_amount, cover_image_url, items:campaign_items(description, amount), owner:profiles!owner_id(full_name, avatar_url, handle)",
    )
    .eq("owner_id", profileId)
    .eq("status", "published")
    .order("published_at", { ascending: false });

  if (error || !data) return [];

  const ids = data.map((r) => r.id);
  const { data: statsRows } = await supabase
    .from("campaign_stats")
    .select("campaign_id, raised_amount, contributors_count")
    .in("campaign_id", ids);

  const stats = new Map(
    (statsRows ?? []).map((s) => [
      s.campaign_id,
      { raised: Number(s.raised_amount), count: s.contributors_count },
    ]),
  );

  return data.map((row) => {
    const owner = unwrapOne(row.owner);
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      description: row.description,
      ownerName: owner?.full_name ?? "Alguien de la comunidad",
      ownerAvatarUrl: owner?.avatar_url ?? null,
      ownerHandle: owner?.handle ?? null,
      coverImageUrl: row.cover_image_url,
      goalAmount: Number(row.goal_amount ?? 0),
      currency: "ARS",
      tone: toneFromId(row.id),
      items: row.items ?? [],
      raisedAmount: stats.get(row.id)?.raised ?? 0,
      contributorsCount: stats.get(row.id)?.count ?? 0,
    } satisfies Campaign;
  });
}
