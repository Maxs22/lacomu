/**
 * Con autopublicación (ver AGENTS.md) toda solicitud nace 'approved' y se
 * publica en el mismo insert. Los otros estados quedan en el schema como
 * deuda reservada para una eventual moderación posterior, pero hoy no se
 * producen — se mapean con copy honesto por si aparecen, sin inventar un
 * flujo de revisión que no existe.
 */
const STATUS_STYLES: Record<string, string> = {
  pending: "bg-border/60 text-muted",
  approved: "bg-secondary/15 text-secondary",
  rejected: "bg-primary/15 text-primary",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Procesando",
  approved: "Publicada",
  rejected: "Dada de baja",
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
