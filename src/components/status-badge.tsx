const STATUS_STYLES: Record<string, string> = {
  pending: "bg-border/60 text-muted",
  approved: "bg-secondary/15 text-secondary",
  rejected: "bg-primary/15 text-primary",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "En revisión",
  approved: "Publicada",
  rejected: "Rechazada",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex w-fit items-center rounded-sm px-2.5 py-1 text-xs font-semibold uppercase tracking-wider ${
        STATUS_STYLES[status] ?? "bg-border/60 text-muted"
      }`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
