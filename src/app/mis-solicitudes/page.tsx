import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/status-badge";
import { formatCurrency } from "@/lib/format";

export default async function MisSolicitudesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/ingresar");
  }

  const { data: applications } = await supabase
    .from("campaign_applications")
    .select(
      "id, title, description, goal_amount, status, rejection_reason, created_at, campaigns(id)",
    )
    .eq("applicant_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <div className="relative z-[1] flex flex-1 flex-col">
      <header className="flex items-center justify-between px-6 py-6 md:px-16">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground"
        >
          ← lacomu
        </Link>
        <Link
          href="/pedir-ayuda"
          className="text-sm font-semibold text-primary underline decoration-dotted underline-offset-4"
        >
          + Nueva solicitud
        </Link>
      </header>

      <main className="px-6 pb-24 md:px-16">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
          <h1 className="font-display text-3xl text-foreground">
            Tus solicitudes
          </h1>

          {!applications || applications.length === 0 ? (
            <div className="rounded-sm border-2 border-dashed border-border px-6 py-12 text-center">
              <p className="text-base text-muted">
                Todavía no pediste ayuda.
              </p>
              <Link
                href="/pedir-ayuda"
                className="mt-2 inline-block text-sm font-semibold text-primary underline decoration-dotted underline-offset-4"
              >
                Contanos qué necesitás →
              </Link>
            </div>
          ) : (
            <ul className="flex flex-col gap-4">
              {applications.map((app) => {
                const campaignId = app.campaigns?.[0]?.id;
                return (
                  <li
                    key={app.id}
                    className="flex flex-col gap-2 rounded-sm border-2 border-border bg-background-card p-5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="break-words font-display text-lg text-foreground">
                        {app.title}
                      </h2>
                      <StatusBadge status={app.status} />
                    </div>
                    <p className="line-clamp-2 text-sm text-muted">
                      {app.description}
                    </p>
                    {app.goal_amount ? (
                      <p className="text-sm text-muted">
                        Pediste {formatCurrency(Number(app.goal_amount), "ARS")}
                      </p>
                    ) : null}
                    {app.status === "rejected" && app.rejection_reason ? (
                      <p className="text-sm text-error">
                        Motivo: {app.rejection_reason}
                      </p>
                    ) : null}
                    {app.status === "approved" && campaignId ? (
                      <Link
                        href={`/campanas/${campaignId}`}
                        className="mt-1 w-fit text-sm font-semibold text-primary underline decoration-dotted underline-offset-4"
                      >
                        Ver campaña publicada →
                      </Link>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
