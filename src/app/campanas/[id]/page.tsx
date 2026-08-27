import { notFound, permanentRedirect } from "next/navigation";
import { getCampaignPathById } from "@/lib/campaigns";

/**
 * Ruta legacy. Antes de que existieran los handles, las campañas se
 * compartían como /campanas/<uuid> y esos links ya están dando vuelta —
 * romperlos sería perder tráfico que alguien mandó a pedir ayuda.
 *
 * Redirige con 308 permanente a la URL canónica /{handle}/{slug} para que
 * buscadores y clientes consoliden ahí.
 */
export default async function CampanaLegacyPage({
  params,
}: PageProps<"/campanas/[id]">) {
  const { id } = await params;
  const destino = await getCampaignPathById(id);

  if (!destino) {
    notFound();
  }

  permanentRedirect(`/${destino.handle}/${destino.slug}`);
}
