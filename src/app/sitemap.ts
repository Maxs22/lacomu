import type { MetadataRoute } from "next";
import { createPublicClient } from "@/lib/supabase/public";
import { unwrapOne } from "@/lib/supabase/embed";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://lacomu.ar";

/**
 * Se regenera cada hora. Un pedido de ayuda es urgente por definición:
 * esperar al próximo deploy para que Google se entere de que existe no
 * tiene sentido.
 */
export const revalidate = 3600;

/**
 * Las páginas estáticas del sitio. Las privadas (perfil, mis-solicitudes,
 * pedir-ayuda, ingresar) quedan afuera: declaran noindex.
 */
const ESTATICAS: { path: string; priority: number; changeFrequency: "daily" | "monthly" }[] = [
  { path: "/", priority: 1, changeFrequency: "daily" },
  { path: "/como-funciona", priority: 0.6, changeFrequency: "monthly" },
  { path: "/terminos", priority: 0.3, changeFrequency: "monthly" },
  { path: "/privacidad", priority: 0.3, changeFrequency: "monthly" },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base: MetadataRoute.Sitemap = ESTATICAS.map((p) => ({
    url: `${SITE_URL}${p.path}`,
    lastModified: new Date(),
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));

  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("campaigns")
    .select("slug, updated_at, owner:profiles!owner_id(handle)")
    .eq("status", "published")
    .order("published_at", { ascending: false })
    // Tope defensivo: un sitemap admite 50.000 URLs, pero si algún día se
    // pasa de ahí conviene partirlo en varios en vez de servir uno inválido.
    .limit(5000);

  if (error) {
    // Un sitemap incompleto es mucho mejor que un 500: Google reintenta,
    // y mientras tanto las páginas estáticas siguen siendo descubribles.
    console.error("sitemap: no se pudieron listar las campañas", error);
    return base;
  }

  const campanas: MetadataRoute.Sitemap = [];
  const perfiles = new Map<string, Date>();

  for (const fila of data ?? []) {
    const handle = unwrapOne(fila.owner)?.handle;
    if (!handle || !fila.slug) continue;

    const modificada = fila.updated_at ? new Date(fila.updated_at) : new Date();

    campanas.push({
      url: `${SITE_URL}/${handle}/${fila.slug}`,
      lastModified: modificada,
      changeFrequency: "daily",
      priority: 0.8,
    });

    // El perfil se lista una sola vez, con la fecha de su campaña más
    // reciente. Solo entran perfiles que tengan algo publicado: un perfil
    // vacío no le aporta nada a nadie que llegue desde una búsqueda.
    const previa = perfiles.get(handle);
    if (!previa || modificada > previa) perfiles.set(handle, modificada);
  }

  const listadoPerfiles: MetadataRoute.Sitemap = [...perfiles].map(
    ([handle, lastModified]) => ({
      url: `${SITE_URL}/${handle}`,
      lastModified,
      changeFrequency: "weekly",
      priority: 0.7,
    }),
  );

  return [...base, ...listadoPerfiles, ...campanas];
}
