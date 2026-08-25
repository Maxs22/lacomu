import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PedirAyudaForm } from "./pedir-ayuda-form";

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
