-- Se saca el trigger que intentaba borrar los objetos de Storage al borrar
-- un profile: NO funciona, y verificado empíricamente (se subió un avatar,
-- se borró la cuenta, el archivo siguió ahí y accesible).
--
-- Motivo: `storage.objects` tiene RLS y pertenece a
-- `supabase_storage_admin`. Un SECURITY DEFINER cuyo dueño es `postgres` no
-- la bypassa, así que el DELETE matchea 0 filas SIN dar error. Un trigger
-- que falla en silencio es peor que no tener nada: parece protección y no
-- la es.
--
-- El borrado de archivos se hace desde la aplicación con la API de Storage
-- y el service role, que sí tiene permiso — ver scripts/borrar-cuenta.mjs,
-- probado. La política de privacidad dice que el borrado se pide por email,
-- así que es una operación de operador, no un flujo automático del usuario.

drop trigger if exists profiles_scrub_storage on public.profiles;
drop function if exists public.scrub_profile_storage();
