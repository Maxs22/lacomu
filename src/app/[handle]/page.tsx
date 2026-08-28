import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import {
  getProfileByHandle,
  getCampaignsByProfile,
  getCurrentHandleFor,
} from "@/lib/profiles";
import { CampaignCard } from "@/components/campaign-card";
import { LogoMark } from "@/components/logo-mark";
import { queryStringFrom } from "@/lib/query";

/**
 * Página pública de una persona: lacomu.ar/maxsdev
 *
 * Esta ruta es un catch-all de primer nivel, así que compite con las rutas
 * estáticas del sitio (/terminos, /perfil, etc.). Next les da precedencia a
 * las estáticas, y además esos nombres están en la tabla
 * `reserved_handles` para que nadie los pueda tomar como handle y quedarse
 * con un perfil inalcanzable.
 */
export async function generateMetadata({
  params,
}: PageProps<"/[handle]">): Promise<Metadata> {
  const { handle } = await params;
  const profile = await getProfileByHandle(handle);
  if (!profile) return { title: "No encontrado" };

  const nombre = profile.fullName ?? profile.handle;
  return {
    title: nombre,
    description: `Pedidos de ayuda de ${nombre} en lacomu.`,
    // El handle canónico es el actual: si alguien llega por uno viejo la
    // página redirige, pero declararlo evita que un link con el handle
    // anterior compita en el índice con el nuevo.
    alternates: { canonical: `/${profile.handle}` },
    openGraph: {
      title: `${nombre} · lacomu`,
      description: `Pedidos de ayuda de ${nombre} en lacomu.`,
      images: profile.avatarUrl ? [{ url: profile.avatarUrl }] : undefined,
    },
  };
}

export default async function PerfilPublicoPage({
  params,
  searchParams,
}: PageProps<"/[handle]">) {
  const { handle } = await params;
  const query = await searchParams;
  const profile = await getProfileByHandle(handle);

  if (!profile) {
    // Puede ser un handle que esta persona dejó al renombrarse: en ese caso
    // el link compartido sigue siendo válido, solo hay que llevarlo al
    // nuevo. Si se retiró por borrado de cuenta, no hay destino y es 404.
    const actual = await getCurrentHandleFor(handle);
    if (actual) {
      permanentRedirect(`/${actual}${queryStringFrom(query)}`);
    }
    notFound();
  }

  const campaigns = await getCampaignsByProfile(profile.id);
  const nombre = profile.fullName ?? profile.handle;
  const inicial = nombre.charAt(0).toUpperCase();

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

      <main className="px-6 pb-24 md:px-16">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-10">
          <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-end sm:text-left">
            {profile.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatarUrl}
                alt=""
                className="h-24 w-24 rounded-full border-2 border-border object-cover"
              />
            ) : (
              <span className="flex h-24 w-24 items-center justify-center rounded-full bg-primary font-display text-4xl italic text-primary-foreground">
                {inicial}
              </span>
            )}

            <div className="flex flex-col gap-1">
              <h1 className="break-words font-display text-3xl leading-tight text-foreground sm:text-4xl">
                {nombre}
              </h1>
              <p className="text-sm text-muted">lacomu.ar/{profile.handle}</p>
            </div>
          </div>

          <section className="flex flex-col gap-6">
            <h2 className="font-display text-2xl text-foreground">
              {campaigns.length === 1 ? "Su pedido" : "Sus pedidos"}
            </h2>

            {campaigns.length > 0 ? (
              <div className="grid gap-6 sm:grid-cols-2">
                {campaigns.map((c) => (
                  <CampaignCard key={c.id} campaign={c} />
                ))}
              </div>
            ) : (
              <p className="rounded-sm border-2 border-dashed border-border px-6 py-12 text-center text-base text-muted">
                Todavía no publicó ningún pedido.
              </p>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
