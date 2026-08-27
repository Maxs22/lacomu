-- Las campañas se compartían como /campanas/<uuid>, que nadie puede
-- recordar ni dictar por teléfono. Se agrega un slug derivado del título.
--
-- El slug NO se recalcula si después se edita el título: una vez que
-- alguien compartió su link, cambiarlo lo rompería. Se genera una sola vez.

create extension if not exists unaccent;

/**
 * Convierte un título en slug: sin acentos, minúsculas, solo letras,
 * números y guiones. `unaccent` es lo que hace que "camión" no quede como
 * "cami-n" — sin eso, cualquier tilde o ñ se comía la letra.
 */
create function public.slugify(input text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select
    trim(both '-' from
      regexp_replace(
        regexp_replace(lower(unaccent(coalesce(input, ''))), '[^a-z0-9]+', '-', 'g'),
        '-{2,}', '-', 'g'
      )
    );
$$;

alter table public.campaigns
  add column slug text;

/**
 * Asigna el slug antes de insertar, si no vino uno.
 *
 * Resuelve colisiones con sufijo numérico (-2, -3, ...) en vez de fallar:
 * dos personas pueden pedir "necesito una notebook" con total legitimidad y
 * ninguna de las dos tiene que enterarse de que hubo un conflicto.
 *
 * Si el título no deja nada usable (por ejemplo, escrito entero en un
 * alfabeto que unaccent no mapea), cae a 'campana' como base para que
 * igual haya un slug válido.
 */
create function public.set_campaign_slug()
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
  while exists (select 1 from public.campaigns where slug = candidato) loop
    n := n + 1;
    candidato := base || '-' || n;
  end loop;

  new.slug := candidato;
  return new;
end;
$$;

create trigger campaigns_set_slug
before insert on public.campaigns
for each row execute procedure public.set_campaign_slug();

-- Backfill de las que ya existen. Se hace fila por fila para que el
-- contador de colisiones vea los slugs que se van asignando.
do $$
declare
  fila record;
  base text;
  candidato text;
  n integer;
begin
  for fila in select id, title from public.campaigns where slug is null order by created_at loop
    base := trim(both '-' from left(public.slugify(fila.title), 60));
    if base = '' then
      base := 'campana';
    end if;
    candidato := base;
    n := 1;
    while exists (select 1 from public.campaigns where slug = candidato) loop
      n := n + 1;
      candidato := base || '-' || n;
    end loop;
    update public.campaigns set slug = candidato where id = fila.id;
  end loop;
end $$;

alter table public.campaigns
  alter column slug set not null;

create unique index campaigns_slug_key on public.campaigns (slug);
