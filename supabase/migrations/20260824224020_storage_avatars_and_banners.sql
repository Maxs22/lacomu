-- Storage para avatar de profile y banner (cover) de campaign.
-- Convención de paths (importa para las policies de abajo):
--   avatars/{auth.uid()}/{filename}
--   campaign-banners/{campaign_id}/{filename}

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('campaign-banners', 'campaign-banners', true)
on conflict (id) do nothing;

-- =========================================================================
-- avatars: el primer segmento del path tiene que ser el propio auth.uid()
-- =========================================================================

create policy "avatars: lectura pública"
on storage.objects for select
using (bucket_id = 'avatars');

create policy "avatars: el dueño sube su propio avatar"
on storage.objects for insert
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "avatars: el dueño reemplaza su propio avatar"
on storage.objects for update
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "avatars: el dueño borra su propio avatar"
on storage.objects for delete
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- =========================================================================
-- campaign-banners: el primer segmento del path tiene que ser el id de una
-- campaign cuyo owner_id sea el usuario autenticado.
-- =========================================================================

create policy "campaign-banners: lectura pública"
on storage.objects for select
using (bucket_id = 'campaign-banners');

create policy "campaign-banners: el dueño de la campaña sube su banner"
on storage.objects for insert
with check (
  bucket_id = 'campaign-banners'
  and exists (
    select 1 from public.campaigns
    where campaigns.id::text = (storage.foldername(name))[1]
      and campaigns.owner_id = auth.uid()
  )
);

create policy "campaign-banners: el dueño reemplaza su banner"
on storage.objects for update
using (
  bucket_id = 'campaign-banners'
  and exists (
    select 1 from public.campaigns
    where campaigns.id::text = (storage.foldername(name))[1]
      and campaigns.owner_id = auth.uid()
  )
)
with check (
  bucket_id = 'campaign-banners'
  and exists (
    select 1 from public.campaigns
    where campaigns.id::text = (storage.foldername(name))[1]
      and campaigns.owner_id = auth.uid()
  )
);

create policy "campaign-banners: el dueño borra su banner"
on storage.objects for delete
using (
  bucket_id = 'campaign-banners'
  and exists (
    select 1 from public.campaigns
    where campaigns.id::text = (storage.foldername(name))[1]
      and campaigns.owner_id = auth.uid()
  )
);
