import Link from "next/link";
import { PLATFORM_FEE_LABEL } from "@/lib/fees";

const LINKS = [
  { href: "/como-funciona", label: "Cómo funciona" },
  { href: "/terminos", label: "Términos" },
  { href: "/privacidad", label: "Privacidad" },
];

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border px-6 py-8 md:px-16">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <nav
          aria-label="Información"
          className="flex flex-wrap justify-center gap-x-5 gap-y-2 sm:justify-start"
        >
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-sm text-sm text-muted underline decoration-dotted underline-offset-4 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:justify-between sm:gap-6 sm:text-left">
          {/*
            El wordmark de spigcow, recortado de su asset original (2MB) a
            480x96 / 23KB. Este PNG SÍ tiene canal alpha (color type 6,
            verificado en su cabecera), así que se apoya sobre el crema sin
            necesitar trucos de blend.

            Se usa su logotipo en vez de escribir "spigcow" en la tipografía
            de lacomu: es la marca de otro, corresponde mostrarla como ellos
            la diseñaron. El alt lo nombra porque la imagen ES el contenido,
            no decoración.
          */}
          <a
            href="https://spigcow.com.ar"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-2.5 rounded-sm text-sm text-muted transition-opacity hover:opacity-70 focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <span>Hecho por</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/spigcow-wordmark.png"
              alt="spigcow"
              width={480}
              height={96}
              className="h-[18px] w-auto"
            />
          </a>
          <p className="max-w-md text-sm text-muted">
            lacomu no custodia fondos: van directo a cada persona. Se queda el{" "}
            {PLATFORM_FEE_LABEL} para sostener la plataforma.
          </p>
        </div>
      </div>
    </footer>
  );
}
