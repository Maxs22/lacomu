"use client";

import {
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Step = "email" | "code";
const CODE_LENGTH = 6;

export default function IngresarPage() {
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  async function handleSendCode(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true },
    });

    setLoading(false);

    if (otpError) {
      setError(
        "No pudimos enviar el código. Revisá el email e intentá de nuevo.",
      );
      return;
    }

    setStep("code");
    requestAnimationFrame(() => inputsRef.current[0]?.focus());
  }

  function handleDigitChange(index: number, value: string) {
    const clean = value.replace(/\D/g, "").slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[index] = clean;
      return next;
    });
    if (clean && index < CODE_LENGTH - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, CODE_LENGTH);
    if (!pasted) return;
    e.preventDefault();
    setDigits((prev) => {
      const next = [...prev];
      pasted.split("").forEach((d, i) => (next[i] = d));
      return next;
    });
    inputsRef.current[Math.min(pasted.length, CODE_LENGTH - 1)]?.focus();
  }

  async function handleVerifyCode(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: verifyError } = await supabase.auth.verifyOtp({
      email,
      token: digits.join(""),
      type: "email",
    });

    setLoading(false);

    if (verifyError) {
      setError("Código incorrecto o vencido. Pedí uno nuevo.");
      return;
    }

    router.push("/");
    router.refresh();
  }

  const codeComplete = digits.every((d) => d !== "");

  return (
    <main className="relative z-[1] flex min-h-screen flex-col items-center px-6 pt-10 pb-16 md:pt-16">
      <div className="w-full max-w-sm">
        <Link
          href="/"
          className="mb-10 inline-flex items-center gap-1 rounded-sm text-sm text-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          ← lacomu
        </Link>

        <h1 className="font-display text-3xl leading-tight text-foreground">
          {step === "email" ? (
            <>
              Ingresar a <span className="italic text-primary">lacomu</span>
            </>
          ) : (
            <>
              Revisá tu <span className="italic text-primary">email.</span>
            </>
          )}
        </h1>

        <p className="mt-3 text-base text-muted">
          {step === "email" ? (
            "Sin contraseña. Te mandamos un código de 6 dígitos cada vez."
          ) : (
            <>
              Te mandamos un código a{" "}
              <strong className="text-foreground">{email}</strong>.
            </>
          )}
        </p>

        {step === "email" ? (
          <form onSubmit={handleSendCode} className="mt-8 flex flex-col gap-4">
            <label htmlFor="email" className="sr-only">
              Tu email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vos@ejemplo.com"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "ingresar-error" : undefined}
              className="w-full rounded-sm border-2 border-border bg-background-card px-4 py-3.5 text-base text-foreground placeholder:text-muted/60 outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/40"
            />
            <button
              type="submit"
              disabled={loading || !email}
              className="inline-flex items-center justify-center rounded-sm bg-primary px-6 py-3.5 text-sm font-semibold uppercase tracking-wider text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_var(--color-foreground)] focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:hover:translate-y-0"
            >
              {loading ? "Enviando…" : "Mandarme el código"}
            </button>
          </form>
        ) : (
          <form
            onSubmit={handleVerifyCode}
            className="mt-8 flex flex-col gap-6"
          >
            <fieldset className="border-0 p-0">
              <legend className="sr-only">
                Código de {CODE_LENGTH} dígitos que te llegó por email
              </legend>
              <div className="flex gap-2">
                {digits.map((digit, i) => (
                  <div key={i} className="flex-1">
                    <label htmlFor={`otp-${i}`} className="sr-only">
                      Dígito {i + 1} de {CODE_LENGTH}
                    </label>
                    <input
                      id={`otp-${i}`}
                      ref={(el) => {
                        inputsRef.current[i] = el;
                      }}
                      type="text"
                      inputMode="numeric"
                      autoComplete={i === 0 ? "one-time-code" : "off"}
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleDigitChange(i, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(i, e)}
                      onPaste={handlePaste}
                      aria-invalid={error ? true : undefined}
                      aria-describedby={error ? "ingresar-error" : undefined}
                      className="h-14 w-full rounded-sm border-2 border-border bg-background-card text-center font-display text-2xl text-foreground outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/40"
                    />
                  </div>
                ))}
              </div>
            </fieldset>
            <button
              type="submit"
              disabled={loading || !codeComplete}
              className="inline-flex items-center justify-center rounded-sm bg-primary px-6 py-3.5 text-sm font-semibold uppercase tracking-wider text-primary-foreground shadow-[3px_3px_0_0_var(--color-foreground)] transition-transform hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_var(--color-foreground)] focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:hover:translate-y-0"
            >
              {loading ? "Verificando…" : "Ingresar"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("email");
                setDigits(Array(CODE_LENGTH).fill(""));
                setError(null);
              }}
              className="rounded-sm text-sm text-muted underline decoration-dotted underline-offset-4 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              Usar otro email
            </button>
          </form>
        )}

        {error ? (
          <p id="ingresar-error" role="alert" className="mt-4 text-sm text-primary">
            {error}
          </p>
        ) : null}
      </div>
    </main>
  );
}
