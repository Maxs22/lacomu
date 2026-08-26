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
            El asset es el chancho del logo de spigcow, recortado de su PNG
            (se descartan la telaraña y el bloque de texto: a este tamaño no
            se leen y solo agregan ruido).

            `mix-blend-mode: multiply` es necesario porque ese PNG NO tiene
            canal alpha — verificado leyendo su cabecera IHDR: color type 2,
            RGB sin alpha. O sea que trae el fondo blanco horneado y sobre el
            crema se vería como un recuadro. Con multiply, el blanco se
            multiplica por el fondo y desaparece.

            Esto asume un fondo CLARO. Si algún día el footer va sobre un
            fondo oscuro, hay que pedirle a spigcow un PNG con transparencia
            o un SVG (hoy su favicon.svg es el default de Vite, no su marca).
          */}
          <a
            href="https://spigcow.com.ar"
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex shrink-0 items-center gap-2 rounded-sm focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/spigcow.png"
              alt=""
              width={96}
              height={98}
              className="h-10 w-auto mix-blend-multiply"
            />
            <span className="text-sm text-muted">
              Hecho por{" "}
              <span className="font-semibold text-foreground group-hover:text-primary">
                spigcow
              </span>
            </span>
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
