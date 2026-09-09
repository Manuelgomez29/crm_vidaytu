-- ============================================================================
-- EL CERROJO DEL ALCANCE NO PUEDE CERRARLE LA PUERTA AL PROPIO SERVIDOR
-- ============================================================================
--
-- El trigger que impide ascenderse a uno mismo miraba `manda_en_grupo()`, que
-- se apoya en `auth.uid()`. Con la clave de servicio —que es como el panel de
-- administracion crea y edita usuarios— no hay `auth.uid()`, asi que devolvia
-- falso y el trigger rechazaba el cambio.
--
-- Resultado: nadie podia cambiarle el rol a nadie desde el panel. Ni el CEO. Se
-- colo porque ninguna comprobacion tocaba esa accion: la prueba del alcance
-- ataca por PostgREST con la sesion del usuario, que es por donde vendria un
-- ataque, y por ahi el trigger funcionaba perfecto. El camino legitimo no lo
-- miraba nadie.
--
-- Lo que hace este cerrojo es impedir que alguien se ascienda A SI MISMO con su
-- propia sesion, saltandose la aplicacion. Para eso tiene que dejar pasar al
-- servidor, y la comprobacion de quien puede tocar el rol y el alcance vive
-- donde debe: en la accion, que sabe quien la ha llamado.
-- ----------------------------------------------------------------------------

create or replace function fn_guard_alcance()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  quien text;
begin
  quien := coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '');

  /*
   * El servidor de la aplicacion (clave de servicio) y las conexiones directas
   * a la base —migraciones, mantenimiento— pasan. Quien tiene la clave de
   * servicio ya puede hacer cualquier cosa: fingir que no seria teatro.
   */
  if quien = 'service_role' or quien = '' then
    return new;
  end if;

  if (new.alcance is distinct from old.alcance or new.rol is distinct from old.rol)
     and not manda_en_grupo() then
    raise exception 'Solo la direccion de grupo puede cambiar el rol o el alcance de un perfil';
  end if;

  return new;
end;
$$;
