-- Un doble click o un retry de red en /api/mp/create-preference podía
-- generar dos contributions + dos preferences para la misma intención de
-- donar (P1 de review). El cliente genera una idempotency_key una sola
-- vez por formulario; el server la usa para devolver el mismo checkout en
-- vez de cobrar dos veces.

alter table public.contributions
  add column idempotency_key text unique,
  add column mp_init_point text;
