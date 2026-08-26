"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ImageUploader } from "@/components/image-uploader";

export function PerfilForm({
  userId,
  initialFullName,
  initialAvatarUrl,
}: {
  userId: string;
  initialFullName: string | null;
  initialAvatarUrl: string | null;
}) {
  const supabase = createClient();
  const [fullName, setFullName] = useState(initialFullName ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAvatarUploaded(url: string) {
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ avatar_url: url })
      .eq("id", userId);
    if (updateError) {
      // Se propaga para que el uploader lo muestre y no quede la foto
      // "subida" pero sin guardar en el profile.
      throw updateError;
    }
  }

  async function handleSaveName() {
    setSaving(true);
    setSaved(false);
    setError(null);

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ full_name: fullName || null })
      .eq("id", userId);

    setSaving(false);

    if (updateError) {
      setError("No pudimos guardar el cambio. Probá de nuevo.");
      return;
    }
    setSaved(true);
  }

  return (
    <div className="flex flex-col gap-8">
      <ImageUploader
        bucket="avatars"
        path={`${userId}/avatar`}
        currentUrl={initialAvatarUrl}
        onUploaded={handleAvatarUploaded}
        label="Tu avatar"
        shape="square"
      />

      <div className="flex flex-col gap-2">
        <label className="text-xs font-semibold uppercase tracking-[0.15em] text-muted">
          Nombre
          <input
            type="text"
            maxLength={60}
            value={fullName}
            onChange={(e) => {
              setFullName(e.target.value);
              setSaved(false);
              setError(null);
            }}
            placeholder="Como querés que te vean los demás"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "perfil-nombre-error" : undefined}
            className="mt-2 w-full rounded-sm border-2 border-border bg-background-card px-4 py-3 text-base font-normal normal-case tracking-normal text-foreground outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/40"
          />
        </label>
        <button
          type="button"
          onClick={handleSaveName}
          disabled={saving}
          className="w-fit rounded-sm bg-primary px-5 py-2.5 text-sm font-semibold uppercase tracking-wider text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_var(--color-foreground)] focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Guardar"}
        </button>
        <p role="status" aria-live="polite" className="text-sm text-secondary">
          {saved ? "Guardado." : ""}
        </p>
        {error ? (
          <p id="perfil-nombre-error" role="alert" className="text-sm text-primary">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
