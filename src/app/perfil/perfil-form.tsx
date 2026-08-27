"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ImageUploader } from "@/components/image-uploader";

export function PerfilForm({
  userId,
  initialFullName,
  initialAvatarUrl,
  initialHandle,
}: {
  userId: string;
  initialFullName: string | null;
  initialAvatarUrl: string | null;
  initialHandle: string;
}) {
  const supabase = createClient();
  const [fullName, setFullName] = useState(initialFullName ?? "");
  const [handle, setHandle] = useState(initialHandle);
  const [handleSaving, setHandleSaving] = useState(false);
  const [handleSaved, setHandleSaved] = useState(false);
  const [handleError, setHandleError] = useState<string | null>(null);
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

  async function handleSaveHandle() {
    const limpio = handle.trim().toLowerCase();
    setHandleSaving(true);
    setHandleSaved(false);
    setHandleError(null);

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ handle: limpio })
      .eq("id", userId);

    setHandleSaving(false);

    if (updateError) {
      // La base rechaza reservados, duplicados y formatos inválidos con
      // errores distintos; se traducen a algo que se entienda en vez de
      // mostrar el mensaje de Postgres.
      const msg = updateError.message.toLowerCase();
      if (msg.includes("retirado")) {
        setHandleError(
          "Ese nombre lo usó otra persona antes. Para no romper links que ya compartió, no se puede reutilizar.",
        );
      } else if (msg.includes("reservado")) {
        setHandleError("Ese nombre está reservado por el sitio. Probá otro.");
      } else if (msg.includes("duplicate") || msg.includes("unique")) {
        setHandleError("Ya lo está usando otra persona. Probá otro.");
      } else if (msg.includes("format") || msg.includes("check")) {
        setHandleError("Usá entre 3 y 30 caracteres: minúsculas, números y guiones.");
      } else {
        setHandleError("No pudimos guardarlo. Probá de nuevo.");
      }
      return;
    }

    setHandle(limpio);
    setHandleSaved(true);
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

      {/*
        El handle es la parte pública y compartible del perfil, así que va
        arriba de todo con el link completo a la vista: es lo que la persona
        va a copiar y mandar por WhatsApp.
      */}
      <div className="flex flex-col gap-2">
        <label
          htmlFor="handle"
          className="text-xs font-semibold uppercase tracking-[0.15em] text-muted"
        >
          Tu link
        </label>
        <div className="flex items-center rounded-sm border-2 border-border bg-background-card focus-within:border-primary">
          <span className="pl-4 text-base text-muted">lacomu.ar/</span>
          <input
            id="handle"
            type="text"
            maxLength={30}
            value={handle}
            onChange={(e) => {
              // Se normaliza mientras escribe para que no pueda guardar algo
              // que la base va a rechazar de todos modos.
              setHandle(
                e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""),
              );
              setHandleSaved(false);
              setHandleError(null);
            }}
            placeholder="tunombre"
            aria-invalid={handleError ? true : undefined}
            aria-describedby={handleError ? "perfil-handle-error" : undefined}
            className="w-full bg-transparent py-3 pr-4 text-base text-foreground outline-none"
          />
        </div>
        <p className="text-sm text-muted">
          Así se comparte tu pedido:{" "}
          <span className="break-all text-foreground">
            lacomu.ar/{handle || "tunombre"}
          </span>
        </p>
        <button
          type="button"
          onClick={handleSaveHandle}
          disabled={handleSaving || handle.length < 3 || handle === initialHandle}
          className="w-fit rounded-sm bg-primary px-5 py-2.5 text-sm font-semibold uppercase tracking-wider text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:hover:translate-y-0"
        >
          {handleSaving ? "Guardando…" : "Guardar link"}
        </button>
        <p role="status" aria-live="polite" className="text-sm text-success">
          {handleSaved ? "Guardado." : ""}
        </p>
        {handleError ? (
          <p id="perfil-handle-error" role="alert" className="text-sm text-error">
            {handleError}
          </p>
        ) : null}
      </div>

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
        <p role="status" aria-live="polite" className="text-sm text-success">
          {saved ? "Guardado." : ""}
        </p>
        {error ? (
          <p id="perfil-nombre-error" role="alert" className="text-sm text-error">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
