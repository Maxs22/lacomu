-- Bug real de una code review: como campaign_applications autopublica en
-- el mismo INSERT (ver auto_publish_no_review), para cuando el form subía
-- el banner y trataba de hacer UPDATE campaign_applications.cover_image_url,
-- la campaign YA se había creado con cover_image_url NULL — y ese UPDATE
-- ni siquiera tenía policy que lo permitiera (solo admins pueden update
-- de campaign_applications). La foto nunca llegaba a ningún lado.
--
-- Fix: subir el banner ANTES del insert, usando auth.uid() como carpeta
-- (igual que avatars) en vez del id de una application que todavía no
-- existe. El insert de campaign_applications ya incluye cover_image_url
-- desde el principio, así que el trigger lo copia bien a campaigns.

drop policy "campaign-banners: el solicitante sube su banner" on storage.objects;
drop policy "campaign-banners: el solicitante reemplaza su banner" on storage.objects;
drop policy "campaign-banners: el solicitante borra su banner" on storage.objects;

create policy "campaign-banners: el dueño sube su banner"
on storage.objects for insert
with check (
  bucket_id = 'campaign-banners'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "campaign-banners: el dueño reemplaza su banner"
on storage.objects for update
using (
  bucket_id = 'campaign-banners'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'campaign-banners'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "campaign-banners: el dueño borra su banner"
on storage.objects for delete
using (
  bucket_id = 'campaign-banners'
  and (storage.foldername(name))[1] = auth.uid()::text
);
