-- ============================================================================
-- FLUJOS DE SEGUIMIENTO
-- ============================================================================
--
-- Hasta ahora el email marketing era una campana: una lista, un correo, un dia.
-- Lo que hace falta para hacer seguimiento a quien nos escribe es otra cosa:
-- una SECUENCIA que empieza cuando pasa algo —se le pone una etiqueta, entra
-- por una fuente, da su consentimiento— y que avanza sola: un correo hoy, una
-- guia a los tres dias, un consejo a la semana, una tarea al comercial si abrio
-- y no contesto.
--
-- EL MODELO ES UN GRAFO, AUNQUE LA PANTALLA DE ESTA SEMANA SEA UNA LISTA
--
-- Cada paso es un nodo con sus aristas de salida (`siguiente_id`, y para las
-- condiciones `siguiente_si_id` / `siguiente_no_id`). El constructor de hoy lo
-- pinta como pasos encadenados con ramas; un lienzo libre de nodos se puede
-- poner encima manana SIN migracion: solo rellenaria `posicion`.
--
-- CADA PASO DE EMAIL ES, POR DENTRO, UNA CAMPANA PERPETUA
--
-- En vez de inventar otro camino de envio, un paso de email tiene su propia
-- fila en `campanas_email` con estado `flujo`, y cada persona que llega a ese
-- paso es un `campana_destinatarios` mas. Con eso hereda, sin una linea nueva:
-- el pie de baja obligatorio, los pixeles de apertura y clic, los tokens de
-- baja, el envio por lotes del cron, el filtro clinico y el cinturon de la base
-- que impide que alguien ajeno al centro reciba el correo. Y las condiciones
-- «si abrio» o «si hizo clic» se leen de donde ya estan.
--
-- LAS TRES BARRERAS SIGUEN SIENDO LAS MISMAS (reglas 5 y 12)
--
-- Un flujo no envia a nadie sin consentimiento registrado, no sale sin pie de
-- baja y no pasa un texto con terminos clinicos. No puede saltarselas porque
-- entra por la misma puerta que las campanas. Lo que anade es el TIEMPO.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Enums
-- ----------------------------------------------------------------------------

-- Una campana que no termina nunca: se le van anadiendo destinatarios.
alter type estado_campana add value if not exists 'flujo';

-- El aviso que manda un paso de flujo al comercial o a direccion.
alter type tipo_notificacion add value if not exists 'aviso_flujo';

-- ----------------------------------------------------------------------------
-- 2. El flujo
-- ----------------------------------------------------------------------------
create table if not exists flujos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  descripcion text,

  -- Nulo = flujo de grupo (bandeja / Metodo HOME). Decide quien lo edita y a
  -- quien puede llegar: el cinturon de la base aplica el centro de la campana.
  centro_id uuid references centros (id) on delete restrict,

  activo boolean not null default false,

  /*
   * Que lo dispara. Un solo disparador por flujo, a proposito: un flujo con
   * tres entradas distintas es tres flujos que nadie sabe por que se mezclaron.
   *
   *   { "tipo": "etiqueta_aplicada", "etiqueta_id": uuid }
   *   { "tipo": "lead_creado", "canal_id"?: uuid, "fuente_id"?: uuid }
   *   { "tipo": "estado_lead", "estado": estado_lead }
   *   { "tipo": "consentimiento" }
   *   { "tipo": "manual" }
   */
  disparador jsonb not null,

  /*
   * Cuando una persona SALE del flujo aunque le queden pasos. Por defecto:
   * si su caso convierte y si retira el consentimiento. Opcional: una etiqueta
   * que, puesta, la saca (por ejemplo «no_molestar» o «ya_atendido»).
   *
   *   { "al_convertir": true, "sin_consentimiento": true, "etiqueta_id"?: uuid }
   */
  salida jsonb not null default '{"al_convertir": true, "sin_consentimiento": true}'::jsonb,

  /*
   * Hasta donde ha mirado el barrido de disparadores. Se pone a `now()` al
   * ACTIVAR el flujo, no a null: activar un flujo no inscribe a todo el
   * historico de golpe. Si se quiere eso, es un acto explicito desde la
   * pantalla, no un efecto secundario de pulsar «activar».
   */
  ultimo_barrido_at timestamptz,

  created_by uuid references perfiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table flujos is
  'Secuencias de seguimiento: un disparador y una cadena de pasos (email, espera, etiqueta, tarea, aviso, lista, condicion). El grafo vive en flujo_pasos.';

create trigger trg_flujos_updated_at
  before update on flujos
  for each row execute function fn_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 3. Los pasos (nodos del grafo)
-- ----------------------------------------------------------------------------
create table if not exists flujo_pasos (
  id uuid primary key default gen_random_uuid(),
  flujo_id uuid not null references flujos (id) on delete cascade,

  -- email | esperar | etiqueta | tarea | aviso | lista | condicion | fin
  tipo text not null,

  /*
   * Lo que hace, segun el tipo:
   *   email     { "plantilla_id": uuid }   (la campana se crea sola, ver campanas_email.flujo_paso_id)
   *   esperar   { "cantidad": 3, "unidad": "dias"|"horas", "solo_horario_centro": false }
   *   etiqueta  { "etiqueta_id": uuid, "accion": "anadir"|"quitar" }
   *   tarea     { "titulo": "...", "vence_en_horas": 24 }
   *   aviso     { "mensaje": "...", "a": "propietario"|"direccion" }
   *   lista     { "lista_id": uuid }
   *   condicion { "tipo": "abrio_email"|"hizo_clic"|"tiene_etiqueta"|"tiene_consentimiento"|"estado_lead",
   *               "paso_id"?: uuid, "etiqueta_id"?: uuid, "estado"?: text }
   *   fin       {}
   */
  config jsonb not null default '{}'::jsonb,

  -- El primer paso del flujo. Exactamente uno por flujo (indice unico abajo).
  es_inicio boolean not null default false,

  -- Orden para la vista de lista. Para el grafo mandan las aristas.
  orden integer not null default 0,

  -- Aristas. Un paso normal usa `siguiente_id`; una condicion usa las otras dos.
  -- Nulo = fin del camino.
  siguiente_id uuid references flujo_pasos (id) on delete set null,
  siguiente_si_id uuid references flujo_pasos (id) on delete set null,
  siguiente_no_id uuid references flujo_pasos (id) on delete set null,

  -- Para el lienzo libre del futuro: { "x": 0, "y": 0 }. Hoy nadie lo lee.
  posicion jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_flujo_pasos_flujo on flujo_pasos (flujo_id, orden);
create unique index if not exists idx_flujo_pasos_inicio on flujo_pasos (flujo_id) where es_inicio;

create trigger trg_flujo_pasos_updated_at
  before update on flujo_pasos
  for each row execute function fn_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 4. La campana de cada paso de email
-- ----------------------------------------------------------------------------
--
-- La relacion va en la campana y no en el paso para que la lista de campanas
-- pueda excluirlas con un `where flujo_paso_id is null`: no son campanas que
-- nadie haya programado, son la tuberia de un flujo.
alter table campanas_email
  add column if not exists flujo_paso_id uuid references flujo_pasos (id) on delete cascade;

create unique index if not exists idx_campanas_flujo_paso on campanas_email (flujo_paso_id)
  where flujo_paso_id is not null;

comment on column campanas_email.flujo_paso_id is
  'Si no es nulo, esta campaña es la tubería de un paso de email de un flujo: estado «flujo», sin lista, con destinatarios que llegan uno a uno. No sale en la lista de campañas.';

-- ----------------------------------------------------------------------------
-- 5. Las inscripciones: una persona recorriendo un flujo
-- ----------------------------------------------------------------------------
create table if not exists flujo_inscripciones (
  id uuid primary key default gen_random_uuid(),
  flujo_id uuid not null references flujos (id) on delete cascade,
  contacto_id uuid not null references contactos (id) on delete cascade,

  -- El caso que la disparo, si lo hubo. Es donde se crean las tareas.
  lead_id uuid references leads (id) on delete set null,

  -- activa | completada | salida | pausada | error
  estado text not null default 'activa',

  paso_actual_id uuid references flujo_pasos (id) on delete set null,

  -- Cuando toca ejecutar el paso actual. Nulo si ya no avanza.
  siguiente_at timestamptz,

  -- Por que salio, se completo o fallo. Legible, para la pantalla.
  motivo text,

  -- Que la disparo: el disparador tal como se evaluo. Para poder explicarlo.
  disparado_por jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  /*
   * Una persona recorre cada flujo UNA vez. Es lo que impide los bucles
   * —un flujo que pone una etiqueta que dispara otro flujo que pone la
   * primera— y lo que hace que reintentar un barrido nunca duplique.
   */
  unique (flujo_id, contacto_id)
);

create index if not exists idx_flujo_inscripciones_pendientes
  on flujo_inscripciones (siguiente_at) where estado = 'activa';
create index if not exists idx_flujo_inscripciones_contacto on flujo_inscripciones (contacto_id);

create trigger trg_flujo_inscripciones_updated_at
  before update on flujo_inscripciones
  for each row execute function fn_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 6. El registro de lo que paso en cada inscripcion
-- ----------------------------------------------------------------------------
--
-- Sin esto, «¿por que a esta persona no le llego el segundo correo?» no tiene
-- respuesta. Con esto, la tiene en una linea.
create table if not exists flujo_eventos (
  id bigint generated always as identity primary key,
  inscripcion_id uuid not null references flujo_inscripciones (id) on delete cascade,
  paso_id uuid references flujo_pasos (id) on delete set null,
  -- inscrita | paso | espera | email_encolado | email_omitido | salida | completada | error
  tipo text not null,
  detalle text,
  created_at timestamptz not null default now()
);

create index if not exists idx_flujo_eventos_inscripcion on flujo_eventos (inscripcion_id, created_at);

-- ----------------------------------------------------------------------------
-- 7. Parametros (regla 13: nada cableado)
-- ----------------------------------------------------------------------------
insert into configuracion (clave, valor, descripcion) values
  ('flujos_max_pasos_por_pasada', '20'::jsonb,
   'Cuántos pasos seguidos puede avanzar una inscripción en una misma pasada del motor. Es el freno contra un flujo mal construido que gira en círculo.'),
  ('flujos_espera_maxima_horario_dias', '7'::jsonb,
   'Si un paso de espera va «solo en horario del centro» y el centro no abre, hasta cuántos días se busca el siguiente hueco antes de enviar igualmente.')
on conflict (clave) do nothing;

-- ----------------------------------------------------------------------------
-- 8. Permisos
-- ----------------------------------------------------------------------------
--
-- Los flujos son marketing: los gobierna la misma regla que las campanas,
-- `manda_en_marketing(centro_id)` — direccion de grupo para los de grupo,
-- direccion del centro para los suyos. Las inscripciones ademas exigen poder
-- ver a la persona: saber que alguien esta en un flujo es saber que existe.
alter table flujos enable row level security;
alter table flujo_pasos enable row level security;
alter table flujo_inscripciones enable row level security;
alter table flujo_eventos enable row level security;

drop policy if exists flujos_gestionar on flujos;
create policy flujos_gestionar on flujos for all to authenticated
  using (manda_en_marketing(centro_id)) with check (manda_en_marketing(centro_id));

drop policy if exists flujo_pasos_gestionar on flujo_pasos;
create policy flujo_pasos_gestionar on flujo_pasos for all to authenticated
  using (manda_en_marketing((select centro_id from flujos f where f.id = flujo_id)))
  with check (manda_en_marketing((select centro_id from flujos f where f.id = flujo_id)));

drop policy if exists flujo_inscripciones_gestionar on flujo_inscripciones;
create policy flujo_inscripciones_gestionar on flujo_inscripciones for all to authenticated
  using (
    manda_en_marketing((select centro_id from flujos f where f.id = flujo_id))
    and puedo_ver_contacto(contacto_id)
  )
  with check (
    manda_en_marketing((select centro_id from flujos f where f.id = flujo_id))
    and puedo_ver_contacto(contacto_id)
  );

drop policy if exists flujo_eventos_leer on flujo_eventos;
create policy flujo_eventos_leer on flujo_eventos for select to authenticated
  using (
    exists (
      select 1 from flujo_inscripciones i
      join flujos f on f.id = i.flujo_id
      where i.id = inscripcion_id
        and manda_en_marketing(f.centro_id)
        and puedo_ver_contacto(i.contacto_id)
    )
  );
