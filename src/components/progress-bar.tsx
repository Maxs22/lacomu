import { formatCurrency } from "@/lib/format";

export function ProgressBar({
  raised,
  goal,
  currency,
}: {
  raised: number;
  goal: number;
  currency: string;
}) {
  const pct = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="h-2 w-full overflow-hidden rounded-full bg-border/60">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-semibold text-foreground">
          {formatCurrency(raised, currency)}
        </span>
        <span className="text-muted">
          de {formatCurrency(goal, currency)}
        </span>
      </div>
    </div>
  );
}
