-- La migración anterior (REVOKE UPDATE (role)) no alcanzaba: Supabase ya
-- le había dado a `authenticated` un GRANT UPDATE de tabla completa sobre
-- profiles al crearla (cubre todas las columnas), y un revoke column-level
-- no pisa un grant table-level preexistente. Se verificó con un smoke
-- test que el usuario TODAVÍA podía auto-promoverse a admin después de esa
-- migración.
--
-- Fix real: revocar el UPDATE de tabla completa, y regrantear solo las
-- columnas que un usuario debería poder tocar de su propio profile.

revoke update on public.profiles from authenticated;

grant update (full_name, avatar_url) on public.profiles to authenticated;
