-- ============================================================================
-- FASE 2 (2/3): email marketing
--
-- Campanas escritas dentro de la propia plataforma (texto o HTML), enviadas a
-- listas estaticas o segmentos dinamicos.
--
-- DOS REGLAS INNEGOCIABLES, aplicadas en base de datos y en codigo:
--   1. Solo se envia a contactos con consentimiento explicito registrado
--      (fecha y origen). Sin consentimiento no se crea ni el destinatario.
--   2. El contenido JAMAS revela la condicion de salud del destinatario
--      (regla 12). El envio se bloquea si el texto menciona terminos clinicos.
--
-- Quien envia: solo direccion. Un envio masivo a personas vinculadas a un
-- centro de adicciones es una exposicion legal del grupo entero, no de un
-- comercial. Admisiones puede leer lo enviado a sus contactos.
-- ============================================================================

create type estado_campana as enum ('borrador', 'programada', 'enviando', 'enviada', 'cancelada');
create type estado_envio as enum ('pendiente', 'enviado', 'fallido', 'rebotado');

-- ----------------------------------------------------------------------------
-- 1. PLANTILLAS
-- ----------------------------------------------------------------------------
create table plantillas_email (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  asunto text not null,
  cuerpo_texto text not null,
  cuerpo_html text,
  activa boolean not null default true,
  created_by uuid references perfiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table plantillas_email is
  'Plantillas reutilizables. El cuerpo en texto plano es obligatorio: es el que reciben los clientes de correo que no muestran HTML.';

-- ----------------------------------------------------------------------------
-- 2. CAMPANAS
-- ----------------------------------------------------------------------------
create table campanas_email (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  asunto text not null,
  cuerpo_texto text not null,
  cuerpo_html text,
  -- Destino: una lista estatica o un segmento dinamico (ambos viven en `listas`).
  lista_id uuid references listas (id) on delete set null,
  estado estado_campana not null default 'borrador',
  programada_para timestamptz,
  enviada_at timestamptz,
  -- Contadores materializados: el panel de la campana no recuenta miles de filas.
  total_destinatarios integer not null default 0,
  total_enviados integer not null default 0,
  total_fallidos integer not null default 0,
  total_aperturas integer not null default 0,
  total_clics integer not null default 0,
  total_bajas integer not null default 0,
  created_by uuid references perfiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_programada check (estado <> 'programada' or programada_para is not null)
);

create index idx_campanas_estado on campanas_email (estado, programada_para);

-- ----------------------------------------------------------------------------
-- 3. DESTINATARIOS
--
-- Una fila por persona y campana. El `token` identifica el envio concreto en
-- el pixel de apertura, el redirector de clics y el enlace de baja, sin
-- exponer jamas el id del contacto en una URL (regla 11: nada de datos
-- personales en query strings).
-- ----------------------------------------------------------------------------
create table campana_destinatarios (
  id uuid primary key default gen_random_uuid(),
  campana_id uuid not null references campanas_email (id) on delete cascade,
  contacto_id uuid not null references contactos (id) on delete cascade,
  email text not null,
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  estado estado_envio not null default 'pendiente',
  enviado_at timestamptz,
  abierto_at timestamptz,
  clic_at timestamptz,
  baja_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  unique (campana_id, contacto_id)
);

create index idx_destinatarios_campana on campana_destinatarios (campana_id, estado);

-- ----------------------------------------------------------------------------
-- 4. BAJAS
--
-- Append-only: una baja es la prueba de que la persona ejercio su derecho.
-- Se conserva aunque el contacto vuelva a dar consentimiento despues.
-- ----------------------------------------------------------------------------
create table bajas_marketing (
  id uuid primary key default gen_random_uuid(),
  contacto_id uuid not null references contactos (id) on delete cascade,
  campana_id uuid references campanas_email (id) on delete set null,
  origen text not null default 'enlace_baja',
  created_at timestamptz not null default now()
);

create index idx_bajas_contacto on bajas_marketing (contacto_id);

revoke update, delete on bajas_marketing from anon, authenticated;

-- ----------------------------------------------------------------------------
-- 5. BAJA EN UN CLIC
--
-- Security definer: la ejecuta el enlace del correo, sin sesion iniciada.
-- Retira el consentimiento, lo deja anotado y marca el destinatario.
-- ----------------------------------------------------------------------------
create or replace function darse_de_baja(p_token text)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_destinatario campana_destinatarios%rowtype;
begin
  select * into v_destinatario from campana_destinatarios where token = p_token;
  if not found then
    return false;
  end if;

  update contactos
     set consentimiento_marketing = false,
         consentimiento_marketing_at = now(),
         consentimiento_marketing_origen = 'baja desde campana'
   where id = v_destinatario.contacto_id;

  insert into bajas_marketing (contacto_id, campana_id)
  values (v_destinatario.contacto_id, v_destinatario.campana_id);

  update campana_destinatarios set baja_at = coalesce(baja_at, now())
   where id = v_destinatario.id;

  update campanas_email set total_bajas = total_bajas + 1
   where id = v_destinatario.campana_id and v_destinatario.baja_at is null;

  return true;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. TRIGGERS
-- ----------------------------------------------------------------------------
create trigger trg_plantillas_email_updated_at
  before update on plantillas_email
  for each row execute function fn_touch_updated_at();

create trigger trg_campanas_email_updated_at
  before update on campanas_email
  for each row execute function fn_touch_updated_at();

create trigger trg_auditoria_campanas_email
  after insert or update or delete on campanas_email
  for each row execute function fn_auditoria();

-- ----------------------------------------------------------------------------
-- 7. RLS
-- ----------------------------------------------------------------------------
alter table plantillas_email enable row level security;
alter table campanas_email enable row level security;
alter table campana_destinatarios enable row level security;
alter table bajas_marketing enable row level security;

create policy plantillas_leer on plantillas_email for select to authenticated using (true);
create policy plantillas_gestionar on plantillas_email for all to authenticated
  using (es_direccion()) with check (es_direccion());

create policy campanas_leer on campanas_email for select to authenticated using (true);
create policy campanas_gestionar on campanas_email for all to authenticated
  using (es_direccion()) with check (es_direccion());

create policy destinatarios_leer on campana_destinatarios for select to authenticated using (true);
create policy destinatarios_gestionar on campana_destinatarios for all to authenticated
  using (es_direccion()) with check (es_direccion());

create policy bajas_leer on bajas_marketing for select to authenticated using (true);

-- ----------------------------------------------------------------------------
-- 8. PARAMETROS
-- ----------------------------------------------------------------------------
insert into configuracion (clave, valor, descripcion) values
  (
    'marketing_remitente',
    '""',
    'Remitente de las campanas ("Vida y Tu <hola@dominio.es>"). Vacio = se usa EMAIL_REMITENTE del entorno.'
  ),
  (
    'marketing_pie',
    '"Recibes este correo porque diste tu consentimiento en Vida y Tu. Puedes darte de baja cuando quieras: {baja}"',
    'Pie obligatorio de toda campana. Debe contener el marcador {baja}, que se sustituye por el enlace de baja.'
  ),
  (
    'marketing_terminos_prohibidos',
    '["adiccion","adicciones","adicto","adicta","drogodependencia","desintoxicacion","rehabilitacion","recaida","alcoholismo","alcoholico","cocaina","heroina","ludopatia","tratamiento de adicciones","consumo","abstinencia"]',
    'Palabras que bloquean el envio de una campana (regla 12: el correo jamas revela la condicion de salud del destinatario).'
  ),
  (
    'marketing_lote',
    '40',
    'Destinatarios que se envian en cada pasada del motor. Evita golpear el limite del proveedor de correo.'
  )
on conflict (clave) do nothing;
