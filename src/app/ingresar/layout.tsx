import type { Metadata } from "next";

/**
 * La página de /ingresar es un Client Component y esos no pueden exportar
 * `metadata`; por eso el noindex vive en este layout.
 *
 * Se marca noindex porque una pantalla de login no le sirve a nadie que
 * llegue desde una búsqueda: la persona busca a quién ayudar o un pedido
 * concreto, y caer en un formulario vacío es un resultado desperdiciado.
 * Queda rastreable a propósito (no bloqueada en robots.txt) para que el
 * buscador pueda LEER este noindex.
 */
export const metadata: Metadata = {
  title: "Ingresar",
  robots: { index: false, follow: true },
};

export default function IngresarLayout({ children }: LayoutProps<"/ingresar">) {
  return children;
}
