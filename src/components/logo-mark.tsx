/**
 * Logo para usar DENTRO del sitio.
 *
 * `public/logo.svg` tiene fondo blanco (es el asset para compartir, redes,
 * fondos claros), pero acá eso se vería como un recuadro blanco sobre el
 * crema del sitio. Esta versión va inline y sin fondo, y pinta la
 * separación entre siluetas con `var(--background)`, así el contorno se
 * mimetiza con el fondo real de la página en vez de ser blanco fijo.
 *
 * Inline y no <img> a propósito: permite usar la variable CSS y evita un
 * request extra para algo que aparece en todas las pantallas.
 *
 * Dos variantes porque se verificó renderizando que CINCO siluetas se
 * empastan abajo de ~48px. Regla: `compact` (3 figuras) para header, nav
 * y cualquier uso chico; `full` (5) solo a partir de ~64px.
 */

type Figure = { x: number; scale: number; fill: string };

/** De afuera hacia adentro, para que la del centro quede encima. */
const FULL: Figure[] = [
  { x: 35, scale: 0.8, fill: "#4f6142" },
  { x: 145, scale: 0.8, fill: "#6b4530" },
  { x: 62, scale: 0.92, fill: "#c9803c" },
  { x: 118, scale: 0.92, fill: "#8fa05e" },
  { x: 90, scale: 1.05, fill: "#a83f21" },
];

const COMPACT: Figure[] = [
  { x: 48, scale: 0.86, fill: "#4f6142" },
  { x: 132, scale: 0.86, fill: "#c9803c" },
  { x: 90, scale: 1.05, fill: "#a83f21" },
];

const BODY = "M -19 0 C -19 -30 -12 -40 0 -40 C 12 -40 19 -30 19 0 Z";

export function LogoMark({
  className,
  variant = "compact",
}: {
  className?: string;
  variant?: "full" | "compact";
}) {
  const figures = variant === "full" ? FULL : COMPACT;
  // La versión compacta usa menos ancho: se recorta el viewBox para que no
  // arrastre aire a los costados.
  const viewBox = variant === "full" ? "0 0 180 112" : "18 0 144 112";

  return (
    <svg viewBox={viewBox} className={className} role="img" aria-label="lacomu">
      <g
        stroke="var(--background)"
        strokeWidth="7"
        strokeLinejoin="round"
        paintOrder="stroke"
      >
        {figures.map((f) => (
          <g
            key={`${f.x}-${f.fill}`}
            transform={`translate(${f.x} 92) scale(${f.scale})`}
            fill={f.fill}
          >
            <path d={BODY} />
            <circle cx="0" cy="-56" r="12" />
          </g>
        ))}
      </g>
    </svg>
  );
}
