/**
 * Con autopublicación (ver AGENTS.md) toda solicitud nace 'approved' y se
 * publica en el mismo insert. Los otros estados quedan en el schema como
 * deuda reservada para una eventual moderación posterior, pero hoy no se
 * producen — se mapean con copy honesto por si aparecen, sin inventar un
 * flujo de revisión que no existe.
 */
const STATUS_STYLES: Record<string, string> = {
  pending: "bg-warning/15 text-warning",
  approved: "bg-success/15 text-success",
  rejected: "bg-error/15 text-error",
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
        STATUS_STYLES[status] ?? "bg-warning/15 text-warning"
      }`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
