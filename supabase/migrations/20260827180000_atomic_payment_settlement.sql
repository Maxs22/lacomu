-- Conciliación de pagos de Mercado Pago en UNA transacción.
--
-- Tres bugs que arregla, todos verificados en el código del webhook:
--
-- 1) P0 — un pago aprobado DESPUÉS de uno rechazado no se acreditaba.
--    El webhook guardaba el mp_payment_id del primer intento (aunque
--    hubiera sido rejected/cancelled) y después descartaba cualquier
--    pago con otro id como "duplicate". Checkout Pro permite reintentar
--    con otra tarjeta sobre la MISMA preference, y ese reintento llega
--    con un payment_id nuevo: la plata se movía de verdad al
--    beneficiario y la contribución quedaba en 'failed' para siempre.
--
--    Regla nueva: un id distinto solo se descarta si NO mejora el
--    estado. approved (3) > pending (2) > failed (1). Un approved
--    siempre puede tomar el lugar de un failed o un pending; dos
--    approved sí son cobro duplicado y ahí no se pisa nada (lacomu no
--    puede devolver fondos, eso lo resuelve una persona con el registro
--    de mp_webhook_events).
--
-- 2) P1 — los totales podían quedar mal para siempre. La contribución se
--    actualizaba y los totales se recalculaban DESPUÉS, en otro request
--    a PostgREST. Si ese segundo paso fallaba devolvíamos 502 para que
--    MP reintentara, pero el retry veía la contribución ya confirmada,
--    entraba por el `if (contribution.status !== status)` en falso y NO
--    recomponía los totales. La campaña quedaba mostrando menos plata de
--    la que recibió, sin error visible en ningún lado.
--
--    Acá el recálculo va en la misma transacción que el cambio de estado
--    y se hace SIEMPRE, no solo cuando el estado cambió: es un agregado
--    idempotente, así que un retry repara en vez de saltear.
--
-- 3) P1 — dos pagos concurrentes de la MISMA campaña se pisaban. Cada
--    uno leía el total y lo escribía; el último en escribir ganaba con
--    una suma calculada antes de que el otro confirmara. Se serializa
--    con un advisory lock por campaña: al soltarse, el SELECT de sumas
--    (READ COMMITTED, snapshot por sentencia) ya ve lo que commiteó el
--    otro.

-- El collector esperado se congela al crear la preference.
--
-- Antes se comparaba el collector_id del pago contra la conexión ACTUAL
-- del beneficiario. Si esa persona reconecta Mercado Pago con otra cuenta
-- (el callback hace upsert por profile_id y sobrescribe el mp_user_id),
-- todos los pagos en vuelo hacia la cuenta anterior pasaban a leerse como
-- 'mismatch' y no se acreditaban nunca. El collector correcto es el que
-- estaba vigente cuando se armó el checkout, no el de hoy.
alter table public.contributions
  add column mp_collector_id text;

comment on column public.contributions.mp_collector_id is
  'mp_user_id del beneficiario al momento de crear la preference. Se compara contra el collector_id del pago; congelarlo evita que reconectar MP invalide pagos en vuelo.';

-- Un pago que queda atrás porque otro mejor lo reemplazó no es lo mismo
-- que un cobro duplicado: hay que poder distinguirlos al reconciliar a
-- mano.
alter table public.mp_webhook_events
  drop constraint mp_webhook_events_reconciliation_status_check,
  add constraint mp_webhook_events_reconciliation_status_check check (
    reconciliation_status in ('settled', 'duplicate', 'mismatch', 'superseded')
  );

create or replace function public.record_mp_webhook_event(
  p_payment_id text,
  p_contribution_id uuid,
  p_payment_status text,
  p_reconciliation_status text
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.mp_webhook_events (
    payment_id, contribution_id, payment_status, reconciliation_status, last_seen_at
  )
  values (
    p_payment_id, p_contribution_id, p_payment_status, p_reconciliation_status, now()
  )
  on conflict (payment_id) do update
    set payment_status = excluded.payment_status,
        reconciliation_status = excluded.reconciliation_status,
        last_seen_at = excluded.last_seen_at;
$$;

/**
 * Concilia un pago de MP contra su contribución y deja los totales de la
 * campaña consistentes, todo en una transacción.
 *
 * Devuelve qué pasó, para que el webhook decida el status HTTP:
 *   'unknown_contribution' | 'mismatch' | 'duplicate'
 *   'settled' | 'superseded_previous'
 *
 * Ninguno de esos es un error transitorio: si esta función retorna, la
 * decisión ya está tomada y persistida. El webhook solo devuelve 5xx
 * cuando la llamada falla (para que MP reintente).
 */
create or replace function public.settle_mp_payment(
  p_contribution_id uuid,
  p_payment_id text,
  p_payment_status text,
  p_transaction_amount numeric,
  p_currency text,
  p_collector_id text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contribution public.contributions;
  v_expected_collector text;
  v_new_status text;
  v_new_rank int;
  v_stored_rank int;
  v_outcome text;
begin
  -- FOR UPDATE serializa las notificaciones de una misma donación: MP
  -- puede mandar la misma varias veces y en paralelo.
  select * into v_contribution
  from public.contributions
  where id = p_contribution_id
  for update;

  if not found then
    return 'unknown_contribution';
  end if;

  -- Fallback a la conexión actual solo para filas anteriores a esta
  -- migración, que no tienen el collector congelado.
  v_expected_collector := coalesce(
    v_contribution.mp_collector_id,
    (
      select conn.mp_user_id
      from public.campaigns camp
      join public.mp_connections conn on conn.profile_id = camp.owner_id
      where camp.id = v_contribution.campaign_id
    )
  );

  -- Fail CLOSED: sin collector esperado no hay nada contra qué comparar,
  -- y no puede existir un pago legítimo sin conexión (sin ella
  -- create-preference nunca habría podido armar el checkout).
  if v_expected_collector is null
     or p_collector_id is null
     or p_collector_id <> v_expected_collector
     or p_currency is distinct from v_contribution.currency
     or p_transaction_amount is null
     or abs(p_transaction_amount - v_contribution.amount) >= 0.01 then
    perform public.record_mp_webhook_event(
      p_payment_id, p_contribution_id, p_payment_status, 'mismatch'
    );
    return 'mismatch';
  end if;

  v_new_status := case p_payment_status
    when 'approved' then 'confirmed'
    when 'rejected' then 'failed'
    when 'cancelled' then 'failed'
    else 'pending'
  end;

  if v_contribution.mp_payment_id is not null
     and v_contribution.mp_payment_id <> p_payment_id then
    v_new_rank := case v_new_status
      when 'confirmed' then 3 when 'pending' then 2 else 1 end;
    v_stored_rank := case v_contribution.status
      when 'confirmed' then 3 when 'pending' then 2 else 1 end;

    -- No mejora nada: o es un cobro duplicado real (dos approved), o es
    -- un intento viejo notificado tarde. En ninguno de los dos casos se
    -- pisa el pago que ya está asentado.
    if v_new_rank <= v_stored_rank then
      perform public.record_mp_webhook_event(
        p_payment_id, p_contribution_id, p_payment_status, 'duplicate'
      );
      return 'duplicate';
    end if;

    -- Reintento que sí mejoró: el pago anterior nunca movió plata.
    update public.mp_webhook_events
      set reconciliation_status = 'superseded',
          last_seen_at = now()
      where payment_id = v_contribution.mp_payment_id
        and contribution_id = p_contribution_id;

    v_outcome := 'superseded_previous';
  else
    v_outcome := 'settled';
  end if;

  update public.contributions
  set status = v_new_status,
      mp_payment_id = p_payment_id,
      confirmed_at = case
        when v_new_status = 'confirmed' then coalesce(confirmed_at, now())
        else null
      end
  where id = p_contribution_id;

  -- Serializa el recálculo por campaña. Dos contribuciones distintas de
  -- la misma campaña lockean filas distintas, así que el FOR UPDATE de
  -- arriba no alcanza para evitar que se pisen los totales.
  perform pg_advisory_xact_lock(
    hashtext('campaign_stats:' || v_contribution.campaign_id::text)
  );

  insert into public.campaign_stats (
    campaign_id, raised_amount, contributors_count, updated_at
  )
  select
    v_contribution.campaign_id,
    coalesce(sum(amount), 0),
    count(*),
    now()
  from public.contributions
  where campaign_id = v_contribution.campaign_id
    and status = 'confirmed'
  on conflict (campaign_id) do update
    set raised_amount = excluded.raised_amount,
        contributors_count = excluded.contributors_count,
        updated_at = excluded.updated_at;

  perform public.record_mp_webhook_event(
    p_payment_id, p_contribution_id, p_payment_status, 'settled'
  );

  return v_outcome;
end;
$$;

-- Postgres da EXECUTE a PUBLIC por defecto en toda función nueva. Estas
-- son SECURITY DEFINER y escriben plata: si quedan ejecutables por la
-- anon key, cualquiera confirma su propia donación desde el navegador.
revoke all on function public.record_mp_webhook_event(text, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.settle_mp_payment(uuid, text, text, numeric, text, text)
  from public, anon, authenticated;
