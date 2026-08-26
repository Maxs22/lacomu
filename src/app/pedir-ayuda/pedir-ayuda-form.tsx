"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ImageUploader } from "@/components/image-uploader";

export function PedirAyudaForm({ userId }: { userId: string }) {
  const supabase = createClient();

  // Path estable por render, keyeado por auth.uid() — no depende de que
  // exista una campaign_application todavía (ver fix_banner_upload_timing).
  const [bannerPath] = useState(
    () => `${userId}/${crypto.randomUUID()}`,
  );

  const [done, setDone] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [goalAmount, setGoalAmount] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [bannerUploading, setBannerUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const { error: insertError } = await supabase
      .from("campaign_applications")
      .insert({
        applicant_id: userId,
        title,
        description,
        goal_amount: goalAmount ? Number(goalAmount) : null,
        cover_image_url: coverImageUrl,
      });

    setSaving(false);

    if (insertError) {
      setError("No pudimos guardar tu solicitud. Probá de nuevo.");
      return;
    }

    setDone(true);
  }

  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-3xl text-foreground">
          Ya está publicada.
        </h1>
        <p className="text-base text-muted">
          Tu pedido ya es visible para cualquiera que entre a lacomu — no
          hay revisión previa. Lo podés ver desde tus solicitudes.
        </p>
        <Link
          href="/"
          className="mt-2 w-fit rounded-sm bg-primary px-6 py-3.5 text-sm font-semibold uppercase tracking-wider text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_var(--color-foreground)]"
        >
          Volver a lacomu
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl text-foreground">
          Contanos qué necesitás
        </h1>
        <p className="mt-2 text-base text-muted">
          No hace falta justificar por qué — solo contá tu situación con tus
          palabras.
        </p>
      </div>

      <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-muted">
        Título corto
        <input
          type="text"
          required
          maxLength={80}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ej: Necesito un taladro para volver a laburar"
          className="rounded-sm border-2 border-border bg-background-card px-4 py-3 text-base font-normal normal-case tracking-normal text-foreground outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/40"
        />
      </label>

      <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-muted">
        Contá tu situación
        <textarea
          required
          rows={5}
          maxLength={2000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="¿Qué te pasó? ¿Para qué necesitás la ayuda?"
          className="rounded-sm border-2 border-border bg-background-card px-4 py-3 text-base font-normal normal-case leading-relaxed tracking-normal text-foreground outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/40"
        />
      </label>

      <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-muted">
        Monto que necesitás (ARS)
        <input
          type="number"
          inputMode="numeric"
          min={1}
          value={goalAmount}
          onChange={(e) => setGoalAmount(e.target.value)}
          placeholder="180000"
          className="rounded-sm border-2 border-border bg-background-card px-4 py-3 text-base font-normal normal-case tracking-normal text-foreground outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/40"
        />
      </label>

      <ImageUploader
        bucket="campaign-banners"
        path={bannerPath}
        currentUrl={null}
        onUploaded={(url) => setCoverImageUrl(url)}
        label="Foto de tu pedido (opcional)"
        shape="banner"
        onUploadingChange={setBannerUploading}
      />

      <button
        type="submit"
        disabled={saving || bannerUploading || !title || !description}
        className="w-fit rounded-sm bg-primary px-6 py-3.5 text-sm font-semibold uppercase tracking-wider text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_var(--color-foreground)] focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:hover:translate-y-0"
      >
        {bannerUploading
          ? "Esperando la foto…"
          : saving
            ? "Publicando…"
            : "Publicar"}
      </button>

      {error ? (
        <p role="alert" className="text-sm text-primary">
          {error}
        </p>
      ) : null}
    </form>
  );
}
