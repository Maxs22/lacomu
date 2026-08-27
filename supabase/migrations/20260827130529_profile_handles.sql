-- Cada persona pasa a tener un handle propio: lacomu.ar/maxsdev, y sus
-- pedidos viven adentro (lacomu.ar/maxsdev/necesito-un-taladro).
--
-- Se genera del email al registrarse para que nadie quede sin link por no
-- completar un paso, y se puede cambiar después desde el perfil.

alter table public.profiles
  add column handle text;

/**
 * Palabras que NO pueden ser un handle porque viven en la raíz del sitio.
 *
 * Sin esto, alguien que registre el handle "terminos" tendría un perfil
 * inalcanzable (Next da precedencia a la ruta estática) y de paso generaría
 * confusión sobre qué página es cuál. Se incluyen también rutas que todavía
 * no existen pero son previsibles, para no tener que migrar handles ya
 * compartidos el día que se agreguen.
 */
create table public.reserved_handles (handle text primary key);

insert into public.reserved_handles (handle) values
  -- rutas actuales
  ('api'), ('campanas'), ('como-funciona'), ('ingresar'),
  ('mis-solicitudes'), ('pedir-ayuda'), ('perfil'), ('privacidad'),
  ('terminos'),
  -- previsibles / infraestructura
  ('admin'), ('auth'), ('login'), ('logout'), ('registro'), ('signup'),
  ('cuenta'), ('ajustes'), ('configuracion'), ('ayuda'), ('soporte'),
  ('contacto'), ('acerca'), ('about'), ('blog'), ('faq'), ('legal'),
  ('cookies'), ('donar'), ('campana'), ('buscar'), ('explorar'),
  ('nuevo'), ('crear'), ('editar'), ('static'), ('assets'), ('public'),
  ('_next'), ('favicon'), ('icon'), ('robots'), ('sitemap'), ('og'),
  ('www'), ('mail'), ('email'), ('root'), ('null'), ('undefined'),
  ('lacomu'), ('spigcow')
on conflict do nothing;

alter table public.reserved_handles enable row level security;

-- Lectura pública: el formulario de perfil necesita poder avisar "ese
-- handle está reservado" antes de intentar guardar.
create policy "reserved_handles: lectura pública"
on public.reserved_handles for select
using (true);

grant select on public.reserved_handles to anon, authenticated;

/**
 * Valida forma y disponibilidad de un handle.
 *
 * Reglas: 3 a 30 caracteres, minúsculas, números y guiones, sin empezar
 * ni terminar con guión. Se rechazan los que parezcan un UUID para que un
 * handle nunca pueda hacerse pasar por un id.
 */
create function public.handle_is_valid(candidato text)
returns boolean
language sql
immutable
as $$
  select
    candidato ~ '^[a-z0-9]([a-z0-9-]{1,28})[a-z0-9]$'
    and candidato !~ '--'
    and candidato !~ '^[0-9a-f]{8}-[0-9a-f]{4}';
$$;

alter table public.profiles
  add constraint profiles_handle_format check (handle is null or public.handle_is_valid(handle));

/**
 * Asigna un handle libre a partir de un texto base (el email o el nombre).
 * Resuelve colisiones y reservadas con sufijo numérico.
 */
create function public.build_handle(base_text text)
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
  -- El formato exige 3 caracteres y no empezar con guión; si la base no
  -- alcanza (email de 2 letras, alfabeto no latino), se usa un fallback.
  if length(base) < 3 then
    base := 'persona';
  end if;

  candidato := base;
  while
    exists (select 1 from public.profiles where handle = candidato)
    or exists (select 1 from public.reserved_handles where handle = candidato)
    or not public.handle_is_valid(candidato)
  loop
    n := n + 1;
    candidato := base || '-' || n;
  end loop;

  return candidato;
end;
$$;

-- Backfill: a cada profile existente se le arma el handle desde su email.
do $$
declare
  fila record;
begin
  for fila in
    select p.id, u.email
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.handle is null
    order by p.created_at
  loop
    update public.profiles
    set handle = public.build_handle(fila.email)
    where id = fila.id;
  end loop;
end $$;

-- El trigger que crea el profile al registrarse ahora también pone handle.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url, handle)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url',
    public.build_handle(new.email)
  );
  return new;
end;
$$;

create unique index profiles_handle_key on public.profiles (handle);

/**
 * Impide que alguien se ponga un handle reservado al editar su perfil.
 * Va como trigger y no como CHECK porque un CHECK no puede consultar otra
 * tabla.
 */
create function public.reject_reserved_handle()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.handle is not null
     and exists (select 1 from public.reserved_handles where handle = new.handle) then
    raise exception 'handle reservado: %', new.handle
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger profiles_reject_reserved_handle
before insert or update of handle on public.profiles
for each row execute procedure public.reject_reserved_handle();

-- El usuario puede editar su propio handle (además de nombre y avatar).
grant update (full_name, avatar_url, handle) on public.profiles to authenticated;
