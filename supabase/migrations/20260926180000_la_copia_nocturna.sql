-- ============================================================================
-- LA COPIA NOCTURNA
-- ============================================================================
--
-- El contrato de HighLevel se renueva mes a mes y, cuando se deja de pagar, se
-- acaba el acceso. Sin plazo de gracia. Y no hace falta decidirlo: una tarjeta
-- caducada llega al mismo sitio.
--
-- Hoy hay ya un mes de contactos y conversaciones ahi dentro, y ninguna copia
-- en ningun otro sitio. Esta tabla es esa copia.
--
-- POR QUE UN ESPEJO EN CRUDO Y NO UN MODELO.
--
-- La tentacion es traducir cada contacto de HighLevel a nuestro modelo al
-- copiarlo. Seria un error: cualquier fallo de traduccion se convierte en
-- perdida silenciosa, y no se descubre hasta el dia que hace falta. Se guarda
-- lo que devuelve su API, tal cual, y la traduccion se hace en enero —una vez,
-- con todo delante y pudiendo repetirla si sale mal, porque el original sigue
-- aqui—.
--
-- Es la misma regla que el resto del anexo: guardar primero, interpretar
-- despues.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EL ESPEJO
-- ----------------------------------------------------------------------------
create table canal_espejo (
  id bigint generated always as identity primary key,
  sistema text not null default 'highlevel',
  -- 'contacto' | 'oportunidad' | 'conversacion' | 'mensaje' | 'usuario' |
  -- 'campo' | 'valor' | 'embudo' | 'subcuenta'
  tipo text not null,
  -- El identificador en el sistema de origen.
  ref text not null,
  -- Para lo que cuelga de otra cosa: los mensajes de una conversacion.
  ref_padre text,

  contenido jsonb not null,

  primera_copia_at timestamptz not null default now(),
  -- Cuando se vio por ultima vez. Si deja de verse, siguio existiendo hasta
  -- aqui: es lo que permite saber que algo se borro alli.
  visto_at timestamptz not null default now(),

  unique (sistema, tipo, ref)
);

create index idx_canal_espejo_tipo on canal_espejo (sistema, tipo);
create index idx_canal_espejo_padre on canal_espejo (ref_padre) where ref_padre is not null;
create index idx_canal_espejo_visto on canal_espejo (visto_at);

comment on table canal_espejo is
  'Copia en crudo de lo que hay en HighLevel. Es lo que permite volver al CRM sin perder el trabajo hecho allí durante el piloto. No se traduce al modelo: eso es la decisión de enero.';

-- ----------------------------------------------------------------------------
-- 2. CADA PASADA DEJA CONSTANCIA
-- ----------------------------------------------------------------------------
--
-- Una copia de seguridad que falla en silencio es peor que no tenerla: da
-- confianza sin dar respaldo. Cada pasada escribe que hizo, cuanto tardo y que
-- fallo, y la pantalla de puesta en marcha puede avisar si hace dias que no
-- corre.
create table canal_copias (
  id uuid primary key default gen_random_uuid(),
  sistema text not null default 'highlevel',
  inicio timestamptz not null default now(),
  fin timestamptz,
  ok boolean not null default false,
  -- {"contacto": 86, "conversacion": 20, "mensaje": 143, ...}
  recuentos jsonb not null default '{}'::jsonb,
  /*
   * Verdadero si alguna lista venia completa y no pudimos seguir paginando.
   * Se registra en vez de callarlo: una copia incompleta que se cree completa
   * es justo la que falla el dia que hace falta.
   */
  truncado boolean not null default false,
  error text
);

create index idx_canal_copias_inicio on canal_copias (sistema, inicio desc);

-- ----------------------------------------------------------------------------
-- 3. QUIEN LO VE
-- ----------------------------------------------------------------------------
-- Igual que el resto del anexo: solo direccion de grupo. Aqui dentro hay
-- conversaciones enteras.
alter table canal_espejo enable row level security;
alter table canal_copias enable row level security;

create policy canal_espejo_direccion on canal_espejo for all to authenticated
  using (manda_en_grupo()) with check (manda_en_grupo());
create policy canal_copias_direccion on canal_copias for all to authenticated
  using (manda_en_grupo()) with check (manda_en_grupo());

-- ----------------------------------------------------------------------------
-- 4. AJUSTES (regla 13)
-- ----------------------------------------------------------------------------

insert into configuracion (clave, valor, descripcion)
values
  (
    'canal_copia_cada_horas',
    '24'::jsonb,
    'Cada cuántas horas se trae la copia completa de HighLevel. El motor corre cada 15 minutos y comprueba si toca; poner 24 es «una vez al día».'
  ),
  (
    'canal_espejo_retencion_dias',
    '180'::jsonb,
    'Días que se conserva el espejo. Tiene que cubrir el piloto entero con margen: es la copia que permite volver. En enero se vuelca al modelo o se borra, y esa decisión sustituye a este plazo.'
  )
on conflict (clave) do nothing;
