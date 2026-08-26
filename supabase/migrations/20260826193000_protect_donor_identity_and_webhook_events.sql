-- RLS controla filas, no columnas. El dueño de una campaña puede leer sus
-- contributions para su panel, pero no necesita conocer el perfil de quien
-- eligió donar de forma anónima. Tampoco hace falta publicar ese UUID.
revoke select on public.contributions from anon, authenticated;

grant select (
  id,
  campaign_id,
  donor_display_name,
  is_anonymous,
  amount,
  currency,
  status,
  created_at,
  confirmed_at,
  mp_payment_id
) on public.contributions to anon, authenticated;

-- CREATE OR REPLACE no permite sacar columnas de una vista. La vista solo
-- alimenta estadísticas públicas y no tiene dependientes, así que se recrea
-- sin profile_id.
drop view public.public_contributions;

create view public.public_contributions
as
select
  c.id,
  c.campaign_id,
  c.amount,
  c.currency,
  c.status,
  c.created_at,
  case when c.is_anonymous then null else c.donor_display_name end as donor_display_name
from public.contributions c
join public.campaigns camp on camp.id = c.campaign_id
where c.status = 'confirmed'
  and camp.status = 'published';

grant select on public.public_contributions to anon, authenticated;

-- MP puede notificar varias veces un mismo pago y, si una Preference se
-- duplica externamente, puede notificar pagos distintos para la misma
-- contribution. Guardamos cada pago para nunca pisar el primero ni perder
-- mismatches que requieren reconciliación manual.
create table public.mp_webhook_events (
  payment_id text primary key,
  contribution_id uuid not null references public.contributions (id) on delete cascade,
  payment_status text not null,
  reconciliation_status text not null check (
    reconciliation_status in ('settled', 'duplicate', 'mismatch')
  ),
  received_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index mp_webhook_events_contribution_id_idx
  on public.mp_webhook_events (contribution_id);

alter table public.mp_webhook_events enable row level security;
