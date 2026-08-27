import { notFound, permanentRedirect } from "next/navigation";
import { getCampaignPathById } from "@/lib/campaigns";
import { queryStringFrom } from "@/lib/query";

/**
 * Ruta legacy. Antes de que existieran los handles, las campañas se
 * compartían como /campanas/<uuid> y esos links ya están dando vuelta —
 * romperlos sería perder tráfico que alguien mandó a pedir ayuda.
 *
 * Preserva los query params al redirigir. Las preferences de Mercado Pago
 * creadas ANTES de este cambio tienen back_urls apuntando acá con
 * ?ayuda=exito|pendiente|error; si el redirect los descartara, quien
 * termina de pagar volvería sin ver ningún aviso. (Las preferences nuevas
 * ya apuntan directo a la canónica, ver createPreference.)
 */
export default async function CampanaLegacyPage({
  params,
  searchParams,
}: PageProps<"/campanas/[id]">) {
  const { id } = await params;
  const query = await searchParams;
  const destino = await getCampaignPathById(id);

  if (!destino) {
    notFound();
  }

  permanentRedirect(
    `/${destino.handle}/${destino.slug}${queryStringFrom(query)}`,
  );
}
