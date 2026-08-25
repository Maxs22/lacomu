import Link from "next/link";
import { notFound } from "next/navigation";
import { getCampaignById } from "@/lib/campaigns";
import { formatCurrency } from "@/lib/format";
import { ProgressBar } from "@/components/progress-bar";
import { DonateForm } from "./donate-form";

export default async function CampaignDetailPage({
  params,
}: PageProps<"/campanas/[id]">) {
  const { id } = await params;
  const campaign = await getCampaignById(id);

  if (!campaign) {
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
              <p className="text-sm font-semibold uppercase tracking-[0.15em] text-muted">
                {campaign.ownerName}
              </p>
            </div>
          </div>

          <h1 className="-mt-4 font-display text-3xl leading-tight text-foreground sm:text-4xl">
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

          <p className="whitespace-pre-line text-lg leading-relaxed text-foreground">
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
