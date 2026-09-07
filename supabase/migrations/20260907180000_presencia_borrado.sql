-- ============================================================================
-- AL CERRAR SESION, LA PRESENCIA SE VA CON ELLA
-- ============================================================================
--
-- Faltaba la politica de borrado. Cada uno podia marcar y actualizar su fila,
-- pero no quitarla, asi que al cerrar sesion la senal se quedaba viva hasta
-- caducar sola cinco minutos despues. Poca cosa, salvo que la pantalla dice
-- «quien esta dentro ahora mismo» y durante esos cinco minutos decia que si a
-- alguien que acababa de irse. Un dato que se sabe falso no se enseña.
--
-- Solo la propia, como las otras dos: nadie puede desconectar a un companero de
-- la lista.
-- ----------------------------------------------------------------------------
create policy presencia_propia_borrar on presencia_app for delete to authenticated
  using (perfil_id = auth.uid());

grant delete on presencia_app to authenticated;
