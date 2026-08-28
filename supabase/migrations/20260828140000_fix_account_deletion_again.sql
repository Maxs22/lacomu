-- Borrar una cuenta volvió a fallar con "Database error deleting user".
--
-- Es el mismo síntoma que arregló 20260827144831_allow_account_deletion,
-- pero por una FK distinta, y lo reintrodujo 20260827210000 sin querer.
--
-- La cadena:
--   auth.users --CASCADE--> profiles
--   profiles   --CASCADE--> campaign_applications
--   campaigns.application_id --NO ACTION--> campaign_applications  ← acá revienta
--
-- Antes esto no pasaba porque campaigns.owner_id era CASCADE: la campaña se
-- borraba junto con su solicitud y no quedaba nadie apuntando. Al pasar
-- owner_id a SET NULL para conservar el respaldo de pagos, la campaña
-- sobrevive — y queda referenciando una solicitud que se está borrando.
--
-- SET NULL es lo correcto acá: la solicitud es texto que escribió esa
-- persona y /privacidad promete borrarlo; la campaña se conserva anonimizada
-- porque es respaldo de plata que se movió entre terceros. El vínculo entre
-- las dos no puede sobrevivir a una de las puntas.
--
-- El índice único parcial campaigns_application_id_key es
-- `where application_id is not null`, así que varias campañas huérfanas con
-- null no chocan entre sí.
alter table public.campaigns
  drop constraint campaigns_application_id_fkey,
  add constraint campaigns_application_id_fkey
    foreign key (application_id) references public.campaign_applications (id)
    on delete set null;
