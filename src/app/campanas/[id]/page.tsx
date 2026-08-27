import { notFound, permanentRedirect } from "next/navigation";
import { getCampaignPathById } from "@/lib/campaigns";

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

  const qs = new URLSearchParams();
  for (const [clave, valor] of Object.entries(query)) {
    if (typeof valor === "string") qs.set(clave, valor);
    else if (Array.isArray(valor)) valor.forEach((v) => qs.append(clave, v));
  }

  const sufijo = qs.size > 0 ? `?${qs}` : "";
  permanentRedirect(`/${destino.handle}/${destino.slug}${sufijo}`);
}
