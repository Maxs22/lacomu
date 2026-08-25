-- Credenciales de Mercado Pago por beneficiario (OAuth Marketplace). Esto
-- es lo que permite que la plata vaya DIRECTO al beneficiario y lacomu no
-- custodie fondos (ver AGENTS.md).
--
-- A propósito no hay NINGUNA policy de select/insert/update para
-- authenticated/anon: access_token y refresh_token son credenciales
-- privilegiadas, no datos de perfil. Solo el service role (server-side,
-- en las rutas de OAuth callback / creación de preference / webhook) puede
-- tocar esta tabla. RLS habilitada sin policies = nadie más entra, ni
-- siquiera el propio dueño con su sesión normal.

create table public.mp_connections (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  mp_user_id text not null,
  access_token text not null,
  refresh_token text,
  public_key text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.mp_connections enable row level security;

-- contributions necesita poder registrar el pago cuando el webhook lo
-- confirma, y necesita relacionarse con la preference creada.
alter table public.contributions
  add column mp_preference_id text;
