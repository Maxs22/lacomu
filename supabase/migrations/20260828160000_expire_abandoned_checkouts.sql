-- Un checkout que la persona abandona o cancela NO genera ningún pago en
-- Mercado Pago. Sin pago no hay webhook, y sin webhook esa contribución
-- quedaba en 'pending' PARA SIEMPRE.
--
-- No es solo basura en el panel del beneficiario. `begin_account_deletion`
-- rechaza el borrado si la persona tiene contribuciones pendientes en sus
-- campañas: un checkout cancelado le bloqueaba el borrado de la cuenta sin
-- ninguna salida, que es justo lo que /privacidad promete que puede hacer.
--
-- Se expira a 'failed' y no a un estado nuevo por una razón concreta: la
-- regla de precedencia de settle_mp_payment (approved 3 > pending 2 >
-- failed 1) hace que esto sea REVERSIBLE. Si por lo que sea MP igual
-- aceptara un pago después, el webhook lo confirma y pisa el 'failed'. Un
-- estado terminal nuevo habría que enseñárselo a esa lógica; 'failed' ya
-- tiene la semántica correcta: "esta donación no ocurrió".

/**
 * Marca como caídos los checkouts que nadie completó.
 *
 * Las tres condiciones importan:
 *   - status 'pending'      → no tocar nada ya resuelto
 *   - mp_payment_id is null → si hay un pago asociado, lo resuelve el
 *                             webhook; acá no se adivina sobre plata
 *   - más viejo que la ventana → MP ya no lo acepta (la preference se crea
 *                             con expires/expiration_date_to a 24 h)
 *
 * La ventana es MÁS LARGA que la de la preference a propósito: primero
 * cierra MP, después limpiamos. Si limpiáramos antes, estaríamos marcando
 * como caído algo que todavía se puede pagar.
 */
create or replace function public.expire_stale_pending_contributions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  -- 24 h de la preference + 2 h de margen para webhooks demorados.
  ventana constant interval := interval '26 hours';
  v_expiradas integer;
begin
  update public.contributions
  set status = 'failed'
  where status = 'pending'
    and mp_payment_id is null
    and created_at < now() - ventana;

  get diagnostics v_expiradas = row_count;

  if v_expiradas > 0 then
    raise log 'expire_stale_pending_contributions: % contribuciones expiradas', v_expiradas;
  end if;

  return v_expiradas;
end;
$$;

revoke all on function public.expire_stale_pending_contributions()
  from public, anon, authenticated;

-- Se corre en la base y no como cron de Vercel: no hay endpoint HTTP que
-- proteger, no depende de que la app esté desplegada, y la invariante vive
-- en el mismo lugar que las demás.
create extension if not exists pg_cron;

select cron.schedule(
  'expirar-checkouts-abandonados',
  '*/30 * * * *',
  $$select public.expire_stale_pending_contributions();$$
);
