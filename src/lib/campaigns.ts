import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { unwrapOne } from "@/lib/supabase/embed";

export type CampaignItem = {
  description: string;
  amount: number | null;
};

export type Campaign = {
  id: string;
  title: string;
  description: string;
  ownerName: string;
  ownerAvatarUrl: string | null;
  coverImageUrl: string | null;
  goalAmount: number;
  raisedAmount: number;
  contributorsCount: number;
  currency: string;
  tone: "primary" | "secondary";
  items: CampaignItem[];
  /** Solo se completa en getCampaignById — el feed de tarjetas no lo necesita. */
  ownerMpConnected?: boolean;
};

/** Determinístico a partir del id — solo para variar el placeholder cuando no hay foto. */
function toneFromId(id: string): "primary" | "secondary" {
  const sum = id.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return sum % 2 === 0 ? "primary" : "secondary";
}

async function attachContributionStats<
  T extends { id: string; goalAmount: number },
>(rows: T[]) {
  if (rows.length === 0) return [] as (T & { raisedAmount: number; contributorsCount: number })[];

  const supabase = await createClient();
  const ids = rows.map((r) => r.id);

  const { data: contributions } = await supabase
    .from("public_contributions")
    .select("campaign_id, amount")
    .in("campaign_id", ids);

  const stats = new Map<string, { raised: number; count: number }>();
  for (const c of contributions ?? []) {
    const prev = stats.get(c.campaign_id) ?? { raised: 0, count: 0 };
    stats.set(c.campaign_id, {
      raised: prev.raised + Number(c.amount),
      count: prev.count + 1,
    });
  }

  return rows.map((r) => ({
    ...r,
    raisedAmount: stats.get(r.id)?.raised ?? 0,
    contributorsCount: stats.get(r.id)?.count ?? 0,
  }));
}

export async function getPublishedCampaigns(): Promise<Campaign[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("campaigns")
    .select(
      "id, title, description, goal_amount, cover_image_url, items:campaign_items(description, amount), owner:profiles!owner_id(full_name, avatar_url)",
    )
    .eq("status", "published")
    .order("published_at", { ascending: false });

  if (error || !data) return [];

  const base = data.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    ownerName: unwrapOne(row.owner)?.full_name ?? "Alguien de la comunidad",
    ownerAvatarUrl: unwrapOne(row.owner)?.avatar_url ?? null,
    coverImageUrl: row.cover_image_url,
    goalAmount: Number(row.goal_amount ?? 0),
    currency: "ARS",
    tone: toneFromId(row.id),
    items: row.items ?? [],
  }));

  return attachContributionStats(base);
}

export async function getCampaignById(id: string): Promise<Campaign | null> {
  const supabase = await createClient();

  const { data: row, error } = await supabase
    .from("campaigns")
    .select(
      "id, title, description, goal_amount, cover_image_url, owner_id, items:campaign_items(description, amount), owner:profiles!owner_id(full_name, avatar_url)",
    )
    .eq("id", id)
    .eq("status", "published")
    .single();

  if (error || !row) return null;

  // mp_connections no tiene RLS pública a propósito — solo el admin
  // client puede leerla, y acá solo nos importa si existe o no la fila.
  const admin = createAdminClient();
  const { data: connection } = await admin
    .from("mp_connections")
    .select("profile_id")
    .eq("profile_id", row.owner_id)
    .maybeSingle();

  const base = {
    id: row.id,
    title: row.title,
    description: row.description,
    ownerName: unwrapOne(row.owner)?.full_name ?? "Alguien de la comunidad",
    ownerAvatarUrl: unwrapOne(row.owner)?.avatar_url ?? null,
    coverImageUrl: row.cover_image_url,
    goalAmount: Number(row.goal_amount ?? 0),
    currency: "ARS",
    tone: toneFromId(row.id),
    items: row.items ?? [],
    ownerMpConnected: Boolean(connection),
  };

  const [withStats] = await attachContributionStats([base]);
  return withStats;
}
