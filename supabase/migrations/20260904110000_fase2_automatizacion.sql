-- ============================================================================
-- FASE 2 (1/3): automatizacion comercial
--
-- Lead scoring, coste por lead, prevision de ingresos, reactivacion de
-- "no es el momento" y peticion de resena. Todo lo que se puede automatizar
-- con los datos que la plataforma YA tiene, sin depender de ninguna API
-- externa.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. LEAD SCORING
--
-- La puntuacion la calcula la aplicacion leyendo los pesos de `configuracion`
-- (regla 13: nada cableado). Aqui solo se guarda el resultado, para poder
-- ordenar y filtrar en base de datos sin recalcular en cada consulta.
-- ----------------------------------------------------------------------------
alter table leads
  add column if not exists puntuacion smallint not null default 0,
  add column if not exists puntuacion_at timestamptz;

comment on column leads.puntuacion is
  'Calor del caso (0-100). Lo calcula la app con los pesos de configuracion.scoring_pesos.';

create index if not exists idx_leads_puntuacion on leads (puntuacion desc)
  where estado not in ('convertido', 'perdido', 'no_valido', 'derivado');

-- ----------------------------------------------------------------------------
-- 2. GASTO PUBLICITARIO
--
-- Coste por lead y por conversion. Meta y Google Ads no se conectan (haria
-- falta acceso a las cuentas de anuncios): direccion introduce el gasto por
-- campana y periodo, y la plataforma lo cruza con la atribucion UTM que ya
-- guarda cada lead.
-- ----------------------------------------------------------------------------
create table if not exists gasto_campanas (
  id uuid primary key default gen_random_uuid(),
  plataforma text not null check (plataforma in ('meta', 'google', 'otro')),
  campana text not null,
  centro_id uuid references centros (id),
  desde date not null,
  hasta date not null,
  importe numeric(10, 2) not null check (importe >= 0),
  notas text,
  created_by uuid references perfiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_gasto_periodo check (hasta >= desde)
);

comment on table gasto_campanas is
  'Gasto publicitario por campana. Se cruza con leads.utm_campaign para el coste por lead.';

create index if not exists idx_gasto_campana on gasto_campanas (campana, desde, hasta);

create trigger trg_gasto_campanas_updated_at
  before update on gasto_campanas
  for each row execute function fn_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 3. SEGUIMIENTO DE RESENAS
--
-- Tras una conversion validada la plataforma propone pedir resena en Google.
-- Se marca en la propia conversion para no proponerlo dos veces.
-- ----------------------------------------------------------------------------
alter table conversiones
  add column if not exists resena_propuesta_at timestamptz,
  add column if not exists resena_enviada_at timestamptz;

comment on column conversiones.resena_propuesta_at is
  'Cuando la plataforma genero la tarea de pedir resena. Evita proponerlo dos veces.';

-- ----------------------------------------------------------------------------
-- 4. REACTIVACION DE PERDIDOS
--
-- Un "no es el momento" no es un no: a los 90 dias se genera la tarea de
-- retomar. Se marca en el lead para no repetirla en cada pasada del motor.
-- ----------------------------------------------------------------------------
alter table leads
  add column if not exists reactivacion_propuesta_at timestamptz;

comment on column leads.reactivacion_propuesta_at is
  'Cuando se genero la tarea de reactivacion de un perdido por "no es el momento".';

-- ----------------------------------------------------------------------------
-- 5. PARAMETROS NUEVOS
-- ----------------------------------------------------------------------------
insert into configuracion (clave, valor, descripcion) values
  (
    'scoring_pesos',
    '{"urgencia_alta":25,"urgencia_media":10,"cita_agendada":25,"presupuesto":15,"respondio":15,"canal_prescriptor":10,"canal_recomendacion":10,"afectado_contacta":5,"penalizacion_por_dia_sin_actividad":-2,"penalizacion_maxima":-30}',
    'Pesos del lead scoring (0-100). Cambiarlos recalcula la puntuacion en la siguiente pasada del motor.'
  ),
  (
    'prevision_probabilidad',
    '{"nuevo":5,"contactado":10,"cita_agendada":25,"cita_realizada":40,"en_valoracion":60,"reabierto":15,"derivado":30}',
    'Probabilidad (%) de cierre por estado, para la prevision de ingresos ponderada del panel.'
  ),
  (
    'reactivacion_dias',
    '90',
    'Dias tras los que se propone retomar un caso perdido por "no es el momento".'
  ),
  (
    'resena_activa',
    'true',
    'Si la plataforma propone pedir resena en Google tras validar una conversion.'
  ),
  (
    'resena_url',
    '""',
    'Enlace de resenas de Google del grupo. Vacio = la tarea se genera igual, sin enlace.'
  ),
  (
    'resena_plantilla',
    '"Hola {nombre}, gracias por confiar en nosotros. Si te apetece, nos ayudaria mucho que compartieras tu experiencia aqui: {enlace}. Un saludo, {profesional}"',
    'Texto sugerido para pedir resena. JAMAS menciona el motivo de consulta (regla 12). Marcadores: {nombre} {enlace} {profesional}'
  )
on conflict (clave) do nothing;

-- ----------------------------------------------------------------------------
-- 6. RLS
-- ----------------------------------------------------------------------------
alter table gasto_campanas enable row level security;

-- El gasto publicitario es informacion economica del grupo: solo direccion.
create policy gasto_direccion on gasto_campanas for all to authenticated
  using (es_direccion()) with check (es_direccion());

create trigger trg_auditoria_gasto_campanas
  after insert or update or delete on gasto_campanas
  for each row execute function fn_auditoria();
