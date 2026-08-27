-- P1: una idempotencyKey podía quedar trabada para siempre.
--
-- El claim de creación de preference se conservaba a propósito cuando MP
-- devolvía un resultado INCIERTO (timeout, 5xx): crear otra preference a
-- ciegas es cobrar dos veces. La idea era que el retry la recuperara por
-- external_reference antes de volver a crear.
--
-- El problema es que cuando MP responde "no existe ninguna preference con
-- ese external_reference", el camino de `tookOverStale` igual se negaba a
-- crear... y al retomar el claim vencido le reseteaba el TTL a now(). O
-- sea: cada reintento esperaba el TTL, retomaba el claim, preguntaba a MP,
-- no encontraba nada, devolvía 409 y volvía a armar el reloj. Un bucle sin
-- salida — esa donación quedaba pendiente para siempre y la persona tenía
-- que arrancar de nuevo con otra clave.
--
-- La cautela seguía siendo correcta la PRIMERA vez: un claim vencido no
-- prueba que el request anterior haya muerto, puede estar esperando la
-- respuesta de MP justo ahora, y nuestra búsqueda pudo haber corrido antes
-- de que MP termine de crearla. Pero esa ventana es de segundos, no
-- infinita. Lo que faltaba era acotarla: contar las veces que retomamos un
-- claim vencido y, después de dos TTL completos con MP diciendo
-- consistentemente que no hay ninguna preference, crear.
alter table public.contributions
  add column mp_preference_claim_takeovers integer not null default 0;

comment on column public.contributions.mp_preference_claim_takeovers is
  'Cuántas veces se retomó un claim vencido. Acota la cautela: tras 2 TTL con MP reportando que no existe preference, se permite crear en vez de quedar trabado.';

/**
 * Toma el derecho exclusivo a crear la preference de una contribución.
 *
 * Pasa a ser una función porque el contador de retomas necesita leerse y
 * escribirse en el mismo paso, y PostgREST no sabe hacer `col = col + 1`.
 * El `for update` es lo que serializa: dos requests concurrentes no pueden
 * evaluar el claim a la vez.
 *
 * Devuelve:
 *   won        — si este request tiene derecho a llamar a MP
 *   claim_token— token de fencing, para que un request que tardó más que el
 *                TTL no pise lo que escribió el que le quitó el claim
 *   took_over  — el claim anterior estaba vencido (alguien puede seguir vivo)
 *   takeovers  — cuántas retomas acumula esta contribución
 */
create or replace function public.claim_preference_creation(
  p_contribution_id uuid,
  p_ttl_seconds integer
)
returns table (won boolean, claim_token uuid, took_over boolean, takeovers integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.contributions;
  v_token uuid := gen_random_uuid();
  v_took_over boolean;
  v_takeovers integer;
begin
  select * into v_row
  from public.contributions
  where id = p_contribution_id
  for update;

  if not found then
    return query select false, null::uuid, false, 0;
    return;
  end if;

  -- Claim vigente de otro request: no se toca nada.
  if v_row.mp_preference_claim_started_at is not null
     and v_row.mp_preference_claim_started_at
         > now() - make_interval(secs => p_ttl_seconds) then
    return query select false, null::uuid, false, v_row.mp_preference_claim_takeovers;
    return;
  end if;

  v_took_over := v_row.mp_preference_claim_started_at is not null;
  v_takeovers := v_row.mp_preference_claim_takeovers
                 + (case when v_took_over then 1 else 0 end);

  update public.contributions
  set mp_preference_claim_started_at = now(),
      mp_preference_claim_token = v_token,
      mp_preference_claim_takeovers = v_takeovers
  where id = p_contribution_id;

  return query select true, v_token, v_took_over, v_takeovers;
end;
$$;

-- SECURITY DEFINER y decide sobre plata: si queda ejecutable por la anon
-- key, cualquiera puede robar o soltar el claim de una donación ajena.
revoke all on function public.claim_preference_creation(uuid, integer)
  from public, anon, authenticated;

-- P2: el slug de una campaña era editable por su dueño vía PostgREST.
--
-- El slug se genera una sola vez a propósito (ver 20260827125956): una vez
-- que alguien compartió lacomu.ar/handle/mi-pedido, cambiarlo rompe el
-- link. La regla estaba documentada y respetada por el trigger, pero nada
-- impedía un PATCH directo.
--
-- Supabase otorga UPDATE sobre la tabla completa a authenticated, y un
-- revoke de columna suelto no pisa ese grant (misma trampa que con
-- profiles.role y contributions.donor_email). Hay que revocar la tabla y
-- volver a otorgar solo las columnas que el dueño edita de verdad.
--
-- De paso quedan fuera id, owner_id, application_id y published_at: la
-- policy de RLS impide transferir la campaña a otra persona, pero nada
-- impedía reescribir el resto.
revoke update on public.campaigns from authenticated;

grant update (
  title,
  description,
  goal_amount,
  cover_image_url,
  status,
  updated_at
) on public.campaigns to authenticated;
