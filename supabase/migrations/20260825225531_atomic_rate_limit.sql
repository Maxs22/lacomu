-- El rate limit anterior contaba filas y después insertaba: dos
-- operaciones separadas, así que N requests simultáneos podían ver todos
-- un conteo por debajo del límite y pasar todos. Servía como freno
-- best-effort, no como límite real.
--
-- Esto lo hace atómico: un solo INSERT ... ON CONFLICT DO UPDATE que
-- incrementa y devuelve el valor resultante. El que recibe un valor por
-- encima del límite es rechazado, sin ventana entre "contar" y "usar".

create table public.rate_limit_buckets (
  bucket_key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket_key, window_start)
);

alter table public.rate_limit_buckets enable row level security;

create function public.bump_rate_limit(
  p_bucket_key text,
  p_window_seconds integer,
  p_limit integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_hits integer;
begin
  -- Ventana fija: todos los requests del mismo tramo caen en la misma
  -- fila, así el incremento es sobre un único registro.
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.rate_limit_buckets (bucket_key, window_start, hits)
  values (p_bucket_key, v_window_start, 1)
  on conflict (bucket_key, window_start)
  do update set hits = rate_limit_buckets.hits + 1
  returning hits into v_hits;

  return v_hits <= p_limit;
end;
$$;

-- Limpieza de ventanas viejas, para que la tabla no crezca sin control.
-- Se llama oportunísticamente desde el server (no hay cron configurado).
create function public.prune_rate_limit_buckets()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.rate_limit_buckets
  where window_start < now() - interval '1 day';
$$;
