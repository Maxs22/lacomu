-- La migración anterior definió dos nombres de policy que superan los 63
-- bytes que soporta un identificador en Postgres (por los acentos), así
-- que quedaron truncados en el nombre real ("...está public"). Acá se
-- buscan por prefijo (sin asumir en qué byte exacto se cortó) y se
-- renombran a algo corto y sin ambigüedad. La definición de la policy no
-- cambia, solo el nombre.

do $$
declare
  old_name text;
begin
  select policyname into old_name
  from pg_policies
  where schemaname = 'public'
    and tablename = 'campaign_evidence'
    and policyname like 'campaign_evidence: lectura%';

  if old_name is not null then
    execute format(
      'alter policy %I on public.campaign_evidence rename to %I',
      old_name,
      'campaign_evidence: lectura si publicada'
    );
  end if;

  select policyname into old_name
  from pg_policies
  where schemaname = 'public'
    and tablename = 'campaign_updates'
    and policyname like 'campaign_updates: lectura%';

  if old_name is not null then
    execute format(
      'alter policy %I on public.campaign_updates rename to %I',
      old_name,
      'campaign_updates: lectura si publicada'
    );
  end if;
end $$;
