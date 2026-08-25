"use client";

import { useId, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Sube un archivo a un bucket de Supabase Storage y devuelve la URL pública
 * vía onUploaded. No toca ninguna tabla — quien lo usa decide dónde guardar
 * esa URL (profiles.avatar_url, campaigns.cover_image_url, etc.).
 *
 * Si onUploaded tira (ej. no se pudo persistir la URL), se muestra el
 * error y se libera el estado de "subiendo" igual — si no, el formulario
 * que lo contiene queda trabado para siempre.
 */
export function ImageUploader({
  bucket,
  path,
  currentUrl,
  onUploaded,
  onUploadingChange,
  label,
  shape = "square",
}: {
  bucket: string;
  path: string;
  currentUrl: string | null;
  onUploaded: (url: string) => void | Promise<void>;
  /** Para que quien use esto pueda bloquear un submit mientras sube. */
  onUploadingChange?: (uploading: boolean) => void;
  label: string;
  shape?: "square" | "banner";
}) {
  const supabase = createClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const [preview, setPreview] = useState<string | null>(currentUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function finish() {
    setUploading(false);
    onUploadingChange?.(false);
  }

  async function handleFile(file: File) {
    setUploading(true);
    onUploadingChange?.(true);
    setError(null);

    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const objectPath = `${path}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(objectPath, file, { upsert: true, cacheControl: "3600" });

      if (uploadError) {
        setError("No se pudo subir la imagen. Probá de nuevo.");
        return;
      }

      const { data } = supabase.storage.from(bucket).getPublicUrl(objectPath);
      // cache-bust: el mismo path puede haber tenido otra imagen antes.
      const url = `${data.publicUrl}?t=${Date.now()}`;

      // onUploaded puede fallar (ej. no se pudo guardar la URL en la
      // tabla) — el archivo ya está en Storage pero no sirve de nada si
      // no quedó asociado, así que se avisa y no se muestra el preview
      // como si hubiera funcionado.
      await onUploaded(url);
      setPreview(url);
    } catch {
      setError("Se subió la imagen pero no se pudo guardar. Probá de nuevo.");
    } finally {
      finish();
    }
  }

  const buttonLabel = preview ? `${label}: cambiar imagen` : `${label}: subir imagen`;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted">
        {label}
      </p>

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        aria-label={buttonLabel}
        aria-busy={uploading || undefined}
        aria-describedby={error ? errorId : undefined}
        className={`group relative overflow-hidden border-2 border-dashed border-border bg-background-card transition-colors hover:border-primary focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/40 ${
          shape === "square"
            ? "h-28 w-28 rounded-full"
            : "h-36 w-full rounded-sm"
        }`}
      >
        {preview ? (
          // Viene de Supabase Storage, es contenido subido por el usuario:
          // no vale la pena la config de dominios remotos de next/image acá.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-sm text-muted">
            Subir imagen
          </span>
        )}

        {uploading ? (
          <span className="absolute inset-0 flex items-center justify-center bg-background/80 text-sm text-foreground">
            Subiendo…
          </span>
        ) : null}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />

      {error ? (
        <p id={errorId} role="alert" className="text-sm text-primary">
          {error}
        </p>
      ) : null}
    </div>
  );
}
