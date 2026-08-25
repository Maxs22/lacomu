-- Decisión de producto: no hay revisión manual. Cada usuario publica
-- directo lo que quiera pedir, sin aprobación de admin.
--
-- `campaign_applications` sigue existiendo como registro de lo que cada
-- usuario cargó (útil si el día de mañana hace falta reconstruir historial
-- o meter una moderación posterior), pero ahora nace ya "approved" y el
-- trigger existente (handle_application_approved) la publica al toque,
-- en el mismo insert.

alter table public.campaign_applications
  alter column status set default 'approved';

drop trigger if exists on_application_approved on public.campaign_applications;

-- old.status es NULL en un INSERT, y NULL IS DISTINCT FROM 'approved' es
-- true, así que la condición del trigger dispara igual sin tocar la
-- función: no hace falta duplicar lógica para el caso insert vs update.
create trigger on_application_approved
after insert or update on public.campaign_applications
for each row execute procedure public.handle_application_approved();
