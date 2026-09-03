-- ============================================================================
-- FASE 4 (1/2): el rol de administracion economica
--
-- Va en su propia migracion porque un valor nuevo de enum no se puede USAR en
-- la misma transaccion en la que se anade. La siguiente migracion ya lo emplea
-- en las politicas de facturacion.
-- ============================================================================

alter type rol_usuario add value if not exists 'administracion';
