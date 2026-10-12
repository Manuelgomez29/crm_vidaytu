-- ============================================================================
-- DOMINIOS DE CORREO
-- ============================================================================
--
-- Configurar el envio de correo era un paseo por tres sitios: crear el dominio
-- en Resend, copiar sus registros DNS al proveedor del dominio, volver a Resend
-- a ver si verificaba, y escribir despues el remitente en el centro. Cuatro
-- pantallas de tres herramientas para una cosa que se hace una vez por centro y
-- que, si se hace mal, falla a las tres de la manana en el envio.
--
-- Ahora el CRM lo lleva: direccion anade el dominio aqui, el CRM lo da de alta
-- en Resend por API, enseña los registros exactos que hay que pegar en el DNS y
-- comprueba solo —cada pasada del motor y cuando se le pide— si ya estan. Lo
-- unico que sigue fuera es pegar los registros en el DNS, que no hay forma de
-- hacer desde aqui.
--
-- Y el remitente de un centro solo puede usar un dominio verificado: un
-- remitente sobre un dominio sin verificar no falla al guardar, falla al
-- enviar, con los destinatarios ya preparados.
-- ============================================================================

create table if not exists dominios_correo (
  id uuid primary key default gen_random_uuid(),

  -- El dominio tal cual: «bellamarcentro.com». Se guarda en minusculas.
  dominio text not null unique,

  -- Su identificador en Resend. Es la clave para preguntar, verificar y borrar.
  resend_id text unique,

  -- Region de envio en Resend. Siempre la UE para datos de aqui (regla 11).
  region text not null default 'eu-west-1',

  -- Tal cual lo dice Resend: not_started | pending | verified | failed |
  -- temporary_failure. Se guarda crudo y se traduce al pintarlo, para que un
  -- valor nuevo de Resend no rompa nada.
  estado text not null default 'not_started',

  /*
   * Los registros DNS que hay que pegar, con su estado uno a uno:
   *   [{ "registro": "DKIM"|"SPF"|"Tracking", "tipo": "TXT"|"MX"|"CNAME",
   *      "nombre": "resend._domainkey", "valor": "...", "prioridad"?: 10,
   *      "estado": "not_started"|"pending"|"verified"|"failed" }]
   */
  registros jsonb not null default '[]'::jsonb,

  verificado_at timestamptz,
  ultimo_chequeo_at timestamptz,
  ultimo_error text,

  created_by uuid references perfiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table dominios_correo is
  'Dominios desde los que se envía correo, dados de alta en Resend por API desde el CRM, con sus registros DNS y su estado de verificación.';

create trigger trg_dominios_correo_updated_at
  before update on dominios_correo
  for each row execute function fn_touch_updated_at();

-- Los dominios son infraestructura del grupo: los gestiona la direccion de grupo.
alter table dominios_correo enable row level security;

drop policy if exists dominios_correo_grupo on dominios_correo;
create policy dominios_correo_grupo on dominios_correo for all to authenticated
  using (manda_en_grupo()) with check (manda_en_grupo());

-- Toda la direccion puede VER cuales hay, para elegir remitente en su centro.
drop policy if exists dominios_correo_leer on dominios_correo;
create policy dominios_correo_leer on dominios_correo for select to authenticated
  using (mi_rol() = 'direccion');
