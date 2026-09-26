-- ============================================================================
-- EL ANEXO DE CANALES SOCIALES
-- ============================================================================
--
-- Durante tres meses, los contactos que llegan por redes sociales se atienden
-- en HighLevel. Aqui no se trabajan: aqui se REGISTRAN, para que en enero se
-- pueda volver sin haber perdido nada.
--
-- POR QUE NO TOCA `contactos` NI `leads`.
--
-- Lo caro de esta integracion no es el webhook: es la cirugia de identidad que
-- haria falta para que un contacto de Instagram viva en el directorio —quitar
-- la obligatoriedad del telefono, cambiar la clave de deduplicado, desactivar
-- la reapertura automatica—. Eso se hace sobre una base con casos reales
-- dentro y no se deshace, y la decision que lo justifica es provisional.
--
-- Asi que el anexo vive aparte, con sus propias tablas. Si en enero HighLevel
-- se queda, se hace la cirugia UNA VEZ, con tres meses de datos reales delante
-- en lugar de a ciegas, y estas filas se vuelcan al modelo de verdad. Si no se
-- queda, se apaga el anexo y el CRM sigue exactamente como estaba.
--
-- Regla de fondo: ningun cambio irreversible al servicio de una decision
-- provisional.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. QUIEN ES QUIEN, SIN TELEFONO
-- ----------------------------------------------------------------------------
--
-- La persona de Instagram no tiene telefono, y el telefono es justo la clave
-- con la que deduplica el CRM. Aqui la clave es otra: el identificador estable
-- que da el sistema de origen.
--
-- La pareja PLATAFORMA + CUENTA importa y por eso se guarda: el mismo
-- identificador en dos cuentas distintas no tiene por que ser la misma
-- persona, y el grupo tiene dos Instagram.
create table canal_identidades (
  id uuid primary key default gen_random_uuid(),

  -- Quien nos lo cuenta: 'zerochats', 'manychat'…
  sistema text not null,
  -- Donde escribio: 'instagram', 'whatsapp', 'messenger'…
  plataforma text not null,
  -- La cuenta receptora, cuando el evento la dice.
  cuenta text,

  /*
   * `ref_sistema` es el identificador del lead en el sistema de origen, y es
   * la clave. Lo recomienda la propia documentacion de ZeroChats: el usuario
   * de Instagram puede cambiarse, el identificador no.
   */
  ref_sistema text not null,
  -- El identificador en la plataforma (el de Instagram). SIEMPRE texto: los de
  -- Instagram no caben en un numero de JSON sin perder precision.
  ref_plataforma text,
  usuario text,

  nombre text,
  -- Sin `not null` y sin formato obligatorio, a proposito: que no haya
  -- telefono es el caso NORMAL aqui, no la excepcion.
  telefono text,
  email text,

  -- El contacto en HighLevel, cuando se sepa. Es el puente entre los dos.
  ref_highlevel text,

  -- Etapa y etiquetas tal y como las cuenta el origen, sin traducir.
  estado text,
  etiquetas text[] not null default '{}',

  /*
   * A quien corresponde en el directorio. Nulo durante todo el piloto: la
   * union con el modelo es la decision de enero, no de ahora. Existe la
   * columna para que el volcado de enero tenga donde escribir.
   */
  contacto_id uuid references contactos (id) on delete set null,

  primer_evento_at timestamptz not null default now(),
  ultimo_evento_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (sistema, ref_sistema)
);

create index idx_canal_identidades_plataforma on canal_identidades (plataforma, ref_plataforma);
create index idx_canal_identidades_usuario on canal_identidades (usuario);
create index idx_canal_identidades_telefono on canal_identidades (telefono) where telefono is not null;
create index idx_canal_identidades_highlevel on canal_identidades (ref_highlevel) where ref_highlevel is not null;

create trigger trg_touch_canal_identidades before update on canal_identidades
  for each row execute function fn_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 2. LO QUE LLEGO, TAL CUAL LLEGO
-- ----------------------------------------------------------------------------
--
-- Se guarda el evento entero antes de interpretarlo. Es lo que permite que, si
-- en enero el modelo cambia, los datos originales sigan ahi para volver a
-- leerlos con otras reglas.
--
-- `entrega_ref` es el identificador del ENVIO, no del lead. ZeroChats entrega
-- «al menos una vez»: un reintento trae el mismo envio otra vez, y el indice
-- unico es lo que hace que no se procese dos veces.
create table canal_eventos (
  id bigint generated always as identity primary key,
  sistema text not null,
  evento text not null,
  entrega_ref text,
  identidad_id uuid references canal_identidades (id) on delete set null,

  payload jsonb,
  -- Cuando se vacio el contenido por politica de conservacion (ver abajo).
  payload_purgado_at timestamptz,

  recibido_at timestamptz not null default now(),
  procesado_at timestamptz,
  error text,
  ip text
);

create unique index idx_canal_eventos_entrega on canal_eventos (sistema, entrega_ref)
  where entrega_ref is not null;
create index idx_canal_eventos_recibido on canal_eventos (recibido_at desc);
create index idx_canal_eventos_sin_procesar on canal_eventos (recibido_at) where procesado_at is null;

comment on table canal_eventos is
  'Eventos en crudo de los canales sociales. El contenido se vacía al vencer el plazo de conservación; la traza (quién, cuándo, de dónde, si se entregó) se conserva.';

-- ----------------------------------------------------------------------------
-- 3. QUIEN LO VE
-- ----------------------------------------------------------------------------
--
-- Solo direccion de grupo. Son conversaciones sobre consumo llegando de
-- Instagram: categoria especial (regla 11). Durante el piloto nadie las
-- trabaja desde aqui —se trabajan en HighLevel—, asi que nadie mas necesita
-- verlas, y lo que no se necesita no se abre.
alter table canal_identidades enable row level security;
alter table canal_eventos enable row level security;

create policy canal_identidades_direccion on canal_identidades for all to authenticated
  using (manda_en_grupo()) with check (manda_en_grupo());
create policy canal_eventos_direccion on canal_eventos for all to authenticated
  using (manda_en_grupo()) with check (manda_en_grupo());

-- ----------------------------------------------------------------------------
-- 4. AJUSTES (regla 13: nada cableado)
-- ----------------------------------------------------------------------------

insert into configuracion (clave, valor, descripcion)
values (
  'canal_retencion_dias',
  '90'::jsonb,
  'Días que se conserva el CONTENIDO de un evento social antes de vaciarlo. La traza —identidad, origen, fechas, entrega— se conserva mientras dure la relación. Guardar conversaciones sobre consumo indefinidamente no es gratis: son datos de categoría especial.'
)
on conflict (clave) do nothing;

-- El limite del webhook entrante. Va aparte del de formularios porque el
-- trafico es otro: rafagas de una campana pueden traer muchos en un minuto.
update configuracion
set valor = valor || '{"canal_social": { "maximo": 240, "ventana": 60 }}'::jsonb
where clave = 'limites_peticiones';
