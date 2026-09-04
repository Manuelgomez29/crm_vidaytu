-- ============================================================================
-- PROCESOS DE VENTA PROPIOS (regla 6)
--
-- La regla dice que direccion Y LOS COMERCIALES crean procesos de venta con
-- sus propias etapas. Lo que habia:
--
--   · Las tablas y el mapeo a estado de sistema, bien.
--   · El kanban sabe cambiar de proceso.
--   · Pero la pantalla para crearlos estaba en Administracion, que es solo de
--     direccion: un comercial tenia permiso de INSERT en la base de datos y
--     ninguna forma de usarlo. Y no tenia UPDATE, asi que aunque hubiera
--     creado uno no habria podido ni renombrarlo.
--   · Y sobre todo: NINGUN caso podia cambiar de proceso. Se asignaba al
--     crearlo y ya. Un proceso nuevo nacia vacio y se quedaba vacio.
--
-- Se abre la creacion, pero con una cerradura nueva.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. CUAL RECIBE LOS CASOS NUEVOS.
--
-- Hasta ahora se elegia "el primero que encaje, por antiguedad". Con los
-- comerciales creando procesos eso es una trampa: el dia que alguien cree uno
-- para un centro que no tenia el suyo, TODOS los leads nuevos de ese centro
-- empiezan a caer ahi sin que nadie lo haya decidido.
--
-- Ahora es explicito. Crear procesos es libre; decidir cual recibe la entrada
-- del centro es de direccion.
-- ----------------------------------------------------------------------------
alter table pipelines
  add column if not exists es_predeterminado boolean not null default false;

comment on column pipelines.es_predeterminado is
  'El que recibe los casos nuevos de su centro (o del grupo, si centro_id es null). Solo direccion lo cambia.';

-- Uno por centro, y uno global. El indice parcial deja que haya muchos
-- procesos y solo uno marcado.
create unique index if not exists idx_pipeline_predeterminado_centro
  on pipelines (centro_id) where es_predeterminado and centro_id is not null;

create unique index if not exists idx_pipeline_predeterminado_global
  on pipelines ((1)) where es_predeterminado and centro_id is null;

-- El que ya existia se queda como predeterminado del grupo: sin esto, tras
-- esta migracion no habria ninguno y las altas fallarian.
update pipelines
   set es_predeterminado = true
 where centro_id is null
   and activo
   and id = (select id from pipelines where centro_id is null and activo order by created_at limit 1);

-- ----------------------------------------------------------------------------
-- 2. LA CERRADURA: quien puede marcar el predeterminado.
--
-- No basta con no ensenar el control en pantalla. Un comercial con UPDATE
-- sobre su propio proceso podria marcarlo predeterminado por la API y
-- redirigir la entrada de todo un centro.
-- ----------------------------------------------------------------------------
create or replace function fn_guard_predeterminado()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.es_predeterminado is distinct from old.es_predeterminado
     and not es_direccion()
     and auth.uid() is not null then
    raise exception 'Solo direccion decide que proceso recibe los casos nuevos';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pipelines_predeterminado on pipelines;
create trigger trg_pipelines_predeterminado
  before update on pipelines
  for each row execute function fn_guard_predeterminado();

-- Y al crear: nadie nace predeterminado por su cuenta.
create or replace function fn_guard_predeterminado_alta()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.es_predeterminado and not es_direccion() and auth.uid() is not null then
    new.es_predeterminado := false;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pipelines_predeterminado_alta on pipelines;
create trigger trg_pipelines_predeterminado_alta
  before insert on pipelines
  for each row execute function fn_guard_predeterminado_alta();

-- ----------------------------------------------------------------------------
-- 3. UN PROCESO CON CASOS DENTRO NO SE BORRA.
--
-- Borrarlo dejaria esos casos apuntando a una etapa que ya no existe. Se
-- desactiva, que es lo que hace el resto de catalogos.
-- ----------------------------------------------------------------------------
create or replace function fn_guard_borrar_pipeline()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if exists (select 1 from leads where pipeline_id = old.id) then
    raise exception 'Ese proceso tiene casos dentro: desactivalo en lugar de borrarlo';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_pipelines_borrar on pipelines;
create trigger trg_pipelines_borrar
  before delete on pipelines
  for each row execute function fn_guard_borrar_pipeline();

-- ----------------------------------------------------------------------------
-- 4. UN COMERCIAL MANEJA LOS SUYOS.
--
-- Tenia INSERT y nada mas. Ahora puede editar y borrar los que ha creado el,
-- y sus etapas. Los de otros los ve, para poder mover casos a ellos, pero no
-- los toca.
-- ----------------------------------------------------------------------------
drop policy if exists pipelines_admisiones_crear on pipelines;
create policy pipelines_admisiones_crear on pipelines for insert to authenticated
  with check (mi_rol() = 'admisiones' and created_by = auth.uid());

create policy pipelines_admisiones_editar on pipelines for update to authenticated
  using (mi_rol() = 'admisiones' and created_by = auth.uid())
  with check (mi_rol() = 'admisiones' and created_by = auth.uid());

create policy pipelines_admisiones_borrar on pipelines for delete to authenticated
  using (mi_rol() = 'admisiones' and created_by = auth.uid());

-- Las etapas siguen a su proceso.
drop policy if exists pipeline_etapas_admisiones_crear on pipeline_etapas;
create policy pipeline_etapas_admisiones_crear on pipeline_etapas for insert to authenticated
  with check (
    mi_rol() = 'admisiones'
    and exists (
      select 1 from pipelines p
      where p.id = pipeline_id and p.created_by = auth.uid()
    )
  );

create policy pipeline_etapas_admisiones_editar on pipeline_etapas for update to authenticated
  using (
    mi_rol() = 'admisiones'
    and exists (
      select 1 from pipelines p
      where p.id = pipeline_etapas.pipeline_id and p.created_by = auth.uid()
    )
  )
  with check (
    mi_rol() = 'admisiones'
    and exists (
      select 1 from pipelines p
      where p.id = pipeline_etapas.pipeline_id and p.created_by = auth.uid()
    )
  );

create policy pipeline_etapas_admisiones_borrar on pipeline_etapas for delete to authenticated
  using (
    mi_rol() = 'admisiones'
    and exists (
      select 1 from pipelines p
      where p.id = pipeline_etapas.pipeline_id and p.created_by = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- 5. UNA ETAPA CON CASOS DENTRO TAMPOCO SE BORRA.
-- ----------------------------------------------------------------------------
create or replace function fn_guard_borrar_etapa()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if exists (select 1 from leads where etapa_id = old.id) then
    raise exception 'Esa etapa tiene casos dentro: muevelos antes de borrarla';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_etapas_borrar on pipeline_etapas;
create trigger trg_etapas_borrar
  before delete on pipeline_etapas
  for each row execute function fn_guard_borrar_etapa();

revoke execute on function fn_guard_predeterminado(), fn_guard_predeterminado_alta() from public, anon;
revoke execute on function fn_guard_borrar_pipeline(), fn_guard_borrar_etapa() from public, anon;
