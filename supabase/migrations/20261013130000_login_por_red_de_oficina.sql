-- =============================================================================
-- Más margen de inicios de sesión por red, para el primer día del equipo.
-- =============================================================================
--
-- El límite por IP cuenta TODOS los inicios de sesión, también los buenos (si
-- solo contara los fallos, el propio contador le diría a un atacante cuándo ha
-- acertado). Pero todo el equipo entra desde la misma red del centro, móviles
-- incluidos, y el primer día hay contraseñas mal escritas y códigos de doble
-- factor repetidos: treinta en un cuarto de hora se alcanzan sin que haya
-- nadie atacando, y entonces no entra nadie.
--
-- Se sube a sesenta. El freno contra la fuerza bruta es el límite POR CUENTA
-- (diez cada cuarto de hora), que no cambia: probar contraseñas contra una
-- cuenta sigue cortándose igual.

update configuracion
set valor = jsonb_set(valor, '{login_por_ip}', '{"maximo": 60, "ventana": 900}'::jsonb)
where clave = 'limites_peticiones'
  and (valor -> 'login_por_ip' ->> 'maximo')::int < 60;
