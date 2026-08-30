-- ============================================================================
-- ALERTAS AUTOMÁTICAS Y RESUMEN DIARIO
--
-- El motor de alertas se ejecuta periódicamente y vuelve a mirar los mismos
-- casos una y otra vez. Sin una clave de unicidad acabaría avisando del mismo
-- lead cada media hora, así que cada aviso lleva la suya y se inserta con
-- `on conflict do nothing`.
-- ============================================================================

alter table notificaciones add column if not exists clave text;

create unique index if not exists idx_notificaciones_clave
  on notificaciones (clave)
  where clave is not null;

-- Índices para el barrido del motor: leads sin primera respuesta y tareas vencidas.
create index if not exists idx_leads_sin_primera_respuesta
  on leads (created_at)
  where primera_respuesta_at is null;

create index if not exists idx_tareas_vencidas
  on tareas (vence_at)
  where completada_at is null;

create index if not exists idx_presupuestos_propuestos
  on presupuestos (created_at)
  where estado = 'propuesto';

-- Parámetro nuevo: a quién y cuándo se le manda el resumen diario.
insert into configuracion (clave, valor, descripcion) values
  (
    'resumen_diario_hora',
    '"08:00"',
    'Hora (Europe/Madrid) a la que se envia el resumen diario a direccion'
  )
on conflict (clave) do nothing;
