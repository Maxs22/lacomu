-- Fase 2 (segunda parte): límites de publicación y alcance del slug.
--
-- Las campañas se publican solas, sin revisión — esa es una regla de
-- producto, no un descuido. Pero "sin revisión" no es lo mismo que "sin
-- límite": hoy una cuenta con un email descartable puede publicar campañas
-- ilimitadas al instante y llenar el feed. Limitar el VOLUMEN no es juzgar
-- el motivo del pedido, que es lo que lacomu no hace.

/**
 * Límites por persona. Están acá arriba a propósito: son una decisión de
 * producto, no una constante técnica, y se van a querer ajustar cuando
 * haya uso real.
 */
create or replace function public.enforce_application_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Campañas publicadas al mismo tiempo por la misma persona.
  max_publicadas constant integer := 3;
  -- Solicitudes creadas en las últimas 24 horas.
  max_por_dia constant integer := 5;
  v_publicadas integer;
  v_recientes integer;
begin
  select count(*) into v_publicadas
  from public.campaigns
  where owner_id = new.applicant_id
    and status = 'published';

  if v_publicadas >= max_publicadas then
    raise exception
      'Ya tenés % pedidos abiertos. Cerrá alguno antes de crear otro.', max_publicadas
      using errcode = 'check_violation';
  end if;

  select count(*) into v_recientes
  from public.campaign_applications
  where applicant_id = new.applicant_id
    and created_at > now() - interval '24 hours';

  if v_recientes >= max_por_dia then
    raise exception
      'Alcanzaste el límite de % pedidos por día. Probá de nuevo mañana.', max_por_dia
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- Va como trigger y no como policy: el formulario podría pasar a usar el
-- service role, y el service role bypassa RLS pero no los triggers.
create trigger campaign_applications_enforce_limits
before insert on public.campaign_applications
for each row execute procedure public.enforce_application_limits();

-- Una solicitud no puede producir más de una campaña. Hoy el único camino
-- para que el trigger de aprobación corra dos veces es un UPDATE de status,
-- que RLS reserva a admins y no hay admins — pero eso es una barrera de
-- permisos, no una invariante de datos. El índice sí lo es.
create unique index campaigns_application_id_key
  on public.campaigns (application_id)
  where application_id is not null;

-- El slug pasa a ser único POR PERSONA, no global.
--
-- La URL canónica es /{handle}/{slug} y se busca por las dos cosas juntas,
-- así que la unicidad global nunca hizo falta: solo generaba sufijos feos.
-- Dos personas pidiendo "necesito una notebook" con total legitimidad
-- terminaban una con "-2" sin razón visible.
drop index public.campaigns_slug_key;

create unique index campaigns_owner_slug_key
  on public.campaigns (owner_id, slug);

-- El generador tiene que contar colisiones con el mismo alcance que el
-- índice: si sigue mirando todos los slugs, vuelve a poner sufijos que ya
-- no hacen falta.
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

  base := left(public.slugify(new.title), 60);
  base := trim(both '-' from base);
  if base = '' then
    base := 'campana';
  end if;

  candidato := base;
  while exists (
    select 1 from public.campaigns
    where owner_id is not distinct from new.owner_id
      and slug = candidato
  ) loop
    n := n + 1;
    candidato := base || '-' || n;
  end loop;

  new.slug := candidato;
  return new;
end;
$$;
