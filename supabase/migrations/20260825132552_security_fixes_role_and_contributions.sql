-- Fixes de una code review externa (dos P0 reales, un P2):
--
-- 1) profiles.role era editable por el propio usuario a través de la
--    policy genérica de update (RLS es a nivel de fila, no de columna —
--    permitir el update de la fila permitía cualquier columna, incluido
--    role). Se bloquea a nivel de columna con REVOKE, que sí opera por
--    columna y se combina con la RLS existente sin tocarla.
--
-- 2) La policy de insert de contributions no forzaba status = 'pending',
--    así que un cliente podía insertar una donación directo como
--    'confirmed' sin pasar por Mercado Pago. Se agrega esa condición al
--    with check.
--
-- 3) Sin unique en mp_payment_id / mp_preference_id, un mismo pago podía
--    terminar asociado a más de una contribution por error o reintento.

revoke update (role) on public.profiles from authenticated;

drop policy "contributions: cualquiera dona a una campaña publicada" on public.contributions;

create policy "contributions: cualquiera dona a una campaña publicada"
on public.contributions for insert
with check (
  status = 'pending'
  and (profile_id is null or profile_id = auth.uid())
  and exists (
    select 1 from public.campaigns
    where campaigns.id = contributions.campaign_id
      and campaigns.status = 'published'
  )
);

alter table public.contributions
  add constraint contributions_mp_payment_id_key unique (mp_payment_id);

alter table public.contributions
  add constraint contributions_mp_preference_id_key unique (mp_preference_id);
