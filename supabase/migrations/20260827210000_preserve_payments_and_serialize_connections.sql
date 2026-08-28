-- Una llamada a MP puede haber creado una preference aunque el request haya
-- terminado en timeout. Esa incertidumbre no se puede resolver creando otra:
-- dos init_points cobrarían dos veces. Marcamos el intento ANTES de llamar a
-- MP para distinguir un claim abandonado de una llamada externa incierta.
alter table public.contributions
  add column mp_preference_attempted_at timestamptz;

alter table public.mp_connections
  add column checkout_claim_token uuid,
  add column checkout_claim_started_at timestamptz;

comment on column public.contributions.mp_preference_attempted_at is
  'Momento en que se inició una llamada externa para crear la preference. Si queda sin preference guardada, requiere recuperación/reconciliación, nunca una segunda creación automática.';

-- La reconexión OAuth no puede reemplazar credenciales mientras un checkout
-- está tomando una foto de esa conexión. El claim se toma antes de leer esta
-- fila; si la reconexión llegó primero, el checkout lee sus credenciales
-- nuevas. Si llegó después, esta función no actualiza nada y el usuario puede
-- reintentar la vinculación cuando termine el checkout.
create or replace function public.upsert_mp_connection_if_idle(
  p_profile_id uuid,
  p_mp_user_id text,
  p_access_token text,
  p_refresh_token text,
  p_public_key text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows integer;
begin
  insert into public.mp_connections (
    profile_id, mp_user_id, access_token, refresh_token, public_key, updated_at
  )
  select
    p_profile_id, p_mp_user_id, p_access_token, p_refresh_token, p_public_key, now()
  where not exists (
    select 1
    from public.mp_connections connection
    where connection.profile_id = p_profile_id
      and connection.checkout_claim_started_at > now() - interval '2 minutes'
  )
  on conflict (profile_id) do update
    set mp_user_id = excluded.mp_user_id,
        access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        public_key = excluded.public_key,
        updated_at = excluded.updated_at
    where mp_connections.checkout_claim_started_at is null
       or mp_connections.checkout_claim_started_at <= now() - interval '2 minutes';

  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

revoke all on function public.upsert_mp_connection_if_idle(uuid, text, text, text, text)
  from public, anon, authenticated;

create or replace function public.lock_mp_connection_for_checkout(
  p_profile_id uuid,
  p_contribution_id uuid,
  p_claim_token uuid
)
returns table (access_token text, refresh_token text, mp_user_id text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.contributions
    where id = p_contribution_id
      and mp_preference_claim_token = p_claim_token
  ) then
    return;
  end if;

  update public.mp_connections
  set checkout_claim_token = p_claim_token,
      checkout_claim_started_at = now()
  where profile_id = p_profile_id;

  return query
  select connection.access_token, connection.refresh_token, connection.mp_user_id
  from public.mp_connections connection
  where connection.profile_id = p_profile_id
    and connection.checkout_claim_token = p_claim_token;
end;
$$;

create or replace function public.release_mp_connection_checkout_lock(
  p_profile_id uuid,
  p_claim_token uuid
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.mp_connections
  set checkout_claim_token = null,
      checkout_claim_started_at = null
  where profile_id = p_profile_id
    and checkout_claim_token = p_claim_token;
$$;

revoke all on function public.lock_mp_connection_for_checkout(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.release_mp_connection_checkout_lock(uuid, uuid)
  from public, anon, authenticated;

-- El respaldo de pagos confirmados conserva su campaign_id para que los
-- retries de webhook y campaign_stats sigan siendo reconciliables. Al borrar
-- el perfil se anonima/cierra la campaña en vez de cascadear sus payments.
alter table public.campaigns
  alter column owner_id drop not null,
  drop constraint campaigns_owner_id_fkey,
  add constraint campaigns_owner_id_fkey
    foreign key (owner_id) references public.profiles (id) on delete set null;

create or replace function public.scrub_deleted_campaign_owner()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.owner_id is null and old.owner_id is not null then
    new.status := 'closed';
    new.title := 'Campaña eliminada';
    new.description := 'Esta campaña ya no está disponible.';
    new.cover_image_url := null;
  end if;
  return new;
end;
$$;

create trigger campaigns_scrub_deleted_owner
before update of owner_id on public.campaigns
for each row execute procedure public.scrub_deleted_campaign_owner();

alter table public.profiles
  add column deletion_started_at timestamptz;

create or replace function public.begin_account_deletion(p_profile_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform 1 from public.profiles where id = p_profile_id for update;
  if not found then return false; end if;

  if exists (
    select 1
    from public.contributions contribution
    join public.campaigns campaign on campaign.id = contribution.campaign_id
    where campaign.owner_id = p_profile_id
      and contribution.status = 'pending'
  ) then
    return false;
  end if;

  update public.profiles set deletion_started_at = now() where id = p_profile_id;
  return true;
end;
$$;

revoke all on function public.begin_account_deletion(uuid)
  from public, anon, authenticated;

-- NO se restaura la policy de insert público en contributions.
--
-- Esta migración venía recreando "contributions: cualquiera dona a una
-- campaña publicada" con un chequeo extra de deletion_started_at. Dos
-- razones para no hacerlo:
--
-- 1. No aplicaba. Esa policy se eliminó el 26/08 (ver
--    20260826180350_lock_contributions_writes_and_donor_email.sql) y el
--    `drop policy` sin `if exists` hacía fallar la migración entera.
--
-- 2. No protege lo que dice proteger. El único insert de contributions en
--    todo el código es /api/mp/create-preference, que usa el service role
--    y BYPASSA RLS: la policy no tiene efecto sobre el flujo de donación
--    real. Su único efecto neto sería volver a habilitar inserts directos
--    por PostgREST con la anon key —que es pública, va en el bundle del
--    cliente— salteándose rate limit, idempotencia y Mercado Pago. Es
--    exactamente el P0 que se cerró el 26/08.
--
-- Quien sí cubre el caso de borrado es el trigger de abajo, y lo cubre
-- mejor: los triggers también corren para el service role.

-- Defensa en profundidad: hoy RLS es lo único que separa a anon de escribir
-- en contributions, porque Supabase otorga INSERT de tabla completa por
-- defecto y nunca se revocó. Sin policy de insert no hay agujero, pero
-- alcanza con que alguien agregue una policy distraído para que lo haya.
revoke insert, update, delete on public.contributions from anon, authenticated;

-- Cierra la carrera con begin_account_deletion: si entra primero una
-- contribution, el borrado ve su pending; si entra primero el borrado, la
-- contribution espera y luego se rechaza. Va como trigger y no como policy
-- a propósito: el checkout usa el service role y las policies no lo tocan.
create or replace function public.guard_contribution_campaign_deletion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deletion_started_at timestamptz;
begin
  select profile.deletion_started_at into v_deletion_started_at
  from public.campaigns campaign
  join public.profiles profile on profile.id = campaign.owner_id
  where campaign.id = new.campaign_id
  for key share of profile;

  if v_deletion_started_at is not null then
    raise exception 'campaign owner deletion is in progress';
  end if;
  return new;
end;
$$;

create trigger contributions_block_deleting_campaign_owner
before insert on public.contributions
for each row execute procedure public.guard_contribution_campaign_deletion();
