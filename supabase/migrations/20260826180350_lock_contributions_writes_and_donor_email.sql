-- P0 (1): la policy de insert público en contributions permitía que
-- cualquiera con la anon key insertara filas directo por PostgREST,
-- saltándose el rate limit, la idempotencia y Mercado Pago por completo —
-- basura en la base y en el dashboard del beneficiario.
--
-- La única inserción legítima la hace /api/mp/create-preference con el
-- service role (verificado: es el único insert en todo el código), así que
-- sacar la policy no rompe ningún flujo. Sin policy de insert, nadie más
-- que el service role puede escribir.

drop policy "contributions: cualquiera dona a una campaña publicada" on public.contributions;

-- P0 (2): donor_email quedaba legible por el dueño de la campaña, porque
-- su policy de select autoriza la FILA COMPLETA (RLS es a nivel de fila,
-- no de columna). AGENTS.md dice que ese dato no se expone.
--
-- Mismo mecanismo que con profiles.role: hay que revocar el privilegio de
-- tabla completa y volver a otorgar solo las columnas seguras — un revoke
-- de columna suelto no pisa el grant de tabla que Supabase da por defecto.
--
-- Se aprovecha para dejar afuera también las columnas internas del flujo
-- de pago (idempotency_key, init_point, el token del claim): no le sirven
-- a nadie del lado del cliente y solo amplían superficie.
revoke select on public.contributions from anon, authenticated;

grant select (
  id,
  campaign_id,
  profile_id,
  donor_display_name,
  is_anonymous,
  amount,
  currency,
  status,
  created_at,
  confirmed_at,
  mp_payment_id
) on public.contributions to anon, authenticated;
