-- Fase 2 de la auditoría: privacidad e integridad de datos en la base.
--
-- Todo lo de acá ya estaba respetado por el código. El punto es que dejara
-- de depender de que el código lo respete: una validación que solo vive en
-- el cliente no es una garantía, es una convención.

-- 1) Donación anónima: que sea imposible, no solo improbable.
--
-- El grant de columna deja a authenticated leer donor_display_name, y el
-- dueño de la campaña tiene policy para leer sus contributions. Hoy no hay
-- filtración porque create-preference guarda null cuando is_anonymous, pero
-- eso es una línea de TypeScript: alcanza con que un path futuro se olvide.
-- Con el CHECK, una donación anónima con nombre no puede existir.
alter table public.contributions
  add constraint contributions_anonymous_has_no_name check (
    not is_anonymous or donor_display_name is null
  ),
  add constraint contributions_donor_display_name_length check (
    donor_display_name is null or char_length(donor_display_name) <= 80
  );

-- 2) El handle no puede quedar en null.
--
-- authenticated tiene grant de UPDATE sobre handle y el check de formato
-- era `handle is null or handle_is_valid(handle)`: un PATCH con handle=null
-- pasaba, y esa persona quedaba con el perfil y sus URLs canónicas rotas
-- aunque la UI no permita el campo vacío.
--
-- No hay ventana en la que el handle sea null legítimamente: el trigger
-- handle_new_user lo asigna en el insert y retire_previous_handle solo
-- corre cuando cambia a otro valor.
alter table public.profiles
  alter column handle set not null;

alter table public.profiles
  add constraint profiles_full_name_length check (
    full_name is null or char_length(full_name) <= 60
  );

-- 3) Texto no vacío y longitudes máximas, alineadas con el formulario
--    (título 80, descripción 2000). Sin esto, un POST directo a PostgREST
--    publica una campaña con título vacío o con 10 MB de texto.
--
-- Se valida sobre el texto recortado: un título de puros espacios está
-- igual de vacío que uno sin caracteres.
alter table public.campaign_applications
  add constraint campaign_applications_title_not_blank check (btrim(title) <> ''),
  add constraint campaign_applications_title_length check (char_length(title) <= 80),
  add constraint campaign_applications_description_not_blank check (btrim(description) <> ''),
  add constraint campaign_applications_description_length check (char_length(description) <= 2000);

-- Las campañas nacen del trigger de applications, pero el service role
-- también inserta directo: el constraint va en las dos tablas.
alter table public.campaigns
  add constraint campaigns_title_not_blank check (btrim(title) <> ''),
  add constraint campaigns_title_length check (char_length(title) <= 80),
  add constraint campaigns_description_not_blank check (btrim(description) <> ''),
  add constraint campaigns_description_length check (char_length(description) <= 2000);

alter table public.campaign_items
  add constraint campaign_items_description_not_blank check (btrim(description) <> ''),
  add constraint campaign_items_description_length check (char_length(description) <= 200);

alter table public.campaign_updates
  add constraint campaign_updates_content_not_blank check (btrim(content) <> ''),
  add constraint campaign_updates_content_length check (char_length(content) <= 5000);

-- 4) anon deja de tener privilegios de escritura.
--
-- Supabase otorga INSERT/UPDATE/DELETE de tabla completa a anon y
-- authenticated por defecto. Hoy no es explotable porque todas las policies
-- exigen auth.uid() y para anon es null — pero eso significa que RLS es lo
-- ÚNICO que separa a una clave pública (la anon key va en el bundle del
-- cliente) de escribir en profiles.role, campaigns.slug o campaign_stats.
-- Alcanza una policy distraída para que deje de haber barrera.
--
-- anon no necesita escribir en ninguna tabla: donar pasa por el service
-- role en create-preference, y todo lo demás requiere sesión.
do $$
declare
  fila record;
begin
  for fila in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  loop
    execute format(
      'revoke insert, update, delete, truncate, references on public.%I from anon',
      fila.relname
    );
  end loop;
end $$;
