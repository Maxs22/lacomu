-- El banner se sube al momento de la SOLICITUD (campaign_applications),
-- antes de que exista una fila real en campaigns. Corrige las policies de
-- storage que habían quedado apuntando a campaigns.owner_id, y agrega el
-- campo para guardar esa URL en la solicitud.

alter table public.campaign_applications
  add column cover_image_url text;

drop policy if exists "campaign-banners: el dueño de la campaña sube su banner" on storage.objects;
drop policy if exists "campaign-banners: el dueño reemplaza su banner" on storage.objects;
drop policy if exists "campaign-banners: el dueño borra su banner" on storage.objects;

create policy "campaign-banners: el solicitante sube su banner"
on storage.objects for insert
with check (
  bucket_id = 'campaign-banners'
  and exists (
    select 1 from public.campaign_applications
    where campaign_applications.id::text = (storage.foldername(name))[1]
      and campaign_applications.applicant_id = auth.uid()
  )
);

create policy "campaign-banners: el solicitante reemplaza su banner"
on storage.objects for update
using (
  bucket_id = 'campaign-banners'
  and exists (
    select 1 from public.campaign_applications
    where campaign_applications.id::text = (storage.foldername(name))[1]
      and campaign_applications.applicant_id = auth.uid()
  )
)
with check (
  bucket_id = 'campaign-banners'
  and exists (
    select 1 from public.campaign_applications
    where campaign_applications.id::text = (storage.foldername(name))[1]
      and campaign_applications.applicant_id = auth.uid()
  )
);

create policy "campaign-banners: el solicitante borra su banner"
on storage.objects for delete
using (
  bucket_id = 'campaign-banners'
  and exists (
    select 1 from public.campaign_applications
    where campaign_applications.id::text = (storage.foldername(name))[1]
      and campaign_applications.applicant_id = auth.uid()
  )
);

-- Al aprobar una solicitud (status -> 'approved'), se crea automáticamente
-- la campaña real. Esto es intencional a nivel DB: no importa si la
-- aprobación la hace el panel de admin (paso 9, todavía no existe) o se
-- hace a mano por SQL mientras tanto — el invariante "aprobada implica
-- campaña publicada" se cumple siempre.
create function public.handle_application_approved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    insert into public.campaigns (
      application_id, owner_id, title, description, goal_amount,
      cover_image_url, status, published_at
    )
    values (
      new.id, new.applicant_id, new.title, new.description, new.goal_amount,
      new.cover_image_url, 'published', now()
    );
  end if;
  return new;
end;
$$;

create trigger on_application_approved
after update on public.campaign_applications
for each row execute procedure public.handle_application_approved();
