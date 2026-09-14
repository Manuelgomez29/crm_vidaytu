-- ============================================================================
-- «HE OLVIDADO MI CONTRASEÑA»
-- ============================================================================
--
-- No existia. Quien no podia entrar dependia de que otra persona con mando le
-- reenviara el enlace desde Administracion -> Equipo, y eso se sostiene
-- mientras haya DOS direcciones: el dia que solo quede una, esa persona no
-- tiene a quien pedirselo. Es exactamente donde acabamos de quedarnos al
-- borrar las cuentas de prueba.
--
-- La pantalla nueva es publica, asi que trae dos cosas de la base:
--
-- 1. UN LIMITE PROPIO. No vale el del login. Pedir enlace manda un correo, y
--    los correos los manda Supabase con su propia cuota: sin freno, cualquiera
--    puede gastarla apuntando a una cuenta real —y de paso llenarle el buzon a
--    esa persona—. Va mas apretado que el login (3 por cuenta y hora) porque
--    nadie necesita pedir el enlace tres veces en una hora, y porque el coste
--    de equivocarse es esperar, no quedarse fuera: el enlace anterior sigue
--    valiendo.
--
-- 2. UNA ETAPA EN EL REGISTRO DE ACCESOS. Pedir recuperar una contraseña es un
--    hecho de seguridad, y ademas de los interesantes: varias peticiones
--    seguidas contra la misma cuenta es lo que se ve ANTES de un intento de
--    robo de cuenta por correo. El registro solo admitia 'clave', '2fa' y
--    'salida', asi que una fila de recuperacion ni siquiera se podia escribir.
-- ============================================================================

alter table accesos drop constraint if exists accesos_etapa_check;
alter table accesos add constraint accesos_etapa_check
  check (etapa in ('clave', '2fa', 'salida', 'recuperacion'));

comment on column accesos.etapa is
  'Momento del acceso: «clave» = paso de contraseña · «2fa» = segundo factor · «salida» = cierre de sesión · «recuperacion» = ha pedido el enlace para volver a entrar.';

-- Los limites viven en `configuracion` y se editan sin desplegar (regla 13).
-- `||` fusiona: si dirección ya había ajustado los suyos, no se le pisan.
update configuracion
set valor = valor || '{
  "recuperar_por_cuenta": { "maximo": 3,  "ventana": 3600 },
  "recuperar_por_ip":     { "maximo": 10, "ventana": 3600 }
}'::jsonb
where clave = 'limites_peticiones';

insert into configuracion (clave, valor, descripcion)
select
  'limites_peticiones',
  '{
     "recuperar_por_cuenta": { "maximo": 3,  "ventana": 3600 },
     "recuperar_por_ip":     { "maximo": 10, "ventana": 3600 }
   }'::jsonb,
  'Cuántas peticiones se admiten por ventana de tiempo, para cada cosa expuesta.'
where not exists (select 1 from configuracion where clave = 'limites_peticiones');
