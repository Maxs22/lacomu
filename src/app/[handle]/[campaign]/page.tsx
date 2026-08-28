import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { getCampaignByHandleAndSlug } from "@/lib/campaigns";
import { getCurrentHandleFor } from "@/lib/profiles";
import { queryStringFrom } from "@/lib/query";
import { formatCurrency } from "@/lib/format";
import { ProgressBar } from "@/components/progress-bar";
import { DonateForm } from "./donate-form";

/** Largo cómodo para el snippet de Google y la preview de WhatsApp. */
const RESUMEN_MAX = 155;

function resumir(texto: string) {
  const limpio = texto.replace(/\s+/g, " ").trim();
  if (limpio.length <= RESUMEN_MAX) return limpio;
  // Se corta en la última palabra entera: partir una palabra al medio se
  // ve peor que perder dos caracteres.
  const recortado = limpio.slice(0, RESUMEN_MAX);
  const ultimoEspacio = recortado.lastIndexOf(" ");
  return `${recortado.slice(0, ultimoEspacio > 80 ? ultimoEspacio : RESUMEN_MAX)}…`;
}

/**
 * Sin esto, cada pedido se compartía con el título y la descripción de la
 * home: en Google y en WhatsApp todos los pedidos se veían iguales, y quien
 * recibía el link no sabía de qué se trataba antes de abrirlo. Es la página
 * más compartida del sitio, así que era el peor lugar donde faltaba.
 */
export async function generateMetadata({
  params,
}: PageProps<"/[handle]/[campaign]">): Promise<Metadata> {
  const { handle, campaign: campaignSlug } = await params;
  const campaign = await getCampaignByHandleAndSlug(handle, campaignSlug);

  // El notFound() real lo hace la página; acá solo evitamos anunciar como
  // título bueno algo que va a terminar en 404.
  if (!campaign) return { title: "No encontrado", robots: { index: false } };

  const titulo = `${campaign.title} — ${campaign.ownerName}`;
  const descripcion = resumir(campaign.description);
  const canonical = `/${handle}/${campaignSlug}`;

  return {
    title: campaign.title,
    description: descripcion,
    alternates: { canonical },
    openGraph: {
      type: "article",
      title: titulo,
      description: descripcion,
      url: canonical,
      // La foto del pedido dice muchísimo más que el logo genérico. Si no
      // hay, se cae al og.jpg del layout.
      images: campaign.coverImageUrl
        ? [{ url: campaign.coverImageUrl, alt: campaign.title }]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: titulo,
      description: descripcion,
      images: campaign.coverImageUrl ? [campaign.coverImageUrl] : undefined,
    },
  };
}

export default async function CampaignDetailPage({
  params,
  searchParams,
}: PageProps<"/[handle]/[campaign]">) {
  const { handle, campaign: campaignSlug } = await params;
  const query = await searchParams;
  const returnedFromPayment = query.pago === "1";
  const campaign = await getCampaignByHandleAndSlug(handle, campaignSlug);

  if (!campaign) {
    // Mismo caso que en el perfil: el link puede apuntar a un handle que la
    // persona dejó al renombrarse.
    const actual = await getCurrentHandleFor(handle);
    if (actual && actual !== handle) {
      // Se preserva el query: si el donante vuelve de Mercado Pago con
      // ?ayuda=... justo cuando esta persona se renombró, descartarlo lo
      // dejaría sin saber si su pago se registró.
      permanentRedirect(`/${actual}/${campaignSlug}${queryStringFrom(query)}`);
    }
    notFound();
  }

  const toneClass = campaign.tone === "primary" ? "bg-primary" : "bg-secondary";

  return (
    <div className="relative z-[1] flex flex-1 flex-col">
      <header className="px-6 py-6 md:px-16">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
        >
          ← lacomu
        </Link>
      </header>

      <main className="px-6 pb-24 md:px-16">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
          {returnedFromPayment ? (
            <p role="status" className="rounded-sm bg-background-card px-4 py-3 text-sm text-muted">
              Volviste desde Mercado Pago. El estado final se confirma directamente con ellos.
            </p>
          ) : null}

          <div
            className={`h-48 overflow-hidden rounded-sm ${
              campaign.coverImageUrl
                ? ""
                : `flex items-center justify-center ${toneClass}`
            }`}
          >
            {campaign.coverImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={campaign.coverImageUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="font-display text-7xl italic text-primary-foreground/90">
                {campaign.ownerName.charAt(0)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {campaign.ownerAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={campaign.ownerAvatarUrl}
                alt=""
                className="h-9 w-9 rounded-full object-cover"
              />
            ) : null}
            <div>
              <p className="break-words text-sm font-semibold uppercase tracking-[0.15em] text-muted">
                {campaign.ownerName}
              </p>
            </div>
          </div>

          <h1 className="-mt-4 break-words font-display text-3xl leading-tight text-foreground sm:text-4xl">
            {campaign.title}
          </h1>

          <ProgressBar
            raised={campaign.raisedAmount}
            goal={campaign.goalAmount}
            currency={campaign.currency}
          />
          <p className="-mt-4 text-sm text-muted">
            {campaign.contributorsCount > 0
              ? `${campaign.contributorsCount} personas ya ayudaron`
              : "Todavía nadie ayudó — podés ser el primero."}
          </p>

          <p className="whitespace-pre-line break-words text-lg leading-relaxed text-foreground">
            {campaign.description}
          </p>

          {campaign.items.length > 0 ? (
            <div className="flex flex-col gap-3 rounded-sm border-2 border-border bg-background-card p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted">
                En qué se va a usar la plata
              </p>
              <ul className="flex flex-col gap-2">
                {campaign.items.map((item) => (
                  <li
                    key={item.description}
                    className="flex items-baseline justify-between gap-4 text-sm"
                  >
                    <span className="text-foreground">
                      {item.description}
                    </span>
                    {item.amount ? (
                      <span className="whitespace-nowrap font-semibold text-muted">
                        {formatCurrency(item.amount, campaign.currency)}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {campaign.ownerMpConnected ? (
            <DonateForm campaignId={campaign.id} />
          ) : (
            <div className="flex flex-col gap-3 pt-2">
              <button
                type="button"
                disabled
                className="inline-flex items-center justify-center gap-2 rounded-sm bg-primary px-7 py-4 text-sm font-semibold uppercase tracking-wider text-primary-foreground opacity-50 shadow-none"
              >
                Quiero ayudar
              </button>
              <p className="text-sm text-muted">
                Esta persona todavía no vinculó Mercado Pago — no se puede
                ayudar todavía.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
