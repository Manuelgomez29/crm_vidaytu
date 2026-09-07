-- ============================================================================
-- SALUD DEL MOTOR: SABER SI LAS AUTOMATIZACIONES SIGUEN CORRIENDO
-- ============================================================================
--
-- Todo lo que hace que el area comercial funcione sola cuelga de un cron cada
-- quince minutos: el reparto de leads sin propietario, la alerta de SLA, la
-- cadencia de cinco intentos, el aviso de presupuesto sin respuesta, los
-- recordatorios de cita, la reactivacion de perdidos y la propuesta de resena.
--
-- Hasta ahora la aplicacion no tenia forma de saber si ese cron se habia
-- ejecutado alguna vez. Si el secreto cambia, si un despliegue falla, o si el
-- cron queda apagado —solo corre en produccion, y eso ya nos ha mordido—, el
-- area comercial se queda muda y no lo dice. La primera senal seria un lead
-- enfriandose sin que nadie sepa por que.
--
-- Esta tabla es esa senal. Cada pasada deja constancia de cuando fue, cuanto
-- tardo, que hizo y que fallo.
-- ----------------------------------------------------------------------------

create table ejecuciones_motor (
  id uuid primary key default gen_random_uuid(),
  inicio timestamptz not null default now(),
  fin timestamptz,
  -- Falso si alguna fase fallo, aunque las demas hayan ido bien.
  ok boolean not null default false,
  duracion_ms integer,
  -- Lo que hizo: {"repartidos": 2, "sla": 1, ...}
  resultado jsonb not null default '{}'::jsonb,
  -- Lo que fallo: [{"fase": "resenas", "error": "..."}]
  fallos jsonb not null default '[]'::jsonb
);

comment on table ejecuciones_motor is
  'Una fila por pasada del cron de automatizaciones. Sirve para saber si el motor sigue vivo: sin esto, que deje de correr no se nota hasta que alguien echa en falta las alertas.';

comment on column ejecuciones_motor.ok is
  'Falso si alguna fase fallo. Las demas fases se ejecutan igual: una averia en las resenas no puede dejar sin repartir los leads.';

create index idx_ejecuciones_motor_inicio on ejecuciones_motor (inicio desc);

alter table ejecuciones_motor enable row level security;

/*
 * Solo direccion lo lee, y NADIE lo escribe desde la aplicacion: las filas las
 * pone el cron con la clave de servicio, que se salta RLS. Sin permiso de
 * insercion no se puede fabricar una pasada falsa para tapar que el motor
 * lleva dias parado.
 */
create policy ejecuciones_motor_ver on ejecuciones_motor for select to authenticated
  using (es_direccion());

revoke all on ejecuciones_motor from anon, authenticated;
grant select on ejecuciones_motor to authenticated;

-- ----------------------------------------------------------------------------
-- Cuanto puede pasar sin una pasada buena antes de dar la voz de alarma.
--
-- El cron corre cada 15 minutos, asi que 60 son cuatro pasadas perdidas: lo
-- suficiente para no saltar por un despliegue de treinta segundos, y lo bastante
-- pronto para enterarse el mismo dia. Parametro, no constante (regla 13).
-- ----------------------------------------------------------------------------
insert into configuracion (clave, valor, descripcion)
values (
  'motor_aviso_minutos',
  '60'::jsonb,
  'Minutos sin una pasada correcta del motor antes de avisar en el panel. El cron corre cada 15.'
)
on conflict (clave) do nothing;
