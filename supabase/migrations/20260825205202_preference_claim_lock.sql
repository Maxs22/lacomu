-- El unique de idempotency_key serializa el INSERT de la fila local, pero
-- no serializa la llamada externa a createPreference: dos requests
-- concurrentes recuperaban la MISMA contribution (una ya sin fila
-- duplicada) y ambos seguían derecho a llamarle a MP, creando dos
-- preferences reales para el mismo external_reference.
--
-- Este campo es el lock: un UPDATE atómico "WHERE mp_preference_claim_started_at
-- IS NULL" solo puede ganarlo un request para una fila dada — el resto
-- espera el resultado en vez de llamar a MP también.

alter table public.contributions
  add column mp_preference_claim_started_at timestamptz;
