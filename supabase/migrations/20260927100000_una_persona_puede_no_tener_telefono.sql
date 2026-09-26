-- ============================================================================
-- UNA PERSONA PUEDE NO TENER TELEFONO
-- ============================================================================
--
-- El directorio exigia telefono, unico y en formato E.164. Tenia sentido
-- mientras todo el mundo llegaba por formulario o por telefono: el numero era
-- el dato minimo y la clave con la que se deduplica.
--
-- Con Instagram deja de serlo. Quien escribe por un mensaje directo no da un
-- telefono, y a menudo no lo dara nunca. Hoy esa persona simplemente NO PUEDE
-- existir en el directorio, y por eso los contactos de Metodo HOME viven fuera.
--
-- Se pedia que estuvieran todos en el CRM. Esto es lo que lo permite.
--
-- POR QUE AHORA Y NO EN ENERO. El plan era aplazarlo porque tocar la clave de
-- deduplicado con casos reales dentro no se deshace. Pero el directorio esta
-- VACIO: cero contactos. El argumento se quedo sin base, y hacerlo con la casa
-- vacia es lo mas barato que va a estar nunca.
--
-- QUE NO CAMBIA:
--
--   · `leads.telefono` sigue siendo obligatorio. Un caso comercial se trabaja
--     llamando: sin numero no hay caso que trabajar. Los contactos de Instagram
--     entran como PERSONAS, no como casos.
--   · El formato sigue validandose cuando hay numero. Lo que se admite es la
--     ausencia, no un numero mal escrito.
--   · Sigue sin poder haber dos personas con el mismo telefono. La unicidad
--     pasa a ser parcial: aplica cuando hay numero, y deja convivir a muchos
--     sin el.
-- ============================================================================

-- Sin numero: deja de ser obligatorio.
alter table contactos alter column telefono drop not null;

-- El formato, solo cuando hay algo que validar.
alter table contactos drop constraint contactos_telefono_check;
alter table contactos add constraint contactos_telefono_check
  check (telefono is null or telefono ~ '^\+[1-9]\d{6,14}$');

/*
 * La unicidad pasa a indice PARCIAL. Con la restriccion normal, dos personas
 * sin telefono chocarian entre si en cuanto hubiera mas de una —o peor, no:
 * en SQL dos NULL no son iguales, asi que la restriccion los habria dejado
 * pasar y habria dado una falsa sensacion de control. Se escribe explicito
 * para que se lea lo que hace: unico cuando hay numero, libre cuando no.
 */
alter table contactos drop constraint contactos_telefono_key;
create unique index idx_contactos_telefono_unico on contactos (telefono)
  where telefono is not null;

comment on column contactos.telefono is
  'Teléfono en E.164, o NULL. Que falte es normal en quien llega por Instagram: no hay número hasta que lo da. Único cuando existe.';
