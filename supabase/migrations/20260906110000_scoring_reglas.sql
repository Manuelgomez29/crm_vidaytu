-- ============================================================================
-- REGLAS DE PUNTUACION
--
-- Hasta ahora los pesos vivian en `configuracion.scoring_pesos`: un bloque JSON
-- que solo se podia tocar editando la clave a mano. Funcionaba, pero direccion
-- no podia ajustar nada sin pedirlo, y anadir una senal nueva exigia tocar
-- codigo.
--
-- SOBRE LA FORMA DE `condicion`, que es la decision que merece explicacion:
--
-- Lo natural seria un motor de condiciones libres (campo / operador / valor).
-- Se ha hecho a proposito mas cerrado: la condicion nombra una SENAL de un
-- catalogo conocido, y el codigo sabe calcular cada una.
--
-- El motivo es que una regla con condicion libre puede no encajar nunca —un
-- nombre de campo mal escrito, un operador que no aplica al tipo— y fallar en
-- silencio: la puntuacion sale mas baja y nadie se entera. Con un catalogo
-- cerrado, una regla mal puesta se ve al guardarla. Y sobre todo permite
-- seguir explicando POR QUE un caso puntua lo que puntua, que es lo unico que
-- hace que la gente se fie del numero.
--
-- Anadir una senal nueva sigue siendo trabajo de codigo. Ajustar cuanto pesa
-- cada una, activarla o apagarla, ya no.
-- ============================================================================

create table scoring_reglas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) between 1 and 80),

  -- {"senal": "urgencia_alta"} — la senal debe existir en el catalogo del
  -- codigo (src/lib/scoring.ts). Se valida al guardar desde administracion.
  condicion jsonb not null,

  -- Positivos suman, negativos restan. El total se recorta a 0-100.
  puntos int not null check (puntos between -100 and 100),

  activa boolean not null default true,
  -- Para poder explicar la regla en el desglose sin recalcular nada.
  descripcion text,
  created_by uuid references perfiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (nombre)
);

comment on table scoring_reglas is
  'Cuanto suma o resta cada senal al calor de un caso. La senal sale de un catalogo cerrado: una regla mal puesta se ve al guardarla, no meses despues en una puntuacion baja.';

create trigger trg_scoring_reglas_updated
  before update on scoring_reglas
  for each row execute function fn_touch_updated_at();

-- ----------------------------------------------------------------------------
-- RLS: las lee todo el area comercial —hace falta para explicar el desglose—
-- pero solo direccion las cambia. Que un comercial pueda subirse los puntos de
-- sus propios casos vaciaria de sentido la cola de prioridad.
-- ----------------------------------------------------------------------------
alter table scoring_reglas enable row level security;

create policy scoring_leer on scoring_reglas for select to authenticated
  using (mi_rol() in ('direccion', 'admisiones'));

create policy scoring_direccion on scoring_reglas for all to authenticated
  using (es_direccion()) with check (es_direccion());

revoke all on scoring_reglas from anon;
grant select on scoring_reglas to authenticated;
grant insert, update, delete on scoring_reglas to authenticated;

-- ----------------------------------------------------------------------------
-- Reglas iniciales. Salen de la experiencia del equipo, no de datos: son una
-- hipotesis razonable para empezar, y estan pensadas para recalibrarse cuando
-- haya conversiones suficientes para mirar que predijo de verdad.
-- ----------------------------------------------------------------------------
insert into scoring_reglas (nombre, condicion, puntos, descripcion) values
  ('Urgencia alta',            '{"senal":"urgencia_alta"}',            25, 'Lo marcó como urgente quien atendió'),
  ('Urgencia media',           '{"senal":"urgencia_media"}',           10, null),
  ('Pidió cita en el primer contacto', '{"senal":"cita_agendada"}',    20, 'Quien pide cita de entrada suele venir decidido'),
  ('Canal recomendación',      '{"senal":"canal_recomendacion"}',      15, 'Viene de alguien que ya pasó por el centro'),
  ('Canal prescriptor',        '{"senal":"canal_prescriptor"}',        15, null),
  ('Respondió en menos de 1 h','{"senal":"respondio_rapido"}',         10, 'Se le localizó rápido: hay disposición'),
  ('Respondió alguna vez',     '{"senal":"respondio"}',                10, null),
  ('Contacta un familiar directo', '{"senal":"familiar_directo"}',     10, 'Padre, madre, pareja o hijo: hay red de apoyo'),
  ('Ya nos conocía (reabierto)', '{"senal":"reabierto"}',              10, 'Volvió por su cuenta'),
  ('Tiene presupuesto',        '{"senal":"presupuesto"}',              15, null),
  ('Más de 7 días sin respuesta', '{"senal":"sin_respuesta_7d"}',     -15, 'Se está enfriando'),
  ('Segunda cita a la que no acude', '{"senal":"segundo_no_show"}',   -20, 'Dos ausencias seguidas: algo no encaja');
