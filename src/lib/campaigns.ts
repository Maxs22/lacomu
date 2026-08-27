import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { unwrapOne } from "@/lib/supabase/embed";

export type CampaignItem = {
  description: string;
  amount: number | null;
};

export type Campaign = {
  id: string;
  slug: string;
  title: string;
  description: string;
  ownerName: string;
  ownerAvatarUrl: string | null;
  ownerHandle: string | null;
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

  const { data: statsRows } = await supabase
    .from("campaign_stats")
    .select("campaign_id, raised_amount, contributors_count")
    .in("campaign_id", ids);

  const stats = new Map(
    (statsRows ?? []).map((stat) => [
      stat.campaign_id,
      {
        raised: Number(stat.raised_amount),
        count: stat.contributors_count,
      },
    ]),
  );

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
      "id, slug, title, description, goal_amount, cover_image_url, items:campaign_items(description, amount), owner:profiles!owner_id(full_name, avatar_url, handle)",
    )
    .eq("status", "published")
    .order("published_at", { ascending: false });

  if (error || !data) return [];

  const base = data.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    ownerName: unwrapOne(row.owner)?.full_name ?? "Alguien de la comunidad",
    ownerAvatarUrl: unwrapOne(row.owner)?.avatar_url ?? null,
    ownerHandle: unwrapOne(row.owner)?.handle ?? null,
    coverImageUrl: row.cover_image_url,
    goalAmount: Number(row.goal_amount ?? 0),
    currency: "ARS",
    tone: toneFromId(row.id),
    items: row.items ?? [],
  }));

  return attachContributionStats(base);
}

const DETAIL_SELECT =
  "id, slug, title, description, goal_amount, cover_image_url, owner_id, items:campaign_items(description, amount), owner:profiles!owner_id(full_name, avatar_url, handle)";

/**
 * La URL canónica de una campaña es /{handle}/{slug}. Se filtra por el
 * handle del dueño además del slug para que el link sea verificable: si
 * alguien arma /otra-persona/mi-pedido, no resuelve.
 */
export async function getCampaignByHandleAndSlug(
  handle: string,
  slug: string,
): Promise<Campaign | null> {
  const supabase = await createClient();

  const { data: perfil } = await supabase
    .from("profiles")
    .select("id")
    .eq("handle", handle.toLowerCase())
    .maybeSingle();

  if (!perfil) return null;

  const { data: row, error } = await supabase
    .from("campaigns")
    .select(DETAIL_SELECT)
    .eq("owner_id", perfil.id)
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (error || !row) return null;
  return hydrate(row);
}

/**
 * Solo para redirigir links viejos: /campanas/<uuid> se compartió antes de
 * que existieran los handles, así que tiene que seguir resolviendo.
 */
export async function getCampaignPathById(
  id: string,
): Promise<{ handle: string; slug: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("campaigns")
    .select("slug, owner:profiles!owner_id(handle)")
    .eq("id", id)
    .eq("status", "published")
    .maybeSingle();

  const handle = unwrapOne(data?.owner)?.handle;
  if (!data?.slug || !handle) return null;
  return { handle, slug: data.slug };
}

export async function getCampaignById(id: string): Promise<Campaign | null> {
  const supabase = await createClient();

  const { data: row, error } = await supabase
    .from("campaigns")
    .select(DETAIL_SELECT)
    .eq("id", id)
    .eq("status", "published")
    .single();

  if (error || !row) return null;
  return hydrate(row);
}

type OwnerEmbed = {
  full_name: string | null;
  avatar_url: string | null;
  handle: string | null;
};

type DetailRow = {
  id: string;
  slug: string;
  title: string;
  description: string;
  goal_amount: number | null;
  cover_image_url: string | null;
  owner_id: string;
  items: CampaignItem[] | null;
  owner: OwnerEmbed | OwnerEmbed[] | null;
};

/** Arma el objeto Campaign a partir de una fila del select de detalle. */
async function hydrate(row: DetailRow): Promise<Campaign> {
  // mp_connections no tiene policies de RLS a propósito — solo el service
  // role la lee, y acá solo importa si existe la fila o no.
  const admin = createAdminClient();
  const { data: connection } = await admin
    .from("mp_connections")
    .select("profile_id")
    .eq("profile_id", row.owner_id)
    .maybeSingle();

  const owner = unwrapOne(row.owner);

  const base = {
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
    ownerMpConnected: Boolean(connection),
  };

  const [withStats] = await attachContributionStats([base]);
  return withStats;
}
