-- Las views creadas por postgres funcionan como SECURITY DEFINER por
-- defecto y pueden bypassar RLS. public_contributions era una proyección
-- segura, pero igual dejaba esa superficie abierta. Las tarjetas solo
-- necesitan totales, no filas de contribuciones, así que los materializamos
-- en una tabla sin datos de donantes.
drop view if exists public.public_contributions;

create table public.campaign_stats (
  campaign_id uuid primary key references public.campaigns (id) on delete cascade,
  raised_amount numeric(12, 2) not null default 0 check (raised_amount >= 0),
  contributors_count integer not null default 0 check (contributors_count >= 0),
  updated_at timestamptz not null default now()
);

-- Conserva los totales de pagos confirmados anteriores a esta migración.
insert into public.campaign_stats (campaign_id, raised_amount, contributors_count)
select campaign_id, coalesce(sum(amount), 0), count(*)
from public.contributions
where status = 'confirmed'
group by campaign_id;

alter table public.campaign_stats enable row level security;

create policy "campaign_stats: lectura pública si la campaña está publicada"
on public.campaign_stats for select
using (
  exists (
    select 1 from public.campaigns
    where campaigns.id = campaign_stats.campaign_id
      and campaigns.status = 'published'
  )
);

grant select on public.campaign_stats to anon, authenticated;
