import Link from "next/link";
import type { Campaign } from "@/lib/campaigns";
import { ProgressBar } from "@/components/progress-bar";

export function CampaignCard({ campaign }: { campaign: Campaign }) {
  const toneClass =
    campaign.tone === "primary" ? "bg-primary" : "bg-secondary";

  return (
    <Link
      href={`/campanas/${campaign.id}`}
      className="group flex flex-col overflow-hidden rounded-sm border-2 border-border bg-background-card transition-transform hover:-translate-y-0.5"
    >
      <div className={`h-32 ${campaign.coverImageUrl ? "" : `flex items-center justify-center ${toneClass}`}`}>
        {campaign.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={campaign.coverImageUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="font-display text-5xl italic text-primary-foreground/90">
            {campaign.ownerName.charAt(0)}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted">
            {campaign.ownerName}
          </p>
          <h3 className="mt-1 break-words font-display text-xl leading-snug text-foreground group-hover:text-primary">
            {campaign.title}
          </h3>
        </div>

        <p className="line-clamp-2 text-sm text-muted">
          {campaign.description}
        </p>

        <div className="mt-auto pt-2">
          <ProgressBar
            raised={campaign.raisedAmount}
            goal={campaign.goalAmount}
            currency={campaign.currency}
          />
        </div>
      </div>
    </Link>
  );
}
