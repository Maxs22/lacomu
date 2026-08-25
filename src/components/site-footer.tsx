export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border px-6 py-8 md:px-16">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-2 text-center sm:flex-row sm:justify-between sm:text-left">
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
        <p className="text-sm text-muted">
          lacomu no custodia fondos: las donaciones van directo a cada persona.
        </p>
      </div>
    </footer>
  );
}
