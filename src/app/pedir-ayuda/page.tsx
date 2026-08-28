import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PedirAyudaForm } from "./pedir-ayuda-form";


/**
 * Página privada: redirige a /ingresar sin sesión, así que lo único que
 * vería un buscador es un formulario vacío. Se marca noindex en vez de
 * bloquearla en robots.txt: si no se puede rastrear, tampoco se puede leer
 * este noindex, y la URL puede terminar indexada igual solo porque alguien
 * la enlazó.
 */
export const metadata: Metadata = {
  title: "Pedir ayuda",
  robots: { index: false, follow: false },
};

export default async function PedirAyudaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/ingresar");
  }

  return (
    <div className="relative z-[1] flex flex-1 flex-col">
      <header className="px-6 py-6 md:px-16">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
        >
          ← lacomu
        </Link>
      </header>

      <main className="px-6 pb-24 md:px-16">
        <div className="mx-auto w-full max-w-sm">
          <PedirAyudaForm userId={user.id} />
        </div>
      </main>
    </div>
  );
}
