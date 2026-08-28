-- Los límites de publicación levantaban el error con
-- `errcode = 'check_violation'` (23514), que es el MISMO código que produce
-- cualquier CHECK de columna. El formulario no puede distinguir "llegaste al
-- tope de pedidos" de "el título quedó vacío", así que muestra el mensaje
-- genérico "probá de nuevo" — y a alguien que llegó a un límite eso lo manda
-- a reintentar para siempre.
--
-- Se deja el P0001 que `raise exception` usa por defecto: en esta tabla lo
-- produce únicamente este trigger, así que el cliente puede mostrar el texto
-- tal cual sabiendo que es un mensaje escrito para una persona.
--
-- (Esta función ya está aplicada en la base: la corrección va en una
-- migración nueva, no editando la anterior.)
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
