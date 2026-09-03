-- ============================================================================
-- FASE 3: AREA CLINICA
--
-- El muro. Dos areas en la misma plataforma, separadas en la BASE DE DATOS y
-- en los dos sentidos:
--
--   · Un comercial (admisiones) no ve NADA de aqui. Ninguna politica de este
--     archivo concede acceso por rol 'admisiones'.
--   · Un terapeuta no ve pipeline, presupuestos ni dinero: eso ya lo impiden
--     las politicas del esquema comercial.
--   · Una persona puede tener ambos accesos (perfiles.acceso_clinico), y
--     entonces ve las dos areas — pero en la clinica solo SUS pacientes.
--
-- Cada terapeuta ve unicamente los pacientes de los que es referente.
-- Direccion lo ve todo. No hay termino medio ni "ver de solo lectura".
-- ============================================================================

create type estado_paciente as enum ('activo', 'alta', 'abandono', 'derivado_externo');
create type tipo_sesion as enum ('individual', 'grupal', 'familiar');
create type estado_sesion as enum ('programada', 'realizada', 'no_show', 'cancelada');
create type tipo_documento_clinico as enum ('consentimiento', 'informe', 'derivacion', 'otro');

-- ----------------------------------------------------------------------------
-- 1. ACCESO CLINICO
--
-- El rol sigue siendo uno solo (cambiar el enum obligaria a tocar todas las
-- politicas existentes). El acceso clinico es una capacidad ADICIONAL que
-- direccion concede desde administracion.
-- ----------------------------------------------------------------------------
alter table perfiles
  add column if not exists acceso_clinico boolean not null default false;

comment on column perfiles.acceso_clinico is
  'Da acceso al area clinica a un perfil que no es terapeuta. Los terapeutas y direccion lo tienen implicito.';

-- Los terapeutas ya existentes lo tienen por su rol; se marca para que la
-- consulta sea directa y no dependa de leer el rol en cada politica.
update perfiles set acceso_clinico = true where rol = 'terapeuta';

-- ----------------------------------------------------------------------------
-- 2. FASES DEL METODO
--
-- El grupo trabaja con un metodo de 7 fases. Los nombres reales los pone
-- direccion desde administracion: la plataforma no inventa contenido clinico.
-- ----------------------------------------------------------------------------
create table fases_metodo (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  orden smallint not null,
  activa boolean not null default true,
  created_at timestamptz not null default now()
);

insert into fases_metodo (nombre, orden, descripcion) values
  ('Fase 1', 1, 'Renombrar desde Administracion con el nombre real del metodo del grupo.'),
  ('Fase 2', 2, null),
  ('Fase 3', 3, null),
  ('Fase 4', 4, null),
  ('Fase 5', 5, null),
  ('Fase 6', 6, null),
  ('Fase 7', 7, 'Seguimiento post-alta.');

-- ----------------------------------------------------------------------------
-- 3. PACIENTES
--
-- Nace de una conversion validada. El vinculo con el lead existe SOLO para
-- metricas: ninguna consulta clinica lee el historial comercial, y ninguna
-- consulta comercial lee esta tabla.
-- ----------------------------------------------------------------------------
create table pacientes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid unique references leads (id) on delete set null,
  centro_id uuid not null references centros (id),
  terapeuta_id uuid references perfiles (id),
  nombre text not null,
  telefono text check (telefono ~ '^\+[1-9]\d{6,14}$'),
  email text,
  fecha_nacimiento date,
  modalidad_id uuid references modalidades (id),
  adiccion_id uuid references adicciones (id),
  fase_id uuid references fases_metodo (id),
  estado estado_paciente not null default 'activo',
  fecha_ingreso date not null default current_date,
  fecha_alta date,
  notas text,
  created_by uuid references perfiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_alta_posterior check (fecha_alta is null or fecha_alta >= fecha_ingreso)
);

create index idx_pacientes_terapeuta on pacientes (terapeuta_id, estado);
create index idx_pacientes_centro on pacientes (centro_id, estado);

-- ----------------------------------------------------------------------------
-- 4. SESIONES
-- ----------------------------------------------------------------------------
create table sesiones (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes (id) on delete cascade,
  terapeuta_id uuid references perfiles (id),
  tipo tipo_sesion not null default 'individual',
  estado estado_sesion not null default 'programada',
  inicio timestamptz not null,
  fin timestamptz not null,
  notas_clinicas text,
  created_by uuid references perfiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_sesion_rango check (fin > inicio)
);

create index idx_sesiones_paciente on sesiones (paciente_id, inicio desc);
create index idx_sesiones_terapeuta on sesiones (terapeuta_id, inicio);

-- ----------------------------------------------------------------------------
-- 5. FAMILIARES
-- ----------------------------------------------------------------------------
create table familiares (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes (id) on delete cascade,
  nombre text not null,
  telefono text check (telefono is null or telefono ~ '^\+[1-9]\d{6,14}$'),
  email text,
  relacion text,
  es_contacto_emergencia boolean not null default false,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_familiares_paciente on familiares (paciente_id);

-- ----------------------------------------------------------------------------
-- 6. DOCUMENTOS
-- ----------------------------------------------------------------------------
create table documentos_clinicos (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes (id) on delete cascade,
  nombre text not null,
  tipo tipo_documento_clinico not null default 'otro',
  ruta text not null,
  tamano_bytes bigint,
  subido_por uuid references perfiles (id),
  created_at timestamptz not null default now()
);

create index idx_documentos_paciente on documentos_clinicos (paciente_id);

-- ----------------------------------------------------------------------------
-- 7. CHAT INTERNO CLINICO
--
-- Saca la comunicacion clinica del WhatsApp personal, que hoy esta fuera de
-- control RGPD. Una conversacion puede vincularse a un paciente.
-- ----------------------------------------------------------------------------
create table conversaciones (
  id uuid primary key default gen_random_uuid(),
  titulo text,
  paciente_id uuid references pacientes (id) on delete set null,
  created_by uuid references perfiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table conversacion_participantes (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references conversaciones (id) on delete cascade,
  perfil_id uuid not null references perfiles (id) on delete cascade,
  leido_at timestamptz,
  created_at timestamptz not null default now(),
  unique (conversacion_id, perfil_id)
);

create table mensajes (
  id uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references conversaciones (id) on delete cascade,
  autor_id uuid references perfiles (id),
  cuerpo text not null,
  created_at timestamptz not null default now()
);

create index idx_mensajes_conversacion on mensajes (conversacion_id, created_at);

-- Un mensaje enviado no se reescribe: es comunicacion clinica registrada.
revoke update on mensajes from anon, authenticated;

-- ----------------------------------------------------------------------------
-- 8. CUESTIONARIOS CLINICOS
--
-- Evaluaciones periodicas con puntuacion. El contenido de los cuestionarios lo
-- define el equipo clinico; la plataforma solo da la estructura.
-- ----------------------------------------------------------------------------
create table cuestionarios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table cuestionario_preguntas (
  id uuid primary key default gen_random_uuid(),
  cuestionario_id uuid not null references cuestionarios (id) on delete cascade,
  texto text not null,
  orden smallint not null,
  valor_min smallint not null default 0,
  valor_max smallint not null default 10,
  constraint chk_rango_pregunta check (valor_max > valor_min)
);

create table cuestionario_respuestas (
  id uuid primary key default gen_random_uuid(),
  cuestionario_id uuid not null references cuestionarios (id) on delete cascade,
  paciente_id uuid not null references pacientes (id) on delete cascade,
  fecha date not null default current_date,
  puntuacion_total numeric(6, 2),
  notas text,
  registrado_por uuid references perfiles (id),
  created_at timestamptz not null default now()
);

create index idx_respuestas_paciente on cuestionario_respuestas (paciente_id, fecha);

create table cuestionario_respuesta_items (
  id uuid primary key default gen_random_uuid(),
  respuesta_id uuid not null references cuestionario_respuestas (id) on delete cascade,
  pregunta_id uuid not null references cuestionario_preguntas (id) on delete cascade,
  valor numeric(6, 2) not null,
  unique (respuesta_id, pregunta_id)
);

-- ----------------------------------------------------------------------------
-- 9. OCUPACION RESIDENCIAL (Bellamar)
-- ----------------------------------------------------------------------------
create table habitaciones (
  id uuid primary key default gen_random_uuid(),
  centro_id uuid not null references centros (id) on delete cascade,
  nombre text not null,
  plazas smallint not null default 1 check (plazas > 0),
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  unique (centro_id, nombre)
);

create table ocupaciones (
  id uuid primary key default gen_random_uuid(),
  habitacion_id uuid not null references habitaciones (id) on delete cascade,
  paciente_id uuid not null references pacientes (id) on delete cascade,
  desde date not null,
  hasta date,
  created_by uuid references perfiles (id),
  created_at timestamptz not null default now(),
  constraint chk_ocupacion_rango check (hasta is null or hasta >= desde)
);

create index idx_ocupaciones_habitacion on ocupaciones (habitacion_id, desde);
create index idx_ocupaciones_activas on ocupaciones (habitacion_id) where hasta is null;

-- ----------------------------------------------------------------------------
-- 10. SEGUIMIENTO POST-ALTA
--
-- La fase 7 del metodo, sistematizada: contactos a 1, 3, 6 y 12 meses del alta.
-- ----------------------------------------------------------------------------
create table seguimientos_post_alta (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references pacientes (id) on delete cascade,
  hito_meses smallint not null check (hito_meses in (1, 3, 6, 12)),
  fecha_prevista date not null,
  completado_at timestamptz,
  resultado text,
  created_at timestamptz not null default now(),
  unique (paciente_id, hito_meses)
);

create index idx_seguimientos_pendientes on seguimientos_post_alta (fecha_prevista)
  where completado_at is null;

-- ----------------------------------------------------------------------------
-- 11. FUNCIONES DE SEGURIDAD DEL AREA CLINICA
-- ----------------------------------------------------------------------------

-- Quien puede pisar el area clinica.
create or replace function tiene_acceso_clinico()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from perfiles
    where id = auth.uid()
      and activo
      and (rol = 'direccion' or rol = 'terapeuta' or acceso_clinico)
  );
$$;

-- Los pacientes que puede ver quien pregunta. Direccion, todos; el resto,
-- solo aquellos de los que es terapeuta referente.
create or replace function mis_pacientes()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select p.id
  from pacientes p
  where es_direccion()
     or (tiene_acceso_clinico() and p.terapeuta_id = auth.uid());
$$;

grant execute on function tiene_acceso_clinico(), mis_pacientes() to authenticated;

-- ----------------------------------------------------------------------------
-- 12. TRIGGERS
-- ----------------------------------------------------------------------------
create trigger trg_pacientes_updated_at before update on pacientes
  for each row execute function fn_touch_updated_at();
create trigger trg_sesiones_updated_at before update on sesiones
  for each row execute function fn_touch_updated_at();
create trigger trg_familiares_updated_at before update on familiares
  for each row execute function fn_touch_updated_at();
create trigger trg_conversaciones_updated_at before update on conversaciones
  for each row execute function fn_touch_updated_at();

create trigger trg_auditoria_pacientes
  after insert or update or delete on pacientes
  for each row execute function fn_auditoria();
create trigger trg_auditoria_sesiones
  after insert or update or delete on sesiones
  for each row execute function fn_auditoria();
create trigger trg_auditoria_documentos
  after insert or update or delete on documentos_clinicos
  for each row execute function fn_auditoria();

-- ----------------------------------------------------------------------------
-- 13. RLS — EL MURO
--
-- Ninguna politica menciona 'admisiones'. Un comercial que consulte estas
-- tablas recibe cero filas, no un error: no puede ni deducir que existen.
-- ----------------------------------------------------------------------------
alter table fases_metodo enable row level security;
alter table pacientes enable row level security;
alter table sesiones enable row level security;
alter table familiares enable row level security;
alter table documentos_clinicos enable row level security;
alter table conversaciones enable row level security;
alter table conversacion_participantes enable row level security;
alter table mensajes enable row level security;
alter table cuestionarios enable row level security;
alter table cuestionario_preguntas enable row level security;
alter table cuestionario_respuestas enable row level security;
alter table cuestionario_respuesta_items enable row level security;
alter table habitaciones enable row level security;
alter table ocupaciones enable row level security;
alter table seguimientos_post_alta enable row level security;

-- Catalogo de fases: lo lee cualquiera del area clinica, lo gestiona direccion.
create policy fases_leer on fases_metodo for select to authenticated
  using (tiene_acceso_clinico());
create policy fases_gestionar on fases_metodo for all to authenticated
  using (es_direccion()) with check (es_direccion());

-- Pacientes.
create policy pacientes_leer on pacientes for select to authenticated
  using (es_direccion() or (tiene_acceso_clinico() and terapeuta_id = auth.uid()));
create policy pacientes_direccion on pacientes for all to authenticated
  using (es_direccion()) with check (es_direccion());
-- El terapeuta referente actualiza la ficha de SU paciente, pero no puede
-- reasignarsela a otro ni sacarla de su centro: eso es de direccion.
create policy pacientes_editar_propio on pacientes for update to authenticated
  using (tiene_acceso_clinico() and terapeuta_id = auth.uid())
  with check (tiene_acceso_clinico() and terapeuta_id = auth.uid());

-- Todo lo que cuelga de un paciente hereda su visibilidad.
create policy sesiones_ver on sesiones for select to authenticated
  using (paciente_id in (select mis_pacientes()));
create policy sesiones_gestionar on sesiones for all to authenticated
  using (paciente_id in (select mis_pacientes()))
  with check (paciente_id in (select mis_pacientes()));

create policy familiares_ver on familiares for select to authenticated
  using (paciente_id in (select mis_pacientes()));
create policy familiares_gestionar on familiares for all to authenticated
  using (paciente_id in (select mis_pacientes()))
  with check (paciente_id in (select mis_pacientes()));

create policy documentos_ver on documentos_clinicos for select to authenticated
  using (paciente_id in (select mis_pacientes()));
create policy documentos_gestionar on documentos_clinicos for all to authenticated
  using (paciente_id in (select mis_pacientes()))
  with check (paciente_id in (select mis_pacientes()));

create policy respuestas_ver on cuestionario_respuestas for select to authenticated
  using (paciente_id in (select mis_pacientes()));
create policy respuestas_gestionar on cuestionario_respuestas for all to authenticated
  using (paciente_id in (select mis_pacientes()))
  with check (paciente_id in (select mis_pacientes()));

create policy items_ver on cuestionario_respuesta_items for select to authenticated
  using (respuesta_id in (
    select id from cuestionario_respuestas where paciente_id in (select mis_pacientes())
  ));
create policy items_gestionar on cuestionario_respuesta_items for all to authenticated
  using (respuesta_id in (
    select id from cuestionario_respuestas where paciente_id in (select mis_pacientes())
  ))
  with check (respuesta_id in (
    select id from cuestionario_respuestas where paciente_id in (select mis_pacientes())
  ));

create policy seguimientos_ver on seguimientos_post_alta for select to authenticated
  using (paciente_id in (select mis_pacientes()));
create policy seguimientos_gestionar on seguimientos_post_alta for all to authenticated
  using (paciente_id in (select mis_pacientes()))
  with check (paciente_id in (select mis_pacientes()));

create policy ocupaciones_ver on ocupaciones for select to authenticated
  using (paciente_id in (select mis_pacientes()));
create policy ocupaciones_gestionar on ocupaciones for all to authenticated
  using (paciente_id in (select mis_pacientes()))
  with check (paciente_id in (select mis_pacientes()));

-- Catalogos clinicos: los lee el area clinica, los gestiona direccion.
create policy cuestionarios_leer on cuestionarios for select to authenticated
  using (tiene_acceso_clinico());
create policy cuestionarios_gestionar on cuestionarios for all to authenticated
  using (es_direccion()) with check (es_direccion());

create policy preguntas_leer on cuestionario_preguntas for select to authenticated
  using (tiene_acceso_clinico());
create policy preguntas_gestionar on cuestionario_preguntas for all to authenticated
  using (es_direccion()) with check (es_direccion());

-- El mapa de habitaciones no es dato clinico de nadie: lo ve el area clinica
-- entera, porque hace falta para saber si hay plaza.
create policy habitaciones_leer on habitaciones for select to authenticated
  using (tiene_acceso_clinico());
create policy habitaciones_gestionar on habitaciones for all to authenticated
  using (es_direccion()) with check (es_direccion());

-- Chat: solo los participantes de la conversacion.
create policy conversaciones_ver on conversaciones for select to authenticated
  using (
    tiene_acceso_clinico()
    and id in (select conversacion_id from conversacion_participantes where perfil_id = auth.uid())
  );
create policy conversaciones_crear on conversaciones for insert to authenticated
  with check (tiene_acceso_clinico() and created_by = auth.uid());
create policy conversaciones_editar on conversaciones for update to authenticated
  using (
    tiene_acceso_clinico()
    and id in (select conversacion_id from conversacion_participantes where perfil_id = auth.uid())
  )
  with check (tiene_acceso_clinico());

create policy participantes_ver on conversacion_participantes for select to authenticated
  using (
    tiene_acceso_clinico()
    and conversacion_id in (
      select conversacion_id from conversacion_participantes where perfil_id = auth.uid()
    )
  );
create policy participantes_gestionar on conversacion_participantes for all to authenticated
  using (tiene_acceso_clinico())
  with check (tiene_acceso_clinico());

create policy mensajes_ver on mensajes for select to authenticated
  using (
    conversacion_id in (
      select conversacion_id from conversacion_participantes where perfil_id = auth.uid()
    )
  );
create policy mensajes_escribir on mensajes for insert to authenticated
  with check (
    autor_id = auth.uid()
    and conversacion_id in (
      select conversacion_id from conversacion_participantes where perfil_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- 14. ALMACENAMIENTO DE DOCUMENTOS CLINICOS
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('documentos-clinicos', 'documentos-clinicos', false)
on conflict (id) do nothing;

create policy documentos_clinicos_leer on storage.objects for select to authenticated
  using (
    bucket_id = 'documentos-clinicos'
    and (storage.foldername(name))[1] in (select mis_pacientes()::text)
  );

create policy documentos_clinicos_subir on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documentos-clinicos'
    and (storage.foldername(name))[1] in (select mis_pacientes()::text)
  );

create policy documentos_clinicos_borrar on storage.objects for delete to authenticated
  using (
    bucket_id = 'documentos-clinicos'
    and (storage.foldername(name))[1] in (select mis_pacientes()::text)
  );

-- ----------------------------------------------------------------------------
-- 15. TIEMPO REAL (chat)
-- ----------------------------------------------------------------------------
alter publication supabase_realtime add table mensajes;

-- ----------------------------------------------------------------------------
-- 16. PARAMETROS
-- ----------------------------------------------------------------------------
insert into configuracion (clave, valor, descripcion) values
  (
    'post_alta_hitos',
    '[1,3,6,12]',
    'Meses tras el alta en los que se programa el seguimiento (fase 7 del metodo).'
  ),
  (
    'riesgo_recaida_faltas',
    '2',
    'Faltas consecutivas a sesion que disparan el aviso de riesgo al terapeuta referente.'
  )
on conflict (clave) do nothing;
