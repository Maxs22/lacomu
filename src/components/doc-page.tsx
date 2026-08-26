import Link from "next/link";

/**
 * Shell para las páginas de texto (términos, privacidad, cómo funciona).
 * Mismo header/ancho de lectura en todas para no repetir estructura.
 */
export function DocPage({
  title,
  updatedAt,
  children,
}: {
  title: string;
  updatedAt: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative z-[1] flex flex-1 flex-col">
      <header className="px-6 py-6 md:px-16">
        <Link
          href="/"
          className="inline-flex items-center gap-1 rounded-sm text-sm text-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          ← lacomu
        </Link>
      </header>

      <main className="px-6 pb-24 md:px-16">
        <article className="mx-auto flex w-full max-w-2xl flex-col gap-6">
          <div>
            <h1 className="font-display text-3xl leading-tight text-foreground sm:text-4xl">
              {title}
            </h1>
            <p className="mt-2 text-sm text-muted">
              Última actualización: {updatedAt}
            </p>
          </div>
          {children}
        </article>
      </main>
    </div>
  );
}

/** Sección con título, para mantener consistente el ritmo tipográfico. */
export function DocSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-xl text-foreground">{title}</h2>
      <div className="flex flex-col gap-3 text-base leading-relaxed text-muted">
        {children}
      </div>
    </section>
  );
}
