-- Los buckets se habían creado sin límite de tipo ni de tamaño: un
-- usuario autenticado podía alojar archivos arbitrarios (y enormes) bajo
-- su propia carpeta. Solo se suben fotos, así que se restringe a
-- imágenes y a 5 MB.

update storage.buckets
set
  file_size_limit = 5242880, -- 5 MB
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
where id in ('avatars', 'campaign-banners');

comment on column public.contributions.mp_preference_claim_started_at is
  'Lock para serializar la creación de la preference en MP entre requests concurrentes. Se considera vencido pasados unos minutos (ver create-preference) para que un request interrumpido no deje la donación trabada para siempre.';
