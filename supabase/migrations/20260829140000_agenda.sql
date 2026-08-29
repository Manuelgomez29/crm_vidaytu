-- ============================================================================
-- AGENDA DE CITAS
--
-- El terapeuta ve SOLO sus citas y, de ellas, solo el nombre y el teléfono del
-- lead (regla 14). No tiene ninguna política sobre `leads`, así que un join
-- normal le devolvería nulos: la agenda se sirve con una función security
-- definer que expone exactamente esos dos campos y nada más.
-- ============================================================================

create index if not exists idx_citas_inicio on citas (inicio);

-- Plantilla del recordatorio: discreta por obligación (regla 12). Vive en
-- `configuracion` para que dirección pueda cambiarla sin tocar código.
insert into configuracion (clave, valor, descripcion) values (
  'plantilla_recordatorio_cita',
  '"Hola {nombre}, te confirmamos tu cita el {dia} a las {hora} en {lugar}. Un saludo, {profesional}"',
  'Texto del recordatorio de cita. JAMAS debe mencionar adicciones ni motivos clinicos. Marcadores: {nombre} {dia} {hora} {lugar} {profesional}'
) on conflict (clave) do nothing;

-- ---------------------------------------------------------------------------
-- agenda_citas(desde, hasta): citas visibles para quien pregunta.
--   direccion  → todas
--   admisiones → las de sus centros
--   terapeuta  → solo aquellas en las que es el profesional
-- ---------------------------------------------------------------------------
create or replace function agenda_citas(desde timestamptz, hasta timestamptz)
returns table (
  id uuid,
  lead_id uuid,
  lead_nombre text,
  lead_telefono text,
  centro_id uuid,
  centro_nombre text,
  profesional_id uuid,
  profesional_nombre text,
  contacto_id uuid,
  contacto_nombre text,
  contacto_telefono text,
  tipo tipo_cita,
  modalidad_cita modalidad_cita,
  inicio timestamptz,
  fin timestamptz,
  estado estado_cita,
  notas text
)
language sql stable security definer set search_path = public
as $$
  select
    c.id,
    c.lead_id,
    l.nombre as lead_nombre,
    l.telefono as lead_telefono,
    c.centro_id,
    ce.nombre as centro_nombre,
    c.profesional_id,
    p.nombre as profesional_nombre,
    c.contacto_id,
    co.nombre as contacto_nombre,
    co.telefono as contacto_telefono,
    c.tipo,
    c.modalidad_cita,
    c.inicio,
    c.fin,
    c.estado,
    -- Las notas de la cita pueden contener detalle comercial: el terapeuta no las ve.
    case when mi_rol() = 'terapeuta' then null else c.notas end as notas
  from citas c
  join leads l on l.id = c.lead_id
  join centros ce on ce.id = c.centro_id
  join perfiles p on p.id = c.profesional_id
  left join contactos co on co.id = c.contacto_id
  where c.inicio >= desde
    and c.inicio < hasta
    and (
      es_direccion()
      or (mi_rol() = 'admisiones' and c.centro_id in (select mis_centros()))
      or (mi_rol() = 'terapeuta' and c.profesional_id = auth.uid())
    )
  order by c.inicio;
$$;

grant execute on function agenda_citas(timestamptz, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- profesionales_agendables(): a quién se le puede poner una cita, con aviso de
-- ausencia. Admisiones necesita ver a los terapeutas aunque no compartan centro.
-- ---------------------------------------------------------------------------
create or replace function profesionales_agendables()
returns table (id uuid, nombre text, rol rol_usuario)
language sql stable security definer set search_path = public
as $$
  select p.id, p.nombre, p.rol
  from perfiles p
  where p.activo
    and p.rol in ('terapeuta', 'admisiones', 'direccion')
    and (es_direccion() or mi_rol() = 'admisiones')
  order by p.rol, p.nombre;
$$;

grant execute on function profesionales_agendables() to authenticated;

-- ---------------------------------------------------------------------------
-- profesional_disponible(): ¿la franja cae dentro de su disponibilidad y fuera
-- de sus ausencias? Devuelve un aviso, nunca bloquea (regla 6: avisos, no muros).
-- ---------------------------------------------------------------------------
create or replace function aviso_disponibilidad(
  p_profesional uuid,
  p_inicio timestamptz,
  p_fin timestamptz
)
returns text
language plpgsql stable security definer set search_path = public
as $$
declare
  v_dia smallint;
  v_hora_inicio time;
  v_hora_fin time;
  v_tiene_franja boolean;
  v_ausente boolean;
  v_solapa boolean;
begin
  -- El negocio opera en Europe/Madrid: la franja se compara en hora local.
  v_dia := extract(dow from (p_inicio at time zone 'Europe/Madrid'))::smallint;
  v_hora_inicio := (p_inicio at time zone 'Europe/Madrid')::time;
  v_hora_fin := (p_fin at time zone 'Europe/Madrid')::time;

  select exists (
    select 1 from disponibilidad d
    where d.perfil_id = p_profesional
      and d.dia_semana = v_dia
      and d.hora_inicio <= v_hora_inicio
      and d.hora_fin >= v_hora_fin
  ) into v_tiene_franja;

  select exists (
    select 1 from ausencias a
    where a.perfil_id = p_profesional
      and (p_inicio at time zone 'Europe/Madrid')::date between a.desde and a.hasta
  ) into v_ausente;

  select exists (
    select 1 from citas c
    where c.profesional_id = p_profesional
      and c.estado in ('programada', 'realizada')
      and c.inicio < p_fin
      and c.fin > p_inicio
  ) into v_solapa;

  if v_ausente then
    return 'El profesional está de baja o vacaciones ese día.';
  elsif v_solapa then
    return 'Ya tiene otra cita que se solapa con esa franja.';
  elsif not v_tiene_franja then
    return 'La franja queda fuera de su disponibilidad habitual.';
  end if;
  return null;
end;
$$;

grant execute on function aviso_disponibilidad(uuid, timestamptz, timestamptz) to authenticated;
