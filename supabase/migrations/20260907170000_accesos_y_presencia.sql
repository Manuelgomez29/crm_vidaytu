-- ============================================================================
-- QUIEN ENTRA Y QUIEN ESTA DENTRO
-- ============================================================================
--
-- Dos cosas distintas que se piden juntas y conviene no mezclar:
--
--   · `accesos` es un registro de SEGURIDAD: quien intento entrar, cuando, desde
--     donde y si lo consiguio. Los intentos fallidos son la mitad importante:
--     veinte fallos seguidos contra la misma cuenta a las tres de la manana es
--     justo lo que nadie ve nunca hasta que ya es tarde.
--
--   · `presencia_app` es OPERATIVO: quien tiene la aplicacion abierta ahora
--     mismo. Sirve para saber a quien se le puede pasar un caso urgente, o para
--     entender por que nadie coge el telefono.
--
-- No es un sistema de control horario y no debe convertirse en uno. Por eso la
-- presencia guarda UNA marca de tiempo por persona y nada mas: ni por donde
-- navega, ni cuanto tiempo pasa en cada pantalla, ni un historial de entradas y
-- salidas. La fila se pisa a si misma; no hay registro de ayer.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 1. Registro de accesos
-- ----------------------------------------------------------------------------
create table accesos (
  id bigint generated always as identity primary key,
  -- Nulo cuando el correo no corresponde a ninguna cuenta: el intento se
  -- registra igual, que es precisamente cuando mas interesa.
  usuario_id uuid references perfiles (id) on delete set null,
  email text not null,
  exito boolean not null,
  -- 'clave' = paso de contrasena · '2fa' = segundo factor · 'salida' = cierre
  etapa text not null check (etapa in ('clave', '2fa', 'salida')),
  -- Por que fallo, en corto: 'credenciales', 'demasiados', 'codigo'.
  motivo text,
  ip text,
  agente text,
  created_at timestamptz not null default now()
);

comment on table accesos is
  'Intentos de entrada a la plataforma, con exito o sin el. Registro de seguridad: la mitad util son los fallidos. Se conserva un plazo corto (configuracion.accesos_retencion_dias) porque guarda IP, que es dato personal.';

comment on column accesos.email is
  'El correo TECLEADO, en minusculas. Puede no existir ninguna cuenta con el; se guarda igual porque es lo que permite ver que alguien esta probando nombres.';

create index idx_accesos_fecha on accesos (created_at desc);
create index idx_accesos_email on accesos (email, created_at desc);

alter table accesos enable row level security;

/*
 * Solo direccion lo lee. Y NADIE escribe desde la aplicacion: las filas las
 * pone el servidor con la clave de servicio. Si un usuario pudiera insertar,
 * podria ahogar el registro en ruido y esconder ahi sus propios intentos.
 */
create policy accesos_ver on accesos for select to authenticated
  using (es_direccion());

revoke all on accesos from anon, authenticated;
grant select on accesos to authenticated;

-- ----------------------------------------------------------------------------
-- 2. Presencia: quien esta dentro ahora
-- ----------------------------------------------------------------------------
create table presencia_app (
  perfil_id uuid primary key references perfiles (id) on delete cascade,
  visto_at timestamptz not null default now()
);

comment on table presencia_app is
  'Ultima senal de vida de cada persona con la aplicacion abierta. UNA fila por persona, que se pisa: no es un historial de jornada ni puede usarse como tal.';

alter table presencia_app enable row level security;

/*
 * Cada uno marca la SUYA y nada mas. Sin esto, cualquiera podria fabricar la
 * presencia de un companero —o borrarla—, y una pantalla que dice quien esta
 * disponible tiene que decir la verdad.
 */
create policy presencia_propia on presencia_app for insert to authenticated
  with check (perfil_id = auth.uid());
create policy presencia_propia_actualizar on presencia_app for update to authenticated
  using (perfil_id = auth.uid())
  with check (perfil_id = auth.uid());

-- Verla, solo direccion: es informacion sobre las personas del equipo.
create policy presencia_ver on presencia_app for select to authenticated
  using (es_direccion());

revoke all on presencia_app from anon;
grant select, insert, update on presencia_app to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Parametros (regla 13: nada cableado)
-- ----------------------------------------------------------------------------
insert into configuracion (clave, valor, descripcion)
values
  (
    'accesos_retencion_dias',
    '90'::jsonb,
    'Dias que se conserva el registro de accesos. Guarda IP, que es dato personal: el plazo debe ser el mas corto que siga sirviendo para detectar un ataque.'
  ),
  (
    'presencia_minutos',
    '5'::jsonb,
    'Minutos sin senal tras los cuales se deja de considerar a alguien conectado. La aplicacion late cada 2 minutos mientras la pestana este visible.'
  )
on conflict (clave) do nothing;
