-- ============================================================================
-- TEMA DE LA INTERFAZ
--
-- La preferencia vive en el perfil, no en el navegador. Media plantilla usa el
-- CRM desde el movil y desde el ordenador, y que la aplicacion aparezca en
-- claro en uno y en oscuro en otro es exactamente lo que hace que la gente
-- piense que algo va mal.
--
-- Tres estados, no dos: «sistema» es el de serie porque el sistema operativo ya
-- sabe si es de noche, y un CRM de admisiones se abre a las tres de la manana
-- mas veces de las que nadie querria.
-- ============================================================================

create type tema_interfaz as enum ('claro', 'oscuro', 'sistema');

alter table perfiles
  add column if not exists tema tema_interfaz not null default 'sistema';

comment on column perfiles.tema is
  'Claro, oscuro o el del sistema. Se guarda en el perfil para que no cambie entre el movil y el ordenador.';
