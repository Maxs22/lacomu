-- 1) Fencing token para el claim de creación de preference.
--
-- El TTL por sí solo no prueba que el proceso anterior haya muerto: si el
-- que ganó el claim sigue vivo pero su llamada a MP tarda más que el TTL,
-- otro request puede retomarlo y ambos terminan escribiendo. El token
-- permite que solo el dueño ACTUAL del claim persista su resultado
-- (UPDATE ... WHERE claim_token = <el mío>) — el rezagado descubre que ya
-- no es dueño y no pisa nada.

alter table public.contributions
  add column mp_preference_claim_token uuid;

-- 2) La IP del donante se saca de contributions.
--
-- El dueño de la campaña puede leer sus contributions enteras por RLS, y
-- la IP es un dato personal que no necesita para operar. Se mueve a una
-- tabla aparte con RLS habilitada y SIN policies: igual que mp_connections,
-- solo el service role la toca (el rate limit corre server-side).

create table public.contribution_client_ips (
  contribution_id uuid primary key references public.contributions (id) on delete cascade,
  client_ip text not null,
  created_at timestamptz not null default now()
);

alter table public.contribution_client_ips enable row level security;

create index contribution_client_ips_ip_created_at_idx
  on public.contribution_client_ips (client_ip, created_at desc);

-- Migrar lo que hubiera (en la práctica todavía no hay datos reales) y
-- eliminar la columna expuesta.
insert into public.contribution_client_ips (contribution_id, client_ip, created_at)
select id, client_ip, created_at
from public.contributions
where client_ip is not null
on conflict (contribution_id) do nothing;

drop index if exists public.contributions_client_ip_created_at_idx;

alter table public.contributions
  drop column client_ip;
