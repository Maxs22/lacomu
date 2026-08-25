"use client";

import { useState, type FormEvent } from "react";

export function DonateForm({ campaignId }: { campaignId: string }) {
  // Estable por render del form — si hay un retry de red o un doble
  // click, el server reusa la misma contribution/preference en vez de
  // cobrar dos veces (ver /api/mp/create-preference).
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  const [amount, setAmount] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [donorDisplayName, setDonorDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/mp/create-preference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignId,
          amount: Number(amount),
          isAnonymous,
          donorDisplayName,
          idempotencyKey,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "No se pudo iniciar el pago.");
        setLoading(false);
        return;
      }

      window.location.href = data.initPoint;
      // No hay setLoading(false) acá a propósito: el botón se queda
      // deshabilitado mientras el browser navega afuera.
    } catch {
      // fetch rechazado (sin red) o la respuesta no era JSON válido —
      // sin este catch, loading quedaba en true para siempre.
      setError("No se pudo conectar. Probá de nuevo.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-2">
      <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-muted">
        Cuánto querés ayudar (ARS)
        <input
          type="number"
          inputMode="numeric"
          min={1}
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="5000"
          className="rounded-sm border-2 border-border bg-background-card px-4 py-3 text-base font-normal normal-case tracking-normal text-foreground outline-none focus:border-primary"
        />
      </label>

      {!isAnonymous ? (
        <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-muted">
          Tu nombre (opcional, se muestra públicamente)
          <input
            type="text"
            value={donorDisplayName}
            onChange={(e) => setDonorDisplayName(e.target.value)}
            placeholder="Cómo querés que te vean"
            className="rounded-sm border-2 border-border bg-background-card px-4 py-3 text-base font-normal normal-case tracking-normal text-foreground outline-none focus:border-primary"
          />
        </label>
      ) : null}

      <label className="flex items-center gap-2 text-sm text-muted">
        <input
          type="checkbox"
          checked={isAnonymous}
          onChange={(e) => setIsAnonymous(e.target.checked)}
          className="h-4 w-4 accent-primary"
        />
        Donar de forma anónima
      </label>

      <button
        type="submit"
        disabled={loading || !amount}
        className="inline-flex items-center justify-center gap-2 rounded-sm bg-primary px-7 py-4 text-sm font-semibold uppercase tracking-wider text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_var(--color-foreground)] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:hover:translate-y-0"
      >
        {loading ? "Redirigiendo a Mercado Pago…" : "Quiero ayudar"}
      </button>

      {error ? <p className="text-sm text-primary">{error}</p> : null}
    </form>
  );
}
