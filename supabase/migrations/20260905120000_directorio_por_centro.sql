-- ============================================================================
-- EL DIRECTORIO DE CONTACTOS ESTABA ABIERTO A TODO EL EQUIPO COMERCIAL
--
-- La politica de EDICION de `contactos` ya estaba limitada por centro —solo
-- puedes editar a quien participa en un caso tuyo— pero la de LECTURA era
-- simplemente `mi_rol() = 'admisiones'`. Escribir estaba controlado; leer, no.
--
-- Consecuencia: un comercial que no ve NI UN caso de Horizonte podia listar
-- el nombre y el telefono de todas las personas del sistema, incluidas las
-- que solo existen por un caso de Horizonte. Y Horizonte esta restringido a
-- una sola persona del equipo por decision del negocio.
--
-- Comprobado: sesion de equipo@test.com (Eclipse + Bellamar + bandeja).
--   ¿ve el caso de Horizonte?   no
--   ¿lo encuentra por telefono? no
--   ¿ve el CONTACTO?            SI  -> {"nombre":"...","telefono":"+34..."}
--   contactos visibles:         9 de 9
--
-- Para un grupo de centros de adicciones, esa lista —quien ha contactado y
-- con que numero— es el dato mas sensible que se guarda. Mas que los emails
-- de marketing, porque incluye a todo el mundo.
--
-- La regla 5 dice que la persona es GLOBAL, y lo sigue siendo: la
-- deduplicacion cruza centros y la hace el servidor. Lo que cambia es quien
-- puede NAVEGAR el directorio, que es cosa distinta.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Quien metio a cada persona.
--
-- Ademas de valer para la auditoria, cubre el hueco de un contacto que existe
-- pero todavia no esta vinculado a ningun caso: quien lo creo tiene que poder
-- verlo mientras termina de vincularlo.
-- ----------------------------------------------------------------------------
alter table contactos
  add column if not exists created_by uuid references perfiles (id) on delete set null;

comment on column contactos.created_by is
  'Quien dio de alta a esta persona. Null = la creo una importacion o la ingesta web.';

-- Buscar los casos de un contacto era un escaneo: la clave unica de
-- lead_contactos indexa (lead_id, contacto_id), que no sirve para preguntar
-- solo por contacto_id. Ahora la politica lo pregunta en cada fila.
create index if not exists idx_lead_contactos_contacto on lead_contactos (contacto_id);

-- ----------------------------------------------------------------------------
-- 2. La regla, en un solo sitio.
--
-- Security definer para que la comprobacion no vuelva a pasar por las
-- politicas de `leads` y entre en recursion.
-- ----------------------------------------------------------------------------
create or replace function puedo_ver_contacto(p_contacto uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    es_direccion()
    or exists (select 1 from contactos c where c.id = p_contacto and c.created_by = auth.uid())
    or exists (
      select 1
      from lead_contactos lc
      join leads l on l.id = lc.lead_id
      where lc.contacto_id = p_contacto
        and l.centro_id in (select mis_centros())
    );
$$;

revoke execute on function puedo_ver_contacto(uuid) from public, anon;
grant execute on function puedo_ver_contacto(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Las tres lecturas que estaban abiertas.
-- ----------------------------------------------------------------------------
drop policy if exists contactos_admisiones_leer on contactos;
create policy contactos_admisiones_leer on contactos for select to authenticated
  using (mi_rol() = 'admisiones' and puedo_ver_contacto(id));

-- Una etiqueta sobre una persona («objecion-precio», «cliente») dice algo de
-- ella: hereda la misma visibilidad.
drop policy if exists contacto_etiquetas_admisiones_leer on contacto_etiquetas;
create policy contacto_etiquetas_admisiones_leer on contacto_etiquetas for select to authenticated
  using (mi_rol() = 'admisiones' and puedo_ver_contacto(contacto_id));

drop policy if exists contacto_etiquetas_admisiones_borrar on contacto_etiquetas;
create policy contacto_etiquetas_admisiones_borrar on contacto_etiquetas for delete to authenticated
  using (mi_rol() = 'admisiones' and puedo_ver_contacto(contacto_id));

drop policy if exists lista_contactos_admisiones_leer on lista_contactos;
create policy lista_contactos_admisiones_leer on lista_contactos for select to authenticated
  using (mi_rol() = 'admisiones' and puedo_ver_contacto(contacto_id));

drop policy if exists lista_contactos_admisiones_borrar on lista_contactos;
create policy lista_contactos_admisiones_borrar on lista_contactos for delete to authenticated
  using (mi_rol() = 'admisiones' and puedo_ver_contacto(contacto_id));

-- ----------------------------------------------------------------------------
-- 4. Y la creacion, que estaba sin condicion ninguna.
--
-- Un comercial podia insertar contactos a discrecion. Ahora tiene que firmar
-- lo que crea, que es lo que luego le deja verlo.
-- ----------------------------------------------------------------------------
drop policy if exists contactos_admisiones_crear on contactos;
create policy contactos_admisiones_crear on contactos for insert to authenticated
  with check (mi_rol() = 'admisiones' and (created_by is null or created_by = auth.uid()));
