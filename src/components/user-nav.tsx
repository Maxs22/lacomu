"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const LINKS = [
  { href: "/mis-solicitudes", label: "Mis solicitudes" },
  { href: "/perfil", label: "Tu perfil" },
] as const;

/**
 * Navegación de la persona logueada.
 *
 * En mobile los tres ítems se apretaban entre sí, así que abajo de `sm`
 * pasa a un menú desplegable. La acción de cerrar sesión es una Server
 * Action que llega por prop: se puede pasar a un Client Component y sigue
 * ejecutándose en el servidor.
 */
export function UserNav({ signOut }: { signOut: () => Promise<void> }) {
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setAbierto(false);
    }
    function onPointerDown(e: PointerEvent) {
      // Cerrar al tocar afuera. Sin esto, en mobile el menú queda abierto
      // tapando contenido y no hay forma obvia de sacarlo.
      if (!contenedor.current?.contains(e.target as Node)) setAbierto(false);
    }

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [abierto]);

  const itemClase =
    "block w-full rounded-sm px-3 py-2.5 text-left text-base text-muted hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40";

  return (
    <div ref={contenedor} className="relative">
      {/* Mobile: botón hamburguesa */}
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-controls="menu-cuenta"
        aria-label={abierto ? "Cerrar menú" : "Abrir menú"}
        className="flex h-10 w-10 items-center justify-center rounded-sm border-2 border-border text-foreground hover:border-primary focus-visible:ring-2 focus-visible:ring-primary/40 sm:hidden"
      >
        {/* Dos estados del icono: hamburguesa y cruz */}
        <svg
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          {abierto ? (
            <>
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="18" y1="6" x2="6" y2="18" />
            </>
          ) : (
            <>
              <line x1="3" y1="7" x2="21" y2="7" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="17" x2="21" y2="17" />
            </>
          )}
        </svg>
      </button>

      {/* Mobile: panel desplegable */}
      {abierto ? (
        <nav
          id="menu-cuenta"
          aria-label="Tu cuenta"
          className="absolute right-0 top-12 z-20 w-56 rounded-sm border-2 border-border bg-background-card p-2 shadow-[3px_3px_0_0_var(--color-foreground)] sm:hidden"
        >
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setAbierto(false)}
              className={itemClase}
            >
              {l.label}
            </Link>
          ))}
          <form action={signOut}>
            <button type="submit" className={itemClase}>
              Cerrar sesión
            </button>
          </form>
        </nav>
      ) : null}

      {/* Desktop: los tres ítems en línea, como estaban */}
      <nav
        aria-label="Tu cuenta"
        className="hidden items-center gap-4 text-sm text-muted sm:flex"
      >
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="rounded-sm underline decoration-dotted underline-offset-4 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {l.label}
          </Link>
        ))}
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-sm underline decoration-dotted underline-offset-4 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            Cerrar sesión
          </button>
        </form>
      </nav>
    </div>
  );
}
