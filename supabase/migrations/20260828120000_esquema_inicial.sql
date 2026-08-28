-- ============================================================================
-- VIDA Y TU DATA — Migración inicial: esquema completo del área comercial
-- Dominio en español (snake_case), infraestructura en inglés.
-- Incluye: enums, catálogos, equipo, contactos, pipelines, núcleo comercial,
-- triggers, funciones de seguridad, RLS, Storage y Realtime. Seeds incluidos.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ENUMS
-- ----------------------------------------------------------------------------
create type rol_usuario as enum ('direccion', 'admisiones', 'terapeuta');

create type estado_lead as enum (
  'nuevo', 'contactado', 'cita_agendada', 'cita_realizada', 'en_valoracion',
  'convertido', 'derivado', 'perdido', 'no_valido', 'reabierto'
);

create type tipo_notificacion as enum (
  'lead_asignado', 'lead_sin_atender', 'tarea_asignada', 'tarea_vencida',
  'cita_proxima', 'lead_nuevo_bandeja', 'presupuesto_sin_respuesta', 'resumen_diario'
);

create type tipo_lista as enum ('estatica', 'dinamica');

-- Compartido por leads.quien_contacta y lead_contactos.tipo (mismos valores)
create type tipo_contacto_caso as enum ('familiar', 'afectado', 'prescriptor', 'otro');

create type urgencia_lead as enum ('alta', 'media', 'baja');

create type tipo_actividad as enum ('llamada', 'whatsapp', 'email', 'nota', 'cambio_estado', 'reapertura');

create type tipo_cita as enum ('primera_llamada', 'primera_cita', 'valoracion', 'seguimiento', 'visita_centro', 'otro');

create type modalidad_cita as enum ('presencial', 'videollamada', 'telefonica');

create type estado_cita as enum ('programada', 'realizada', 'no_show', 'cancelada');

create type estado_presupuesto as enum ('propuesto', 'aceptado', 'rechazado');

create type estado_conversion as enum ('pendiente_validacion', 'validada');

-- ----------------------------------------------------------------------------
-- 2. CATÁLOGOS Y CONFIGURACIÓN
-- ----------------------------------------------------------------------------
create table centros (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  slug text not null unique,
  ciudad text,
  activo boolean not null default true,
  es_bandeja_grupo boolean not null default false,
  horario_atencion jsonb,
  created_at timestamptz not null default now()
);

create table canales (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  slug text not null unique,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table adicciones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  slug text not null unique,
  activa boolean not null default true,
  created_at timestamptz not null default now()
);

create table modalidades (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  slug text not null unique,
  activa boolean not null default true,
  created_at timestamptz not null default now()
);

create table modalidad_centros (
  id uuid primary key default gen_random_uuid(),
  modalidad_id uuid not null references modalidades (id) on delete cascade,
  centro_id uuid not null references centros (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (modalidad_id, centro_id)
);

create table motivos_perdida (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  slug text not null unique,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table configuracion (
  clave text primary key,
  valor jsonb not null,
  descripcion text,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 3. USUARIOS Y EQUIPO
-- ----------------------------------------------------------------------------
create table perfiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null,
  email text not null,
  rol rol_usuario not null,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table perfil_centros (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references perfiles (id) on delete cascade,
  centro_id uuid not null references centros (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (perfil_id, centro_id)
);

create table disponibilidad (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references perfiles (id) on delete cascade,
  dia_semana smallint not null check (dia_semana between 0 and 6),
  hora_inicio time not null,
  hora_fin time not null,
  created_at timestamptz not null default now(),
  check (hora_fin > hora_inicio)
);

create table ausencias (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references perfiles (id) on delete cascade,
  desde date not null,
  hasta date not null,
  motivo text,
  created_by uuid references perfiles (id),
  created_at timestamptz not null default now(),
  check (hasta >= desde)
);

create table objetivos (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references perfiles (id) on delete cascade,
  mes date not null check (extract(day from mes) = 1),
  meta_citas integer,
  meta_conversiones integer,
  meta_ingresos numeric(10, 2),
  created_by uuid references perfiles (id),
  created_at timestamptz not null default now(),
  unique (perfil_id, mes)
);

-- ----------------------------------------------------------------------------
-- 4. CONTACTOS, ETIQUETAS Y LISTAS
-- ----------------------------------------------------------------------------
create table contactos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text not null unique check (telefono ~ '^\+[1-9]\d{6,14}$'),
  email text,
  zona text,
  notas text,
  consentimiento_marketing boolean not null default false,
  consentimiento_marketing_at timestamptz,
  consentimiento_marketing_origen text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_contactos_email on contactos (email) where email is not null;

create table etiquetas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  color text,
  activa boolean not null default true,
  created_by uuid references perfiles (id),
  created_at timestamptz not null default now()
);

create table reglas_etiquetado (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  condicion jsonb not null,
  etiqueta_id uuid not null references etiquetas (id) on delete cascade,
  activa boolean not null default true,
  created_at timestamptz not null default now()
);

create table contacto_etiquetas (
  id uuid primary key default gen_random_uuid(),
  contacto_id uuid not null references contactos (id) on delete cascade,
  etiqueta_id uuid not null references etiquetas (id) on delete cascade,
  aplicada_por uuid references perfiles (id), -- null = aplicada automáticamente por regla
  regla_id uuid references reglas_etiquetado (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (contacto_id, etiqueta_id)
);

create table listas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  tipo tipo_lista not null,
  filtro jsonb,
  created_by uuid references perfiles (id),
  created_at timestamptz not null default now()
);

create table lista_contactos (
  id uuid primary key default gen_random_uuid(),
  lista_id uuid not null references listas (id) on delete cascade,
  contacto_id uuid not null references contactos (id) on delete cascade,
  added_by uuid references perfiles (id),
  created_at timestamptz not null default now(),
  unique (lista_id, contacto_id)
);

-- ----------------------------------------------------------------------------
-- 5. PIPELINES
-- ----------------------------------------------------------------------------
create table pipelines (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  centro_id uuid references centros (id), -- null = global
  activo boolean not null default true,
  created_by uuid references perfiles (id),
  created_at timestamptz not null default now()
);

create table pipeline_etapas (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references pipelines (id) on delete cascade,
  nombre text not null,
  orden integer not null,
  estado_sistema estado_lead not null,
  created_at timestamptz not null default now(),
  unique (pipeline_id, orden)
);

-- ----------------------------------------------------------------------------
-- 6. NÚCLEO COMERCIAL
-- ----------------------------------------------------------------------------
create table leads (
  id uuid primary key default gen_random_uuid(),
  centro_id uuid not null references centros (id),
  pipeline_id uuid not null references pipelines (id),
  etapa_id uuid not null references pipeline_etapas (id),
  propietario_id uuid references perfiles (id),
  -- snapshot del contacto principal
  nombre text not null,
  telefono text not null check (telefono ~ '^\+[1-9]\d{6,14}$'),
  quien_contacta tipo_contacto_caso,
  relacion_con_afectado text,
  nombre_afectado text,
  adiccion_id uuid references adicciones (id),
  modalidad_interes_id uuid references modalidades (id),
  urgencia urgencia_lead,
  zona text,
  prescriptor_nombre text,
  canal_id uuid not null references canales (id),
  subcanal text,
  estado estado_lead not null default 'nuevo',
  motivo_perdida_id uuid references motivos_perdida (id),
  primera_respuesta_at timestamptz,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  landing_url text,
  origen_sistema text,
  origen_ref text,
  created_by uuid references perfiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_perdido_requiere_motivo check (estado <> 'perdido' or motivo_perdida_id is not null)
);

create unique index idx_leads_origen on leads (origen_sistema, origen_ref)
  where origen_sistema is not null and origen_ref is not null;
create index idx_leads_centro_estado on leads (centro_id, estado);
create index idx_leads_telefono on leads (telefono);
create index idx_leads_created_at on leads (created_at);
create index idx_leads_propietario on leads (propietario_id);

create table lead_contactos (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads (id) on delete cascade,
  contacto_id uuid not null references contactos (id) on delete cascade,
  tipo tipo_contacto_caso not null,
  relacion text,
  es_principal boolean not null default false,
  created_at timestamptz not null default now(),
  unique (lead_id, contacto_id)
);

-- solo un contacto principal por caso
create unique index idx_lead_contacto_principal on lead_contactos (lead_id) where es_principal;

create table actividades (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads (id) on delete cascade,
  tipo tipo_actividad not null,
  contenido text,
  usuario_id uuid references perfiles (id),
  created_at timestamptz not null default now()
);

create index idx_actividades_lead on actividades (lead_id);

create table tareas (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads (id) on delete cascade,
  titulo text not null,
  vence_at timestamptz not null,
  responsable_id uuid references perfiles (id),
  completada_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_tareas_lead on tareas (lead_id);
create index idx_tareas_responsable on tareas (responsable_id) where completada_at is null;

create table citas (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads (id) on delete cascade,
  centro_id uuid not null references centros (id),
  profesional_id uuid not null references perfiles (id),
  tipo tipo_cita not null,
  modalidad_cita modalidad_cita not null,
  inicio timestamptz not null,
  fin timestamptz not null,
  estado estado_cita not null default 'programada',
  -- contacto con quien se agendó: ahí irá el recordatorio
  contacto_id uuid references contactos (id),
  notas text,
  created_at timestamptz not null default now(),
  check (fin > inicio)
);

create index idx_citas_lead on citas (lead_id);
create index idx_citas_profesional on citas (profesional_id, inicio);

create table presupuestos (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads (id) on delete cascade,
  importe numeric(10, 2) not null,
  modalidad_id uuid references modalidades (id),
  descripcion text,
  estado estado_presupuesto not null default 'propuesto',
  creado_por uuid references perfiles (id),
  created_at timestamptz not null default now()
);

create index idx_presupuestos_lead on presupuestos (lead_id);

create table conversiones (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null unique references leads (id) on delete cascade,
  fecha_inicio date,
  modalidad_id uuid references modalidades (id),
  centro_id uuid not null references centros (id),
  importe_primer_pago numeric(10, 2),
  presupuesto_id uuid references presupuestos (id),
  estado estado_conversion not null default 'pendiente_validacion',
  registrada_por uuid references perfiles (id),
  validada_por uuid references perfiles (id),
  validada_at timestamptz,
  created_at timestamptz not null default now()
);

create table derivaciones (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads (id) on delete cascade,
  centro_origen_id uuid not null references centros (id),
  centro_destino_id uuid not null references centros (id),
  motivo text,
  created_at timestamptz not null default now()
);

create table caso_adjuntos (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads (id) on delete cascade,
  nombre_archivo text not null,
  storage_path text not null,
  mime_type text,
  tamano_bytes bigint,
  subido_por uuid references perfiles (id),
  created_at timestamptz not null default now()
);

create table notificaciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references perfiles (id) on delete cascade,
  tipo tipo_notificacion not null,
  lead_id uuid references leads (id) on delete set null,
  mensaje text not null,
  leida_at timestamptz,
  email_enviado_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_notificaciones_usuario on notificaciones (usuario_id) where leida_at is null;

-- Auditoría append-only. Sin FKs a propósito: el rastro debe sobrevivir a
-- borrados de usuarios y registros.
create table auditoria (
  id bigint generated always as identity primary key,
  tabla text not null,
  registro_id uuid,
  accion text not null,
  usuario_id uuid,
  datos_anteriores jsonb,
  datos_nuevos jsonb,
  created_at timestamptz not null default now()
);

revoke update, delete on auditoria from anon, authenticated;
revoke insert on auditoria from anon, authenticated; -- solo escriben los triggers (security definer)

-- ----------------------------------------------------------------------------
-- 7. FUNCIONES DE SEGURIDAD
-- ----------------------------------------------------------------------------
create or replace function es_direccion()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from perfiles
    where id = auth.uid() and rol = 'direccion' and activo
  );
$$;

create or replace function mi_rol()
returns rol_usuario
language sql stable security definer set search_path = public
as $$
  select rol from perfiles where id = auth.uid() and activo;
$$;

create or replace function mis_centros()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select centro_id from perfil_centros where perfil_id = auth.uid();
$$;

grant execute on function es_direccion(), mi_rol(), mis_centros() to authenticated;

-- ----------------------------------------------------------------------------
-- 8. TRIGGERS Y FUNCIONES DE DOMINIO
-- ----------------------------------------------------------------------------

-- 8.1 updated_at automático
create or replace function fn_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_leads_updated_at
  before update on leads
  for each row execute function fn_touch_updated_at();

create trigger trg_contactos_updated_at
  before update on contactos
  for each row execute function fn_touch_updated_at();

create or replace function fn_touch_configuracion()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger trg_configuracion_updated
  before update on configuracion
  for each row execute function fn_touch_configuracion();

-- 8.2 Auditoría append-only
create or replace function fn_auditoria()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_registro uuid;
begin
  if tg_op = 'DELETE' then
    v_registro := old.id;
  else
    v_registro := new.id;
  end if;

  insert into auditoria (tabla, registro_id, accion, usuario_id, datos_anteriores, datos_nuevos)
  values (
    tg_table_name,
    v_registro,
    tg_op,
    auth.uid(),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger trg_auditoria_leads after insert or update or delete on leads
  for each row execute function fn_auditoria();
create trigger trg_auditoria_citas after insert or update or delete on citas
  for each row execute function fn_auditoria();
create trigger trg_auditoria_conversiones after insert or update or delete on conversiones
  for each row execute function fn_auditoria();
create trigger trg_auditoria_derivaciones after insert or update or delete on derivaciones
  for each row execute function fn_auditoria();
create trigger trg_auditoria_contactos after insert or update or delete on contactos
  for each row execute function fn_auditoria();
create trigger trg_auditoria_presupuestos after insert or update or delete on presupuestos
  for each row execute function fn_auditoria();

-- 8.3 Sincronía etapa → estado: al cambiar leads.etapa_id se copia el
-- estado_sistema de la nueva etapa. Solo en UPDATE: en INSERT el estado
-- lo fija quien crea el lead (y lo protegen los CHECK).
create or replace function fn_sync_estado_etapa()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.etapa_id is distinct from old.etapa_id then
    select pe.estado_sistema into new.estado
    from pipeline_etapas pe
    where pe.id = new.etapa_id;
  end if;
  return new;
end;
$$;

create trigger trg_leads_sync_estado
  before update on leads
  for each row execute function fn_sync_estado_etapa();

-- 8.4 Propiedad: autoasignación solo de leads sin propietario (política de BD).
-- Cambiar un propietario existente, solo dirección. auth.uid() null = service
-- role / procesos de sistema, que no pasan por aquí con restricciones.
create or replace function fn_guard_propietario()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.propietario_id is distinct from old.propietario_id then
    if auth.uid() is null or es_direccion() then
      return new;
    end if;
    if old.propietario_id is null and new.propietario_id = auth.uid() then
      return new;
    end if;
    raise exception 'Solo dirección puede cambiar el propietario de un lead ya asignado. Autoasignación: solo leads sin propietario y a ti mismo.';
  end if;
  return new;
end;
$$;

create trigger trg_leads_guard_propietario
  before update on leads
  for each row execute function fn_guard_propietario();

-- 8.5 Contacto principal → snapshot en el lead
create or replace function fn_sync_contacto_principal()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.es_principal then
    update leads l
    set nombre = c.nombre, telefono = c.telefono
    from contactos c
    where c.id = new.contacto_id and l.id = new.lead_id;
  end if;
  return new;
end;
$$;

create trigger trg_lead_contactos_principal
  after insert or update of es_principal on lead_contactos
  for each row execute function fn_sync_contacto_principal();

-- ----------------------------------------------------------------------------
-- 9. RLS
-- ----------------------------------------------------------------------------
alter table centros enable row level security;
alter table canales enable row level security;
alter table adicciones enable row level security;
alter table modalidades enable row level security;
alter table modalidad_centros enable row level security;
alter table motivos_perdida enable row level security;
alter table configuracion enable row level security;
alter table perfiles enable row level security;
alter table perfil_centros enable row level security;
alter table disponibilidad enable row level security;
alter table ausencias enable row level security;
alter table objetivos enable row level security;
alter table contactos enable row level security;
alter table etiquetas enable row level security;
alter table reglas_etiquetado enable row level security;
alter table contacto_etiquetas enable row level security;
alter table listas enable row level security;
alter table lista_contactos enable row level security;
alter table pipelines enable row level security;
alter table pipeline_etapas enable row level security;
alter table leads enable row level security;
alter table lead_contactos enable row level security;
alter table actividades enable row level security;
alter table tareas enable row level security;
alter table citas enable row level security;
alter table presupuestos enable row level security;
alter table conversiones enable row level security;
alter table derivaciones enable row level security;
alter table caso_adjuntos enable row level security;
alter table notificaciones enable row level security;
alter table auditoria enable row level security;

-- 9.1 Catálogos + configuración: todos leen, solo dirección gestiona
create policy catalogos_leer on centros for select to authenticated using (true);
create policy catalogos_gestionar on centros for all to authenticated
  using (es_direccion()) with check (es_direccion());

create policy catalogos_leer on canales for select to authenticated using (true);
create policy catalogos_gestionar on canales for all to authenticated
  using (es_direccion()) with check (es_direccion());

create policy catalogos_leer on adicciones for select to authenticated using (true);
create policy catalogos_gestionar on adicciones for all to authenticated
  using (es_direccion()) with check (es_direccion());

create policy catalogos_leer on modalidades for select to authenticated using (true);
create policy catalogos_gestionar on modalidades for all to authenticated
  using (es_direccion()) with check (es_direccion());

create policy catalogos_leer on modalidad_centros for select to authenticated using (true);
create policy catalogos_gestionar on modalidad_centros for all to authenticated
  using (es_direccion()) with check (es_direccion());

create policy catalogos_leer on motivos_perdida for select to authenticated using (true);
create policy catalogos_gestionar on motivos_perdida for all to authenticated
  using (es_direccion()) with check (es_direccion());

create policy catalogos_leer on configuracion for select to authenticated using (true);
create policy catalogos_gestionar on configuracion for all to authenticated
  using (es_direccion()) with check (es_direccion());

-- 9.2 Equipo
create policy perfiles_leer on perfiles for select to authenticated
  using (es_direccion() or mi_rol() = 'admisiones' or id = auth.uid());
create policy perfiles_gestionar on perfiles for all to authenticated
  using (es_direccion()) with check (es_direccion());

create policy perfil_centros_leer on perfil_centros for select to authenticated
  using (es_direccion() or mi_rol() = 'admisiones' or perfil_id = auth.uid());
create policy perfil_centros_gestionar on perfil_centros for all to authenticated
  using (es_direccion()) with check (es_direccion());

create policy disponibilidad_leer on disponibilidad for select to authenticated
  using (es_direccion() or mi_rol() = 'admisiones' or perfil_id = auth.uid());
create policy disponibilidad_direccion on disponibilidad for all to authenticated
  using (es_direccion()) with check (es_direccion());
create policy disponibilidad_propia_insertar on disponibilidad for insert to authenticated
  with check (mi_rol() = 'admisiones' and perfil_id = auth.uid());
create policy disponibilidad_propia_editar on disponibilidad for update to authenticated
  using (mi_rol() = 'admisiones' and perfil_id = auth.uid())
  with check (mi_rol() = 'admisiones' and perfil_id = auth.uid());
create policy disponibilidad_propia_borrar on disponibilidad for delete to authenticated
  using (mi_rol() = 'admisiones' and perfil_id = auth.uid());

create policy ausencias_leer on ausencias for select to authenticated
  using (es_direccion() or mi_rol() = 'admisiones' or perfil_id = auth.uid());
create policy ausencias_direccion on ausencias for all to authenticated
  using (es_direccion()) with check (es_direccion());
create policy ausencias_propias_insertar on ausencias for insert to authenticated
  with check (mi_rol() = 'admisiones' and perfil_id = auth.uid());
create policy ausencias_propias_editar on ausencias for update to authenticated
  using (mi_rol() = 'admisiones' and perfil_id = auth.uid())
  with check (mi_rol() = 'admisiones' and perfil_id = auth.uid());
create policy ausencias_propias_borrar on ausencias for delete to authenticated
  using (mi_rol() = 'admisiones' and perfil_id = auth.uid());

create policy objetivos_leer on objetivos for select to authenticated
  using (es_direccion() or mi_rol() = 'admisiones' or perfil_id = auth.uid());
create policy objetivos_gestionar on objetivos for all to authenticated
  using (es_direccion()) with check (es_direccion());

-- 9.3 Leads y satélites: dirección todo; admisiones CRUD en sus centros;
-- terapeuta nada. DELETE de leads: solo dirección.
create policy leads_direccion on leads for all to authenticated
  using (es_direccion()) with check (es_direccion());
create policy leads_admisiones_leer on leads for select to authenticated
  using (mi_rol() = 'admisiones' and centro_id in (select mis_centros()));
create policy leads_admisiones_crear on leads for insert to authenticated
  with check (mi_rol() = 'admisiones' and centro_id in (select mis_centros()));
create policy leads_admisiones_editar on leads for update to authenticated
  using (mi_rol() = 'admisiones' and centro_id in (select mis_centros()))
  with check (mi_rol() = 'admisiones' and centro_id in (select mis_centros()));

create policy lead_contactos_direccion on lead_contactos for all to authenticated
  using (es_direccion()) with check (es_direccion());
create policy lead_contactos_admisiones on lead_contactos for all to authenticated
  using (mi_rol() = 'admisiones' and exists (
    select 1 from leads l where l.id = lead_id and l.centro_id in (select mis_centros())))
  with check (mi_rol() = 'admisiones' and exists (
    select 1 from leads l where l.id = lead_id and l.centro_id in (select mis_centros())));

-- actividades es append-only: nadie edita ni borra desde la app
create policy actividades_direccion_leer on actividades for select to authenticated
  using (es_direccion());
create policy actividades_direccion_crear on actividades for insert to authenticated
  with check (es_direccion());
create policy actividades_admisiones_leer on actividades for select to authenticated
  using (mi_rol() = 'admisiones' and exists (
    select 1 from leads l where l.id = lead_id and l.centro_id in (select mis_centros())));
create policy actividades_admisiones_crear on actividades for insert to authenticated
  with check (mi_rol() = 'admisiones' and exists (
    select 1 from leads l where l.id = lead_id and l.centro_id in (select mis_centros())));

create policy tareas_direccion on tareas for all to authenticated
  using (es_direccion()) with check (es_direccion());
create policy tareas_admisiones on tareas for all to authenticated
  using (mi_rol() = 'admisiones' and exists (
    select 1 from leads l where l.id = lead_id and l.centro_id in (select mis_centros())))
  with check (mi_rol() = 'admisiones' and exists (
    select 1 from leads l where l.id = lead_id and l.centro_id in (select mis_centros())));

create policy presupuestos_direccion on presupuestos for all to authenticated
  using (es_direccion()) with check (es_direccion());
create policy presupuestos_admisiones on presupuestos for all to authenticated
  using (mi_rol() = 'admisiones' and exists (
    select 1 from leads l where l.id = lead_id and l.centro_id in (select mis_centros())))
  with check (mi_rol() = 'admisiones' and exists (
    select 1 from leads l where l.id = lead_id and l.centro_id in (select mis_centros())));

create policy derivaciones_direccion on derivaciones for all to authenticated
  using (es_direccion()) with check (es_direccion());
create policy derivaciones_admisiones on derivaciones for all to authenticated
  using (mi_rol() = 'admisiones' and exists (
    select 1 from leads l where l.id = lead_id and l.centro_id in (select mis_centros())))
  with check (mi_rol() = 'admisiones' and exists (
    select 1 from leads l where l.id = lead_id and l.centro_id in (select mis_centros())));

create policy caso_adjuntos_direccion on caso_adjuntos for all to authenticated
  using (es_direccion()) with check (es_direccion());
create policy caso_adjuntos_admisiones on caso_adjuntos for all to authenticated
  using (mi_rol() = 'admisiones' and exists (
    select 1 from leads l where l.id = lead_id and l.centro_id in (select mis_centros())))
  with check (mi_rol() = 'admisiones' and exists (
    select 1 from leads l where l.id = lead_id and l.centro_id in (select mis_centros())));

-- 9.4 Citas: terapeuta SOLO las suyas (y de ellas conocerá solo nombre y
-- teléfono del lead, garantizado porque leads no le concede ninguna política)
create policy citas_direccion on citas for all to authenticated
  using (es_direccion()) with check (es_direccion());
create policy citas_admisiones on citas for all to authenticated
  using (mi_rol() = 'admisiones' and centro_id in (select mis_centros()))
  with check (mi_rol() = 'admisiones' and centro_id in (select mis_centros()));
create policy citas_terapeuta_leer on citas for select to authenticated
  using (mi_rol() = 'terapeuta' and profesional_id = auth.uid());
create policy citas_terapeuta_actualizar on citas for update to authenticated
  using (mi_rol() = 'terapeuta' and profesional_id = auth.uid())
  with check (mi_rol() = 'terapeuta' and profesional_id = auth.uid());

-- 9.5 Contactos y marketing: terapeuta nada
create policy contactos_direccion on contactos for all to authenticated
  using (es_direccion()) with check (es_direccion());
create policy contactos_admisiones_leer on contactos for select to authenticated
  using (mi_rol() = 'admisiones');
create policy contactos_admisiones_crear on contactos for insert to authenticated
  with check (mi_rol() = 'admisiones');
create policy contactos_admisiones_editar on contactos for update to authenticated
  using (mi_rol() = 'admisiones' and exists (
    select 1
    from lead_contactos lc
    join leads l on l.id = lc.lead_id
    where lc.contacto_id = contactos.id and l.centro_id in (select mis_centros())))
  with check (mi_rol() = 'admisiones');

create policy etiquetas_direccion on etiquetas for all to authenticated
  using (es_direccion()) with check (es_direccion());
create policy etiquetas_admisiones_leer on etiquetas for select to authenticated
  using (mi_rol() = 'admisiones');
create policy etiquetas_admisiones_crear on etiquetas for insert to authenticated
  with check (mi_rol() = 'admisiones');

create policy contacto_etiquetas_direccion on contacto_etiquetas for all to authenticated
  using (es_direccion()) with check (es_direccion());
create policy contacto_etiquetas_admisiones_leer on contacto_etiquetas for select to authenticated
  using (mi_rol() = 'admisiones');
create policy contacto_etiquetas_admisiones_crear on contacto_etiquetas for insert to authenticated
  with check (mi_rol() = 'admisiones');

create policy listas_direccion on listas for all to authenticated
  using (es_direccion()) with check (es_direccion());
create policy listas_admisiones_leer on listas for select to authenticated
  using (mi_rol() = 'admisiones');
create policy listas_admisiones_crear on listas for insert to authenticated
  with check (mi_rol() = 'admisiones');

create policy lista_contactos_direccion on lista_contactos for all to authenticated
  using (es_direccion()) with check (es_direccion());
create policy lista_contactos_admisiones_leer on lista_contactos for select to authenticated
  using (mi_rol() = 'admisiones');
create policy lista_contactos_admisiones_crear on lista_contactos for insert to authenticated
  with check (mi_rol() = 'admisiones');

create policy reglas_etiquetado_direccion on reglas_etiquetado for all to authenticated
  using (es_direccion()) with check (es_direccion());
create policy reglas_etiquetado_admisiones_leer on reglas_etiquetado for select to authenticated
  using (mi_rol() = 'admisiones');
create policy reglas_etiquetado_admisiones_crear on reglas_etiquetado for insert to authenticated
  with check (mi_rol() = 'admisiones');

-- 9.6 Conversiones: solo dirección valida (admisiones no tiene UPDATE y su
-- INSERT exige estado pendiente_validacion)
create policy conversiones_direccion on conversiones for all to authenticated
  using (es_direccion()) with check (es_direccion());
create policy conversiones_admisiones_leer on conversiones for select to authenticated
  using (mi_rol() = 'admisiones' and centro_id in (select mis_centros()));
create policy conversiones_admisiones_crear on conversiones for insert to authenticated
  with check (
    mi_rol() = 'admisiones'
    and centro_id in (select mis_centros())
    and estado = 'pendiente_validacion');

-- 9.7 Notificaciones: cada uno las suyas (las crea el sistema con service role)
create policy notificaciones_propias_leer on notificaciones for select to authenticated
  using (usuario_id = auth.uid());
create policy notificaciones_propias_actualizar on notificaciones for update to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());
create policy notificaciones_propias_borrar on notificaciones for delete to authenticated
  using (usuario_id = auth.uid());

-- 9.8 Pipelines
create policy pipelines_direccion on pipelines for all to authenticated
  using (es_direccion()) with check (es_direccion());
create policy pipelines_admisiones_leer on pipelines for select to authenticated
  using (mi_rol() = 'admisiones');
create policy pipelines_admisiones_crear on pipelines for insert to authenticated
  with check (mi_rol() = 'admisiones');

create policy pipeline_etapas_direccion on pipeline_etapas for all to authenticated
  using (es_direccion()) with check (es_direccion());
create policy pipeline_etapas_admisiones_leer on pipeline_etapas for select to authenticated
  using (mi_rol() = 'admisiones');
create policy pipeline_etapas_admisiones_crear on pipeline_etapas for insert to authenticated
  with check (mi_rol() = 'admisiones');

-- 9.9 Auditoría: solo lectura y solo dirección
create policy auditoria_direccion_leer on auditoria for select to authenticated
  using (es_direccion());

-- ----------------------------------------------------------------------------
-- 10. STORAGE: bucket privado para adjuntos de casos.
-- Convención de ruta: <lead_id>/<archivo>. Acceso alineado con el lead.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('adjuntos-casos', 'adjuntos-casos', false)
on conflict (id) do nothing;

create policy adjuntos_acceso on storage.objects for all to authenticated
using (
  bucket_id = 'adjuntos-casos'
  and (
    es_direccion()
    or (
      mi_rol() = 'admisiones'
      and exists (
        select 1 from public.leads l
        where l.id = ((storage.foldername(name))[1])::uuid
          and l.centro_id in (select mis_centros())
      )
    )
  )
)
with check (
  bucket_id = 'adjuntos-casos'
  and (
    es_direccion()
    or (
      mi_rol() = 'admisiones'
      and exists (
        select 1 from public.leads l
        where l.id = ((storage.foldername(name))[1])::uuid
          and l.centro_id in (select mis_centros())
      )
    )
  )
);

-- ----------------------------------------------------------------------------
-- 11. REALTIME en leads
-- ----------------------------------------------------------------------------
alter publication supabase_realtime add table leads;

-- ----------------------------------------------------------------------------
-- 12. SEEDS
-- ----------------------------------------------------------------------------
insert into centros (nombre, slug, ciudad, es_bandeja_grupo) values
  ('Horizonte', 'horizonte', 'Jerez de la Frontera', false),
  ('Eclipse', 'eclipse', 'Reus / Tarragona', false),
  ('Bellamar', 'bellamar', 'Tarragona', false),
  ('Vida y Tu — Bandeja de grupo', 'bandeja-grupo', null, true);

insert into canales (nombre, slug) values
  ('Meta Ads', 'meta_ads'),
  ('Google Ads', 'google_ads'),
  ('Formulario web', 'formulario_web'),
  ('Instagram', 'instagram'),
  ('Facebook', 'facebook'),
  ('WhatsApp', 'whatsapp'),
  ('Teléfono', 'telefono'),
  ('Prescriptor', 'prescriptor'),
  ('Recomendación', 'recomendacion'),
  ('Otro', 'otro');

insert into adicciones (nombre, slug) values
  ('Alcohol', 'alcohol'),
  ('Cocaína', 'cocaina'),
  ('Cannabis', 'cannabis'),
  ('Benzodiacepinas / psicofármacos', 'benzodiacepinas'),
  ('Heroína', 'heroina'),
  ('Anfetaminas', 'anfetaminas'),
  ('Ketamina / drogas de diseño', 'ketamina-diseno'),
  ('Ludopatía', 'ludopatia'),
  ('Sexo', 'sexo'),
  ('Nuevas tecnologías', 'nuevas-tecnologias'),
  ('Compras compulsivas', 'compras-compulsivas'),
  ('Chemsex', 'chemsex'),
  ('Patología dual', 'patologia-dual'),
  ('Otra', 'otra');

insert into modalidades (nombre, slug) values
  ('Ambulatorio', 'ambulatorio'),
  ('Centro de día', 'centro_de_dia'),
  ('Online', 'online'),
  ('Piso tutelado', 'piso_tutelado'),
  ('Ingreso residencial', 'ingreso_residencial');

insert into modalidad_centros (modalidad_id, centro_id)
select m.id, c.id
from modalidades m
join centros c on (
  (m.slug = 'ingreso_residencial' and c.slug = 'bellamar')
  or (m.slug = 'piso_tutelado' and c.slug = 'eclipse')
  or (m.slug in ('ambulatorio', 'centro_de_dia', 'online') and c.slug in ('horizonte', 'eclipse'))
);

insert into motivos_perdida (nombre, slug) values
  ('Precio', 'precio'),
  ('No es el momento', 'no_es_el_momento'),
  ('Eligió otro centro', 'eligio_otro_centro'),
  ('Recurso público', 'recurso_publico'),
  ('No respondió', 'no_respondio'),
  ('Distancia', 'distancia'),
  ('No ofrecemos ese recurso', 'no_ofrecemos'),
  ('Otro', 'otro');

insert into configuracion (clave, valor, descripcion) values
  ('sla_primera_respuesta_minutos', '60', 'Minutos máximos para la primera respuesta a un lead, contados en horario de atención del centro'),
  ('cadencia_dias', '[0,1,3,7,14]', 'Días de la cadencia de contacto (5 intentos alternando llamada y WhatsApp); tras el último sin respuesta se propone perdido "no respondió"'),
  ('alerta_presupuesto_dias', '3', 'Días sin respuesta a un presupuesto antes de generar alerta');

insert into pipelines (nombre, centro_id) values ('Estándar Vida y Tu', null);

insert into pipeline_etapas (pipeline_id, nombre, orden, estado_sistema)
select p.id, e.nombre, e.orden, e.estado::estado_lead
from pipelines p
cross join (values
  ('Nuevo', 1, 'nuevo'),
  ('Contactado', 2, 'contactado'),
  ('Cita agendada', 3, 'cita_agendada'),
  ('Cita realizada', 4, 'cita_realizada'),
  ('En valoración', 5, 'en_valoracion'),
  ('Convertido', 6, 'convertido')
) as e (nombre, orden, estado)
where p.nombre = 'Estándar Vida y Tu';
