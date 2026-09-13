-- ============================================================================
-- FUENTES DE CAPTACION: CADA LANDING CON SU LLAVE Y SU SITIO
-- ============================================================================
--
-- Hasta ahora todo lo que entraba por formulario compartia un unico secreto
-- (`FORMULARIOS_WEBHOOK_SECRET`) y decia de que centro era. Con una landing eso
-- pasaba; con dos —Bellamar y Eclipse— y las que vengan, deja de pasar:
--
--   · Un solo secreto para todas significa que si se filtra el de una landing,
--     hay que cambiarlo en TODAS para revocarlo. Y no hay forma de saber cual lo
--     filtro.
--
--   · El centro venia en el cuerpo de la peticion y se le creia. Una landing mal
--     configurada —o de la que alguien copie el codigo— podia meter leads en
--     Horizonte, que es el centro restringido. El origen debe decidir el centro,
--     no lo que el origen diga de si mismo.
--
--   · Y si una landing dejaba de enviar, no se notaba. Es el mismo problema que
--     tenia el motor: no llegan leads y eso se parece muchisimo a que no haya
--     demanda.
--
-- Una fila por landing, con su token propio, su centro fijado desde aqui y la
-- fecha del ultimo lead que trajo.
--
-- EL TOKEN NO SE GUARDA. Se guarda su huella (SHA-256). Si alguien se lleva un
-- volcado de la base no se lleva las llaves de las landings, solo huellas que no
-- sirven para entrar. El token se enseña UNA vez, al crearlo.
-- ----------------------------------------------------------------------------

create table fuentes_captacion (
  id uuid primary key default gen_random_uuid(),
  -- Identificador legible, para reconocerla en un listado: `landing-bellamar`.
  slug text not null unique,
  nombre text not null,

  -- Huella del token, nunca el token.
  token_hash text not null unique,

  /*
   * Lo que la fuente IMPONE. Nulo en centro = la bandeja de grupo, que es lo
   * correcto para una landing de marca donde todavia no se sabe a quien le toca.
   */
  centro_id uuid references centros (id) on delete restrict,
  canal_id uuid not null references canales (id) on delete restrict,
  -- Para Bellamar tiene sentido (solo ofrece ingreso residencial); para Eclipse,
  -- que ofrece cuatro modalidades, se deja nula y la manda la landing.
  modalidad_id uuid references modalidades (id) on delete set null,
  subcanal text,

  activa boolean not null default true,

  -- Para saber si sigue viva sin tener que preguntarle a nadie.
  ultimo_lead_at timestamptz,
  total_leads integer not null default 0,

  created_by uuid references perfiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table fuentes_captacion is
  'Cada origen que mete leads por webhook —una landing, un formulario— con su token propio. El centro y el canal los impone esta tabla, no lo que envie la fuente.';

comment on column fuentes_captacion.token_hash is
  'SHA-256 del token en hexadecimal. El token en claro no se guarda en ningun sitio: se enseña una vez al crearlo y quien lo pierda pide uno nuevo.';

comment on column fuentes_captacion.centro_id is
  'Centro al que van sus leads. Nulo = bandeja de grupo. Lo que venga en el cuerpo de la peticion se ignora.';

create index idx_fuentes_activas on fuentes_captacion (activa) where activa;

create trigger tg_fuentes_updated_at before update on fuentes_captacion
  for each row execute function fn_touch_updated_at();

alter table fuentes_captacion enable row level security;

/*
 * Las gestiona la direccion de GRUPO: crear una fuente es decidir por donde
 * entra trabajo a la casa, y ademas puede apuntar a cualquier centro.
 *
 * La direccion de un centro VE las suyas —le sirve para saber si su landing
 * sigue trayendo gente— pero no las toca. Sin el `token_hash`, que no le hace
 * falta para nada y es lo unico sensible de la fila.
 */
create policy fuentes_gestionar on fuentes_captacion for all to authenticated
  using (manda_en_grupo()) with check (manda_en_grupo());

create policy fuentes_ver_las_suyas on fuentes_captacion for select to authenticated
  using (centro_id is not null and manda_en(centro_id));

revoke all on fuentes_captacion from anon, authenticated;
grant select on fuentes_captacion to authenticated;
grant insert, update, delete on fuentes_captacion to authenticated;

-- ----------------------------------------------------------------------------
-- De donde vino cada lead
--
-- `origen_sistema` ya guardaba texto libre («formulario_web»), que vale para
-- saber el tipo pero no CUAL. Con dos landings del mismo tipo hace falta
-- distinguirlas para poder comparar cual convierte mejor.
-- ----------------------------------------------------------------------------
alter table leads
  add column if not exists fuente_id uuid references fuentes_captacion (id) on delete set null;

comment on column leads.fuente_id is
  'Fuente de captacion por la que entro, si entro por una. Permite comparar landings entre si en el cruce del panel.';

create index if not exists idx_leads_fuente on leads (fuente_id) where fuente_id is not null;
