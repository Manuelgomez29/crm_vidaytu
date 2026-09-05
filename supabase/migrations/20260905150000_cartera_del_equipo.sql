-- ============================================================================
-- QUE TIENE CADA PERSONA ASIGNADO
--
-- Antes de dar de baja a alguien hay que saber que se queda colgando. Hasta
-- ahora la unica herramienta movia casos, asi que las tareas pendientes, las
-- citas futuras y los pacientes de quien se iba desaparecian de la vista de
-- todos sin que saltara ningun aviso. Un terapeuta no tiene casos: no se movia
-- nada de lo suyo.
--
-- Se cuenta en la base y no en la aplicacion para no traerse cuatro tablas
-- enteras a memoria solo para contarlas.
--
-- SECURITY DEFINER porque cruza las dos areas —casos y pacientes— y ninguna
-- persona sola puede leer ambas. El filtro `es_direccion()` es lo que impide
-- que eso se convierta en una puerta: para cualquier otro rol no devuelve
-- filas, ni siquiera las suyas.
-- ============================================================================

create or replace function cartera_del_equipo()
returns table (
  perfil_id uuid,
  casos bigint,
  tareas_pendientes bigint,
  citas_futuras bigint,
  pacientes bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    (select count(*) from leads l where l.propietario_id = p.id),
    (select count(*) from tareas t
       where t.responsable_id = p.id and t.completada_at is null),
    (select count(*) from citas c
       where c.profesional_id = p.id and c.inicio > now()),
    (select count(*) from pacientes pa where pa.terapeuta_id = p.id)
  from perfiles p
  where es_direccion();
$$;

comment on function cartera_del_equipo() is
  'Recuento de lo VIVO asignado a cada persona, para el traspaso antes de una baja. Solo devuelve filas a direccion.';

revoke all on function cartera_del_equipo() from public, anon;
grant execute on function cartera_del_equipo() to authenticated;
