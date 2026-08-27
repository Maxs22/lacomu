-- Borrar una cuenta fallaba con "Database error deleting user": hay cuatro
-- FKs a profiles sin ON DELETE, así que Postgres bloqueaba el borrado.
--
-- Esto era un incumplimiento real de /privacidad, que promete "escribinos
-- desde el email de tu cuenta y borramos tu perfil y tus campañas". La
-- promesa estaba escrita pero el schema no la permitía.
--
-- Criterio por columna, siguiendo lo que esa misma página dice:
--
--   * contributions.profile_id -> SET NULL. La página dice textualmente que
--     "los registros de donaciones ya concretadas los conservamos sin tus
--     datos personales, porque son el respaldo contable de plata que
--     efectivamente se movió entre terceros". Borrar la fila destruiría el
--     registro de una transferencia real a otra persona; anonimizarla es
--     exactamente lo prometido.
--
--   * campaign_applications.reviewed_by -> SET NULL. Es quién revisó, un
--     dato accesorio; si esa persona se va, la solicitud sigue siendo
--     válida.
--
--   * campaign_evidence.uploaded_by y campaign_updates.author_id -> CASCADE.
--     Son NOT NULL y cuelgan de una campaña que ya cascadea, así que no
--     tienen sentido sin su dueño.

alter table public.contributions
  drop constraint contributions_profile_id_fkey,
  add constraint contributions_profile_id_fkey
    foreign key (profile_id) references public.profiles (id) on delete set null;

alter table public.campaign_applications
  drop constraint campaign_applications_reviewed_by_fkey,
  add constraint campaign_applications_reviewed_by_fkey
    foreign key (reviewed_by) references public.profiles (id) on delete set null;

alter table public.campaign_evidence
  drop constraint campaign_evidence_uploaded_by_fkey,
  add constraint campaign_evidence_uploaded_by_fkey
    foreign key (uploaded_by) references public.profiles (id) on delete cascade;

alter table public.campaign_updates
  drop constraint campaign_updates_author_id_fkey,
  add constraint campaign_updates_author_id_fkey
    foreign key (author_id) references public.profiles (id) on delete cascade;

-- Al anonimizar una contribución también hay que soltar el email del
-- donante, que es el otro dato personal que queda en esa fila.
create function public.scrub_contribution_donor()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.profile_id is null and old.profile_id is not null then
    new.donor_email := null;
    new.donor_display_name := null;
    new.is_anonymous := true;
  end if;
  return new;
end;
$$;

create trigger contributions_scrub_donor
before update of profile_id on public.contributions
for each row execute procedure public.scrub_contribution_donor();
