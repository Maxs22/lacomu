import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CampaignCard } from "@/components/campaign-card";
import { LogoMark } from "@/components/logo-mark";
import { getPublishedCampaigns } from "@/lib/campaigns";

const CHAIN_AVATARS = [
  { initial: "C", tone: "bg-primary" },
  { initial: "M", tone: "bg-secondary" },
  { initial: "J", tone: "bg-primary/90" },
  { initial: "R", tone: "bg-secondary/90" },
  { initial: "L", tone: "bg-primary/75" },
  { initial: "N", tone: "bg-secondary/75" },
  { initial: "S", tone: "bg-primary/60" },
];

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const campaigns = await getPublishedCampaigns();

  async function signOut() {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/");
  }

  return (
    <div className="relative z-[1] flex flex-1 flex-col">
      <header className="flex items-center justify-between px-6 py-6 md:px-16">
        <span className="flex items-center gap-2">
          <LogoMark className="h-7 w-auto" />
          <span className="font-display text-xl font-semibold tracking-tight text-foreground">
            lacomu<span className="text-primary">.</span>
          </span>
        </span>

        {user ? (
          <nav
            aria-label="Tu cuenta"
            className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-sm text-muted"
          >
            <Link
              href="/mis-solicitudes"
              className="underline decoration-dotted underline-offset-4 hover:text-foreground"
            >
              Mis solicitudes
            </Link>
            <Link
              href="/perfil"
              className="underline decoration-dotted underline-offset-4 hover:text-foreground"
            >
              Tu perfil
            </Link>
            <form action={signOut}>
              <button
                type="submit"
                className="underline decoration-dotted underline-offset-4 hover:text-foreground"
              >
                Cerrar sesión
              </button>
            </form>
          </nav>
        ) : null}
      </header>

      <main className="flex flex-col px-6 pt-4 pb-16 md:px-16 md:pt-10">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
          <h1 className="font-display text-4xl leading-[1.05] text-foreground sm:text-5xl md:text-6xl">
            Ayudar a alguien no debería tener{" "}
            <span className="italic text-primary">letra chica.</span>
          </h1>

          <p className="max-w-md text-lg leading-relaxed text-muted">
            lacomu conecta a quien necesita una mano con quien puede darla.
            Vos elegís a quién ayudar — nosotros solo nos aseguramos de que
            sea real.
          </p>

          <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex -space-x-3">
              {CHAIN_AVATARS.map((a) => (
                <span
                  key={a.initial}
                  className={`flex h-10 w-10 items-center justify-center rounded-full border-2 border-background text-sm font-semibold text-primary-foreground ${a.tone}`}
                >
                  {a.initial}
                </span>
              ))}
              <span className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-background bg-background-card text-sm font-semibold text-muted">
                +
              </span>
            </div>
            <p className="max-w-[14rem] text-sm text-muted">
              Así se arma una cadena: alguien te ayuda a vos, después ayudás
              a alguien más.
            </p>
          </div>

          <div className="pt-4">
            <Link
              href={user ? "/pedir-ayuda" : "/ingresar"}
              className="inline-flex items-center justify-center gap-2 rounded-sm bg-primary px-7 py-4 text-sm font-semibold uppercase tracking-wider text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_var(--color-foreground)]"
            >
              {user ? "Pedir ayuda →" : "Ingresar a lacomu →"}
            </Link>
          </div>
        </div>
      </main>

      <section className="px-6 pb-24 md:px-16">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
          <div>
            <h2 className="font-display text-2xl text-foreground sm:text-3xl">
              Quién necesita una mano ahora
            </h2>
          </div>

          {campaigns.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2">
              {campaigns.map((campaign) => (
                <CampaignCard key={campaign.id} campaign={campaign} />
              ))}
            </div>
          ) : (
            <div className="rounded-sm border-2 border-dashed border-border px-6 py-12 text-center">
              <p className="text-base text-muted">
                Todavía no hay campañas publicadas.
              </p>
              <Link
                href={user ? "/pedir-ayuda" : "/ingresar"}
                className="mt-2 inline-block text-sm font-semibold text-primary underline decoration-dotted underline-offset-4"
              >
                Sé el primero en pedir una mano →
              </Link>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
