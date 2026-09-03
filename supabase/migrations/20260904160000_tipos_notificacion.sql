-- ============================================================================
-- Tipos de aviso nuevos (fases 2 y 3).
--
-- En su propia migracion: un valor de enum no se puede usar en la misma
-- transaccion en la que se anade.
-- ============================================================================

alter type tipo_notificacion add value if not exists 'riesgo_recaida';
alter type tipo_notificacion add value if not exists 'seguimiento_post_alta';
alter type tipo_notificacion add value if not exists 'campana_finalizada';
alter type tipo_notificacion add value if not exists 'mensaje_chat';
