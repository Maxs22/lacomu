-- Las dos migraciones Phase 2 anteriores ya están aplicadas. Esta corrección
-- es append-only: serializa decisiones que dependían de un COUNT/EXISTS para
-- que dos inserts concurrentes no puedan pasar ambos antes de verse.

create or replace function public.enforce_application_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  max_publicadas constant integer := 3;
  max_por_dia constant integer := 5;
  v_publicadas integer;
  v_recientes integer;
begin
  -- Todas las solicitudes de una persona comparten esta transacción lógica.
  -- El lock se libera al terminar el INSERT que dispara este trigger.
  perform pg_advisory_xact_lock(hashtext('application_limits:' || new.applicant_id::text));

  select count(*) into v_publicadas
  from public.campaigns
  where owner_id = new.applicant_id
    and status = 'published';

  if v_publicadas >= max_publicadas then
    raise exception
      'Ya tenés % pedidos abiertos. Cerrá alguno antes de crear otro.', max_publicadas;
  end if;

  select count(*) into v_recientes
  from public.campaign_applications
  where applicant_id = new.applicant_id
    and created_at > now() - interval '24 hours';

  if v_recientes >= max_por_dia then
    raise exception
      'Alcanzaste el límite de % pedidos por día. Probá de nuevo mañana.', max_por_dia;
  end if;

  return new;
end;
$$;

create or replace function public.set_campaign_slug()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  base text;
  candidato text;
  n integer := 1;
begin
  if new.slug is not null and new.slug <> '' then
    return new;
  end if;

  -- La URL es única por dueño; por eso el lock también lo es. Dos dueños
  -- distintos pueden generar el mismo slug sin bloquearse entre sí.
  perform pg_advisory_xact_lock(hashtext('campaign_slug:' || new.owner_id::text));

  base := trim(both '-' from left(public.slugify(new.title), 60));
  if base = '' then
    base := 'campana';
  end if;

  candidato := base;
  while exists (
    select 1 from public.campaigns
    where owner_id = new.owner_id
      and slug = candidato
  ) loop
    n := n + 1;
    candidato := base || '-' || n;
  end loop;

  new.slug := candidato;
  return new;
end;
$$;
