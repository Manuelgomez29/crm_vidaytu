-- ============================================================================
-- FASE 4 (2/2): facturacion y cobros
-- + infraestructura de integraciones (WhatsApp, Zerochats), IA y push
--
-- La facturacion se apoya en los presupuestos aceptados que ya existen: una
-- factura nace de un presupuesto, no de la nada, para que nunca se facture
-- algo que el comercial no propuso.
-- ============================================================================

create type estado_factura as enum ('borrador', 'emitida', 'cobrada', 'anulada');
create type metodo_cobro as enum ('transferencia', 'tarjeta', 'efectivo', 'domiciliacion', 'otro');

-- ----------------------------------------------------------------------------
-- 1. FACTURAS
-- ----------------------------------------------------------------------------
create table facturas (
  id uuid primary key default gen_random_uuid(),
  numero text unique,
  centro_id uuid not null references centros (id),
  lead_id uuid references leads (id) on delete set null,
  presupuesto_id uuid references presupuestos (id) on delete set null,
  conversion_id uuid references conversiones (id) on delete set null,
  cliente_nombre text not null,
  cliente_nif text,
  cliente_direccion text,
  cliente_email text,
  fecha date not null default current_date,
  base_imponible numeric(10, 2) not null default 0,
  iva_porcentaje numeric(5, 2) not null default 0,
  total numeric(10, 2) not null default 0,
  estado estado_factura not null default 'borrador',
  notas text,
  created_by uuid references perfiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_importes_factura check (base_imponible >= 0 and total >= 0)
);

comment on column facturas.cliente_nif is
  'Unico dato fiscal identificativo de la plataforma. Vive aqui y solo aqui: el area comercial sigue sin pedir DNI (regla 11).';

create index idx_facturas_centro on facturas (centro_id, fecha desc);
create index idx_facturas_estado on facturas (estado);

create table factura_lineas (
  id uuid primary key default gen_random_uuid(),
  factura_id uuid not null references facturas (id) on delete cascade,
  concepto text not null,
  cantidad numeric(8, 2) not null default 1 check (cantidad > 0),
  precio_unitario numeric(10, 2) not null check (precio_unitario >= 0),
  orden smallint not null default 1
);

create index idx_lineas_factura on factura_lineas (factura_id, orden);

-- ----------------------------------------------------------------------------
-- 2. COBROS
-- ----------------------------------------------------------------------------
create table cobros (
  id uuid primary key default gen_random_uuid(),
  factura_id uuid references facturas (id) on delete set null,
  lead_id uuid references leads (id) on delete set null,
  centro_id uuid not null references centros (id),
  fecha date not null default current_date,
  importe numeric(10, 2) not null check (importe > 0),
  metodo metodo_cobro not null default 'transferencia',
  es_primer_pago boolean not null default false,
  notas text,
  registrado_por uuid references perfiles (id),
  created_at timestamptz not null default now()
);

create index idx_cobros_centro_fecha on cobros (centro_id, fecha desc);
create index idx_cobros_factura on cobros (factura_id);

-- ----------------------------------------------------------------------------
-- 3. NUMERACION DE FACTURAS
--
-- Serie por centro y ano (VYT-BM-2026-0001). Se asigna al EMITIR, no al crear:
-- un borrador que se descarta no debe consumir numero, porque una serie con
-- huecos es un problema con la gestoria.
-- ----------------------------------------------------------------------------
create table series_factura (
  id uuid primary key default gen_random_uuid(),
  centro_id uuid not null references centros (id) on delete cascade,
  ano smallint not null,
  ultimo_numero integer not null default 0,
  unique (centro_id, ano)
);

create or replace function siguiente_numero_factura(p_centro uuid, p_ano smallint)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_siguiente integer;
  v_slug text;
begin
  insert into series_factura (centro_id, ano, ultimo_numero)
  values (p_centro, p_ano, 1)
  on conflict (centro_id, ano)
    do update set ultimo_numero = series_factura.ultimo_numero + 1
  returning ultimo_numero into v_siguiente;

  select upper(left(regexp_replace(slug, '[^a-zA-Z]', '', 'g'), 2))
    into v_slug from centros where id = p_centro;

  return format('VYT-%s-%s-%s', coalesce(v_slug, 'XX'), p_ano, lpad(v_siguiente::text, 4, '0'));
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. INTEGRACIONES EXTERNAS
--
-- Solo configuracion NO secreta: identificadores de cuenta, numeros de
-- telefono, ultima sincronizacion. Los tokens y claves viven en variables de
-- entorno del servidor, jamas en una fila que se pueda exportar.
-- ----------------------------------------------------------------------------
create table integraciones (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique,
  nombre text not null,
  activa boolean not null default false,
  ajustes jsonb not null default '{}'::jsonb,
  ultima_sincronizacion_at timestamptz,
  ultimo_error text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

insert into integraciones (clave, nombre, ajustes) values
  ('whatsapp', 'WhatsApp Business API (Meta)', '{"telefono_id":"","cuenta_id":""}'),
  ('zerochats', 'Zerochats (Instagram de Lolo Drago)', '{"cuenta":""}'),
  ('google_calendar', 'Google Calendar', '{"calendario_id":""}')
on conflict (clave) do nothing;

-- Conversaciones entrantes de WhatsApp. Se guardan aunque todavia no exista
-- lead: el motor las empareja por telefono en la siguiente pasada.
create table mensajes_whatsapp (
  id uuid primary key default gen_random_uuid(),
  telefono text not null,
  direccion text not null check (direccion in ('entrante', 'saliente')),
  cuerpo text,
  mensaje_ref text unique,
  lead_id uuid references leads (id) on delete set null,
  -- Atribucion click-to-WhatsApp: Meta dice que anuncio trajo a la persona.
  anuncio_ref text,
  anuncio_titulo text,
  recibido_at timestamptz not null default now(),
  procesado_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_whatsapp_telefono on mensajes_whatsapp (telefono, recibido_at desc);
create index idx_whatsapp_sin_procesar on mensajes_whatsapp (recibido_at) where procesado_at is null;

-- ----------------------------------------------------------------------------
-- 5. AUDITORIA DE LA IA
--
-- Toda pregunta al asistente queda registrada: quien pregunto, que pregunto y
-- con que permisos se respondio. Es requisito de la EIPD.
-- ----------------------------------------------------------------------------
create table ia_consultas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid references perfiles (id) on delete set null,
  ambito text not null check (ambito in ('clinica', 'direccion', 'psicologia')),
  pregunta text not null,
  respuesta text,
  paciente_id uuid references pacientes (id) on delete set null,
  filas_consultadas integer,
  error text,
  created_at timestamptz not null default now()
);

create index idx_ia_usuario on ia_consultas (usuario_id, created_at desc);

revoke update, delete on ia_consultas from anon, authenticated;

-- ----------------------------------------------------------------------------
-- 6. NOTIFICACIONES PUSH (PWA)
-- ----------------------------------------------------------------------------
create table push_suscripciones (
  id uuid primary key default gen_random_uuid(),
  perfil_id uuid not null references perfiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  ultimo_uso_at timestamptz
);

create index idx_push_perfil on push_suscripciones (perfil_id);

-- ----------------------------------------------------------------------------
-- 7. TRIGGERS
-- ----------------------------------------------------------------------------
create trigger trg_facturas_updated_at before update on facturas
  for each row execute function fn_touch_updated_at();
create trigger trg_integraciones_updated_at before update on integraciones
  for each row execute function fn_touch_updated_at();

create trigger trg_auditoria_facturas
  after insert or update or delete on facturas
  for each row execute function fn_auditoria();
create trigger trg_auditoria_cobros
  after insert or update or delete on cobros
  for each row execute function fn_auditoria();

-- ----------------------------------------------------------------------------
-- 8. RLS
--
-- Administracion economica ve el dinero de los tres centros, pero NO el area
-- clinica ni las notas de los casos. Direccion ve todo.
-- ----------------------------------------------------------------------------
alter table facturas enable row level security;
alter table factura_lineas enable row level security;
alter table cobros enable row level security;
alter table series_factura enable row level security;
alter table integraciones enable row level security;
alter table mensajes_whatsapp enable row level security;
alter table ia_consultas enable row level security;
alter table push_suscripciones enable row level security;

create policy facturas_ver on facturas for select to authenticated
  using (es_direccion() or mi_rol() = 'administracion');
create policy facturas_gestionar on facturas for all to authenticated
  using (es_direccion() or mi_rol() = 'administracion')
  with check (es_direccion() or mi_rol() = 'administracion');

create policy lineas_ver on factura_lineas for select to authenticated
  using (es_direccion() or mi_rol() = 'administracion');
create policy lineas_gestionar on factura_lineas for all to authenticated
  using (es_direccion() or mi_rol() = 'administracion')
  with check (es_direccion() or mi_rol() = 'administracion');

create policy cobros_ver on cobros for select to authenticated
  using (es_direccion() or mi_rol() = 'administracion');
create policy cobros_gestionar on cobros for all to authenticated
  using (es_direccion() or mi_rol() = 'administracion')
  with check (es_direccion() or mi_rol() = 'administracion');

create policy series_ver on series_factura for select to authenticated
  using (es_direccion() or mi_rol() = 'administracion');

create policy integraciones_ver on integraciones for select to authenticated
  using (es_direccion());
create policy integraciones_gestionar on integraciones for all to authenticated
  using (es_direccion()) with check (es_direccion());

-- Los mensajes de WhatsApp son actividad comercial: los ve quien ve el caso.
create policy whatsapp_ver on mensajes_whatsapp for select to authenticated
  using (es_direccion() or mi_rol() = 'admisiones');

-- Cada uno ve sus propias preguntas a la IA; direccion, todas (auditoria).
create policy ia_ver on ia_consultas for select to authenticated
  using (es_direccion() or usuario_id = auth.uid());

create policy push_propias on push_suscripciones for all to authenticated
  using (perfil_id = auth.uid()) with check (perfil_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 9. PARAMETROS
-- ----------------------------------------------------------------------------
insert into configuracion (clave, valor, descripcion) values
  ('iva_porcentaje', '0', 'IVA por defecto de las facturas. Los servicios sanitarios suelen estar exentos: confirmar con la gestoria.'),
  ('datos_fiscales', '{"razon_social":"","nif":"","direccion":"","email":""}', 'Datos fiscales del grupo que aparecen en las facturas.'),
  ('ia_modelo', '"claude-sonnet-5"', 'Modelo del asistente de IA. Requiere ANTHROPIC_API_KEY en el servidor.'),
  ('ia_activa', 'false', 'Interruptor general del asistente de IA. Activar solo tras firmar el DPA con el proveedor.')
on conflict (clave) do nothing;
