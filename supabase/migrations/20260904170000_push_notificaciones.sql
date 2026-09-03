-- ============================================================================
-- Marca de envio push en las notificaciones.
--
-- Sin ella, cada pasada del motor reenviaria al movil todo lo que siga sin
-- leer: la persona recibiria la misma alerta cada quince minutos hasta que
-- abriera la aplicacion, que es la forma mas rapida de que desactive los
-- avisos para siempre.
-- ============================================================================

alter table notificaciones
  add column if not exists push_enviado_at timestamptz;

create index if not exists idx_notificaciones_sin_push
  on notificaciones (created_at)
  where push_enviado_at is null;
