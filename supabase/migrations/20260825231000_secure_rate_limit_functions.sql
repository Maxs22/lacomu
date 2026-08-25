-- Las funciones nuevas reciben EXECUTE para PUBLIC por defecto en Postgres.
-- Como ambas son SECURITY DEFINER, solo el server con service role debe
-- invocarlas: el browser no puede elegir buckets, ventanas ni límites.
revoke execute on function public.bump_rate_limit(text, integer, integer)
  from public, anon, authenticated;

revoke execute on function public.prune_rate_limit_buckets()
  from public, anon, authenticated;

grant execute on function public.bump_rate_limit(text, integer, integer)
  to service_role;

grant execute on function public.prune_rate_limit_buckets()
  to service_role;
