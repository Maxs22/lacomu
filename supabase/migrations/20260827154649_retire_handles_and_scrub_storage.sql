-- Tres hallazgos de una review sobre la implementación de handles.

-- ---------------------------------------------------------------------
-- 1) Borrar una cuenta dejaba las fotos accesibles en Storage.
--
-- Las FKs ya cascadean las filas, pero los objetos de Storage no cuelgan
-- de ninguna FK: quedaban con su URL pública viva después de borrar el
-- perfil. Eso contradice /privacidad, que promete borrar los datos.
--
-- Borrar la fila de storage.objects es lo que hace inaccesible el objeto
-- (la API de Storage lee de ahí), así que un trigger alcanza.
-- ---------------------------------------------------------------------

create function public.scrub_profile_storage()
returns trigger
language plpgsql
security definer
set search_path = public, storage
as $$
begin
  -- Convención de paths: avatars/{uid}/... y campaign-banners/{uid}/...
  delete from storage.objects
  where bucket_id in ('avatars', 'campaign-banners')
    and (storage.foldername(name))[1] = old.id::text;
  return old;
end;
$$;

create trigger profiles_scrub_storage
before delete on public.profiles
for each row execute procedure public.scrub_profile_storage();

-- ---------------------------------------------------------------------
-- 2) Un handle liberado podía ser tomado por otra persona.
--
-- Si alguien renombra su handle o borra su cuenta, el anterior quedaba
-- libre. Un link ya compartido (lacomu.ar/maria) podía terminar mostrando
-- el perfil de otra persona — confuso en el mejor caso, suplantación en el
-- peor.
--
-- Se retiran de circulación. Además, si el handle se liberó por un
-- renombre, se guarda a quién pertenecía para poder redirigir el link
-- viejo al nuevo en vez de solo mostrar 404.
-- ---------------------------------------------------------------------

create table public.retired_handles (
  handle text primary key,
  -- A quién pertenecía. NULL si la cuenta se borró: ahí no hay a dónde
  -- redirigir, solo hay que impedir que otro lo tome.
  profile_id uuid references public.profiles (id) on delete set null,
  retired_at timestamptz not null default now()
);

alter table public.retired_handles enable row level security;

create policy "retired_handles: lectura pública"
on public.retired_handles for select
using (true);

grant select on public.retired_handles to anon, authenticated;

create function public.retire_previous_handle()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.handle is not null then
      insert into public.retired_handles (handle, profile_id)
      values (old.handle, null)
      on conflict (handle) do update set profile_id = null;
    end if;
    return old;
  end if;

  -- UPDATE: se retira el anterior y se apunta al perfil que lo dejó, para
  -- poder redirigir.
  if old.handle is not null and new.handle is distinct from old.handle then
    insert into public.retired_handles (handle, profile_id)
    values (old.handle, new.id)
    on conflict (handle) do update set profile_id = excluded.profile_id,
                                       retired_at = now();
    -- Si está retomando un handle que él mismo había liberado antes, se
    -- saca de la lista: es suyo de nuevo.
    delete from public.retired_handles where handle = new.handle;
  end if;

  return new;
end;
$$;

create trigger profiles_retire_handle
after update of handle on public.profiles
for each row execute procedure public.retire_previous_handle();

create trigger profiles_retire_handle_on_delete
before delete on public.profiles
for each row execute procedure public.retire_previous_handle();

-- Nadie puede tomar un handle retirado.
create or replace function public.reject_reserved_handle()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.handle is null then
    return new;
  end if;

  if exists (select 1 from public.reserved_handles where handle = new.handle) then
    raise exception 'handle reservado: %', new.handle
      using errcode = 'check_violation';
  end if;

  -- Retirado por OTRA persona. Si lo retiró este mismo perfil, puede
  -- retomarlo.
  if exists (
    select 1 from public.retired_handles r
    where r.handle = new.handle
      and (r.profile_id is null or r.profile_id <> new.id)
  ) then
    raise exception 'handle retirado: %', new.handle
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 3) Carrera al generar handles y slugs.
--
-- Ambas funciones hacían "buscar uno libre" y después insertar: dos altas
-- simultáneas podían elegir el mismo valor y una terminaba con
-- unique_violation (en el caso del handle, eso hace fallar el registro
-- entero).
--
-- Se toma un advisory lock sobre el candidato antes de comprobarlo. Dos
-- transacciones no pueden sostener el mismo lock, así que no pueden elegir
-- el mismo valor. El lock se libera al terminar la transacción.
-- ---------------------------------------------------------------------

create or replace function public.build_handle(base_text text)
returns text
language plpgsql
set search_path = public
as $$
declare
  base text;
  candidato text;
  n integer := 1;
begin
  base := left(public.slugify(split_part(coalesce(base_text, ''), '@', 1)), 24);
  base := trim(both '-' from base);
  if length(base) < 3 then
    base := 'persona';
  end if;

  candidato := base;
  loop
    -- Serializa la elección de ESTE candidato entre transacciones.
    perform pg_advisory_xact_lock(hashtext('handle:' || candidato));

    exit when
      public.handle_is_valid(candidato)
      and not exists (select 1 from public.profiles where handle = candidato)
      and not exists (select 1 from public.reserved_handles where handle = candidato)
      and not exists (select 1 from public.retired_handles where handle = candidato);

    n := n + 1;
    candidato := base || '-' || n;
  end loop;

  return candidato;
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

  base := trim(both '-' from left(public.slugify(new.title), 60));
  if base = '' then
    base := 'campana';
  end if;

  candidato := base;
  loop
    perform pg_advisory_xact_lock(hashtext('campaign-slug:' || candidato));
    exit when not exists (select 1 from public.campaigns where slug = candidato);
    n := n + 1;
    candidato := base || '-' || n;
  end loop;

  new.slug := candidato;
  return new;
end;
$$;
