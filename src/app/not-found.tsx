import Link from "next/link";
import type { Metadata } from "next";
import { LogoMark } from "@/components/logo-mark";

export const metadata: Metadata = {
  title: "No encontramos esta página",
};

/**
 * 404 de todo el sitio: cubre tanto rutas inexistentes como los
 * `notFound()` explícitos (handle que no existe, pedido dado de baja).
 *
 * Con el catch-all de handles en la raíz, el 404 más probable NO es un
 * error de navegación del sitio sino un handle mal tipeado o un pedido que
 * ya no está. Por eso el copy habla de eso en concreto en vez de decir
 * "página no encontrada" y dejar a la persona sin saber qué hacer.
 */
export default function NotFound() {
  return (
    <div className="relative z-[1] flex flex-1 flex-col">
      <header className="px-6 py-6 md:px-16">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-sm focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <LogoMark className="h-6 w-auto" />
          <span className="font-display text-lg font-semibold tracking-tight text-foreground">
            lacomu<span className="text-primary">.</span>
          </span>
        </Link>
      </header>

      <main className="flex flex-1 items-center px-6 pb-24 md:px-16">
        <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
          <p className="font-display text-6xl italic leading-none text-primary">
            404
          </p>

          <h1 className="font-display text-3xl leading-tight text-foreground sm:text-4xl">
            Acá no hay nada.
          </h1>

          <div className="flex flex-col gap-3 text-lg leading-relaxed text-muted">
            <p>
              Puede que el link esté mal escrito, o que quien pedía ayuda haya
              dado de baja su pedido.
            </p>
            <p>
              Si te lo compartió alguien, pedile que te lo vuelva a mandar —
              los links de lacomu son del tipo{" "}
              <span className="whitespace-nowrap text-foreground">
                lacomu.ar/sunombre
              </span>
              .
            </p>
          </div>

          <div className="flex flex-col gap-3 pt-2 sm:flex-row">
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 rounded-sm bg-primary px-6 py-3.5 text-sm font-semibold uppercase tracking-wider text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_var(--color-foreground)] focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2"
            >
              Ver quién necesita ayuda →
            </Link>
            <Link
              href="/como-funciona"
              className="inline-flex items-center justify-center rounded-sm border-2 border-border px-6 py-3.5 text-sm font-semibold uppercase tracking-wider text-muted transition-colors hover:border-primary hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              Cómo funciona
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
