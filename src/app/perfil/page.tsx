import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PerfilForm } from "./perfil-form";

export default async function PerfilPage({
  searchParams,
}: PageProps<"/perfil">) {
  const { mp } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/ingresar");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, avatar_url")
    .eq("id", user.id)
    .single();

  const admin = createAdminClient();
  const { data: mpConnection } = await admin
    .from("mp_connections")
    .select("connected_at")
    .eq("profile_id", user.id)
    .maybeSingle();

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
        <div className="mx-auto flex w-full max-w-sm flex-col gap-6">
          <div>
            <h1 className="font-display text-3xl text-foreground">
              Tu perfil
            </h1>
            <p className="mt-2 text-sm text-muted">{user.email}</p>
          </div>

          <PerfilForm
            userId={user.id}
            initialFullName={profile?.full_name ?? null}
            initialAvatarUrl={profile?.avatar_url ?? null}
          />

          <div className="flex flex-col gap-3 border-t border-border pt-6">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted">
              Mercado Pago
            </p>

            {mp === "error" ? (
              <p className="text-sm text-primary">
                No pudimos vincular tu cuenta. Probá de nuevo.
              </p>
            ) : null}
            {mp === "success" ? (
              <p className="text-sm text-secondary">
                Listo, tu cuenta quedó vinculada.
              </p>
            ) : null}

            {mpConnection ? (
              <p className="text-sm text-secondary">
                Cuenta vinculada — ya podés recibir ayuda en tus campañas.
              </p>
            ) : (
              <>
                <p className="text-sm text-muted">
                  Para que las donaciones lleguen directo a tu cuenta,
                  vinculá Mercado Pago. lacomu nunca toca esa plata.
                </p>
                <a
                  href="/api/mp/connect"
                  className="w-fit rounded-sm bg-primary px-5 py-2.5 text-sm font-semibold uppercase tracking-wider text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_var(--color-foreground)]"
                >
                  Conectar Mercado Pago
                </a>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
