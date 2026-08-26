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

        <div className="flex flex-col items-center gap-2 text-center sm:flex-row sm:justify-between sm:text-left">
          <p className="text-sm text-muted">
            Hecho por{" "}
            <a
              href="https://spigcow.com.ar"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-sm font-semibold text-foreground underline decoration-dotted underline-offset-4 hover:text-primary focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              spigcow
            </a>
          </p>
          <p className="max-w-md text-sm text-muted">
            lacomu no custodia fondos: van directo a cada persona. Se queda el{" "}
            {PLATFORM_FEE_LABEL} para sostener la plataforma.
          </p>
        </div>
      </div>
    </footer>
  );
}
