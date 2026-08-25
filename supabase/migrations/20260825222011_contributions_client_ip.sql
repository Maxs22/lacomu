-- /api/mp/create-preference es público a propósito (donar no requiere
-- login), así que cualquiera podía automatizar requests y llenar la
-- cuenta del beneficiario de checkouts, además de consumir cuota de
-- Supabase y de MP. Guardamos la IP para poder limitar por ventana.
--
-- Es un dato privado: la vista public_contributions no lo expone, y las
-- policies de select de contributions ya limitan quién ve la fila (el
-- donante y el dueño de la campaña) — igual conviene tenerlo presente al
-- agregar cualquier select nuevo.

alter table public.contributions
  add column client_ip text;

create index contributions_client_ip_created_at_idx
  on public.contributions (client_ip, created_at desc);
