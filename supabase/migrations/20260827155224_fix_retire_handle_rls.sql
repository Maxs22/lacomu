-- Renombrar el handle fallaba con "new row violates row-level security
-- policy for table retired_handles": el trigger inserta en esa tabla, que
-- tiene RLS y solo policy de SELECT, y corría con los permisos del usuario.
--
-- Se pasa a SECURITY DEFINER. Acá sí alcanza (a diferencia del intento con
-- storage.objects) porque `retired_handles` la creamos nosotros y su dueño
-- es `postgres`: el dueño de una tabla bypassa su propia RLS.
--
-- A propósito NO se agrega una policy de INSERT para `authenticated`:
-- retirar un handle es una consecuencia del sistema, no algo que el usuario
-- deba poder escribir por su cuenta (podría retirar handles ajenos).

create or replace function public.retire_previous_handle()
returns trigger
language plpgsql
security definer
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

  if old.handle is not null and new.handle is distinct from old.handle then
    insert into public.retired_handles (handle, profile_id)
    values (old.handle, new.id)
    on conflict (handle) do update set profile_id = excluded.profile_id,
                                       retired_at = now();
    -- Si está retomando uno que él mismo había liberado, sale de la lista.
    delete from public.retired_handles where handle = new.handle;
  end if;

  return new;
end;
$$;

-- El que valida también consulta retired_handles; con RLS de por medio
-- necesita el mismo tratamiento, si no un handle retirado le resultaría
-- invisible y dejaría pasar el que debía rechazar.
create or replace function public.reject_reserved_handle()
returns trigger
language plpgsql
security definer
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
