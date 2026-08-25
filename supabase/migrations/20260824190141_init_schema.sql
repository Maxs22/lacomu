-- MiComu — esquema inicial del MVP
-- Entidades: profiles, campaign_applications, campaigns, campaign_items,
-- campaign_evidence, campaign_updates, contributions.
-- RLS activado desde el día uno en todas las tablas (ver AGENTS.md).

-- =========================================================================
-- profiles
-- =========================================================================

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'user' check (role in ('user', 'admin')),
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Un profile por auth.users. role distingue admin (aprueba campañas) de user.';

-- Se crea automáticamente al registrarse (auth.users insert).
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;

create policy "profiles: lectura pública"
on public.profiles for select
using (true);

create policy "profiles: cada usuario edita su propio profile"
on public.profiles for update
using (auth.uid() = id)
with check (auth.uid() = id);

-- =========================================================================
-- campaign_applications
-- Solicitud para crear una campaña. Requiere aprobación de un admin antes
-- de convertirse en una fila de `campaigns`. El criterio de aprobación es
-- legitimidad/anti-fraude, no si el motivo "merece" ayuda (ver AGENTS.md).
-- =========================================================================

create table public.campaign_applications (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  description text not null,
  goal_amount numeric(12, 2) check (goal_amount is null or goal_amount > 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.campaign_applications enable row level security;

create policy "campaign_applications: el solicitante lee las propias"
on public.campaign_applications for select
using (auth.uid() = applicant_id);

create policy "campaign_applications: los admins leen todas"
on public.campaign_applications for select
using (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  )
);

create policy "campaign_applications: usuarios logueados crean la propia"
on public.campaign_applications for insert
with check (auth.uid() = applicant_id);

create policy "campaign_applications: solo admins aprueban o rechazan"
on public.campaign_applications for update
using (
  exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  )
);

-- =========================================================================
-- campaigns
-- Campaña publicada. Se crea a partir de una campaign_application aprobada.
-- =========================================================================

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references public.campaign_applications (id),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  description text not null,
  goal_amount numeric(12, 2) check (goal_amount is null or goal_amount > 0),
  cover_image_url text,
  status text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.campaigns enable row level security;

create policy "campaigns: lectura pública si está publicada"
on public.campaigns for select
using (status = 'published');

create policy "campaigns: el dueño lee las propias sin importar el estado"
on public.campaigns for select
using (auth.uid() = owner_id);

create policy "campaigns: el dueño actualiza su propia campaña"
on public.campaigns for update
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

-- No hay policy de insert para usuarios: las campañas nacen de una
-- campaign_application aprobada, ese paso lo hace el backend admin con
-- service role (bypassa RLS a propósito, es una operación de sistema).

-- =========================================================================
-- campaign_items
-- Desglose de en qué se va a usar la plata (transparencia).
-- =========================================================================

create table public.campaign_items (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  description text not null,
  amount numeric(12, 2) check (amount is null or amount > 0),
  created_at timestamptz not null default now()
);

alter table public.campaign_items enable row level security;

create policy "campaign_items: lectura pública si la campaña está publicada"
on public.campaign_items for select
using (
  exists (
    select 1 from public.campaigns
    where campaigns.id = campaign_items.campaign_id
      and (campaigns.status = 'published' or campaigns.owner_id = auth.uid())
  )
);

create policy "campaign_items: el dueño de la campaña administra sus items"
on public.campaign_items for all
using (
  exists (
    select 1 from public.campaigns
    where campaigns.id = campaign_items.campaign_id
      and campaigns.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.campaigns
    where campaigns.id = campaign_items.campaign_id
      and campaigns.owner_id = auth.uid()
  )
);

-- =========================================================================
-- campaign_evidence
-- Comprobantes/fotos que suba el beneficiario para mostrar en qué se usó
-- la plata recibida (transparencia post-donación).
-- =========================================================================

create table public.campaign_evidence (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  uploaded_by uuid not null references public.profiles (id),
  file_url text not null,
  description text,
  created_at timestamptz not null default now()
);

alter table public.campaign_evidence enable row level security;

create policy "campaign_evidence: lectura pública si la campaña está publicada"
on public.campaign_evidence for select
using (
  exists (
    select 1 from public.campaigns
    where campaigns.id = campaign_evidence.campaign_id
      and (campaigns.status = 'published' or campaigns.owner_id = auth.uid())
  )
);

create policy "campaign_evidence: el dueño de la campaña sube evidencia"
on public.campaign_evidence for insert
with check (
  auth.uid() = uploaded_by
  and exists (
    select 1 from public.campaigns
    where campaigns.id = campaign_evidence.campaign_id
      and campaigns.owner_id = auth.uid()
  )
);

-- =========================================================================
-- campaign_updates
-- Posts de novedades del beneficiario contando el progreso.
-- =========================================================================

create table public.campaign_updates (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.campaign_updates enable row level security;

create policy "campaign_updates: lectura pública si la campaña está publicada"
on public.campaign_updates for select
using (
  exists (
    select 1 from public.campaigns
    where campaigns.id = campaign_updates.campaign_id
      and (campaigns.status = 'published' or campaigns.owner_id = auth.uid())
  )
);

create policy "campaign_updates: el dueño de la campaña publica novedades"
on public.campaign_updates for insert
with check (
  auth.uid() = author_id
  and exists (
    select 1 from public.campaigns
    where campaigns.id = campaign_updates.campaign_id
      and campaigns.owner_id = auth.uid()
  )
);

-- =========================================================================
-- contributions
-- Donaciones. Donar NO requiere login (ver AGENTS.md), por eso profile_id
-- y donor_email son nullable. donor_email nunca se expone públicamente —
-- solo sirve para asociar retroactivamente si esa persona crea cuenta
-- después con el mismo email (ver public_contributions más abajo).
-- =========================================================================

create table public.contributions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  profile_id uuid references public.profiles (id),
  donor_email text,
  donor_display_name text,
  is_anonymous boolean not null default false,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null default 'ARS',
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'failed')),
  mp_payment_id text,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

alter table public.contributions enable row level security;

create policy "contributions: cualquiera dona a una campaña publicada"
on public.contributions for insert
with check (
  (profile_id is null or profile_id = auth.uid())
  and exists (
    select 1 from public.campaigns
    where campaigns.id = contributions.campaign_id
      and campaigns.status = 'published'
  )
);

create policy "contributions: el donante lee las propias"
on public.contributions for select
using (auth.uid() = profile_id);

create policy "contributions: el dueño de la campaña lee todas las suyas"
on public.contributions for select
using (
  exists (
    select 1 from public.campaigns
    where campaigns.id = contributions.campaign_id
      and campaigns.owner_id = auth.uid()
  )
);

-- No hay policy de update para usuarios autenticados: confirmar el pago
-- (status, mp_payment_id, confirmed_at) lo hace el webhook de Mercado Pago
-- server-side con la service role key, a propósito bypassando RLS.

-- Vista pública segura: nunca expone donor_email, y respeta is_anonymous.
-- Es lo que se usa para mostrar "quién ayudó" en el frontend público.
--
-- A propósito NO lleva security_invoker: las policies de `contributions`
-- solo dejan leer al donante o al dueño de la campaña, y acá el objetivo
-- es exactamente lo contrario — exponer una proyección redactada a
-- cualquiera (anon incluido), sin exponer donor_email ni filas no
-- confirmadas. La vista corre con los permisos del owner (bypassa esas
-- policies a propósito), pero solo puede devolver las columnas que están
-- listadas explícitamente acá.
create view public.public_contributions
as
select
  c.id,
  c.campaign_id,
  c.amount,
  c.currency,
  c.status,
  c.created_at,
  case when c.is_anonymous then null else c.donor_display_name end as donor_display_name,
  case when c.is_anonymous then null else c.profile_id end as profile_id
from public.contributions c
join public.campaigns camp on camp.id = c.campaign_id
where c.status = 'confirmed'
  and camp.status = 'published';

grant select on public.public_contributions to anon, authenticated;
