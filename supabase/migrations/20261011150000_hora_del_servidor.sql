-- ============================================================================
-- LA HORA LA PONE EL SERVIDOR
-- ============================================================================
--
-- La marca de agua de los flujos («hasta donde he mirado») se escribia con el
-- reloj de la aplicacion, y los `created_at` con los que se compara los pone el
-- reloj de la base. Son dos relojes. Lo cazo la prueba: una persona etiquetada
-- ANTES de activar el flujo entro igualmente, porque la base iba unos segundos
-- por delante y su etiqueta parecia posterior a la marca.
--
-- Para comparar con la base hay que preguntarle la hora a la base. Esto es solo
-- eso: `now()` expuesto como funcion, para que la aplicacion no vuelva a usar el
-- suyo donde importa.
-- ============================================================================

create or replace function hora_del_servidor()
returns timestamptz
language sql stable
as $$
  select now();
$$;

revoke execute on function hora_del_servidor() from public, anon;
grant execute on function hora_del_servidor() to authenticated, service_role;
