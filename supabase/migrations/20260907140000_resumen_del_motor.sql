-- ============================================================================
-- RESUMEN DEL MOTOR CALCULADO EN LA BASE
-- ============================================================================
--
-- La pantalla del historico necesita cuatro cosas de la ventana entera —cuantas
-- pasadas hubo, cuantas fallaron, cuanto duran y cual fue el hueco mas largo—
-- mas la suma de todo lo que hizo. Traerse las filas al navegador para eso no
-- sale: a una pasada cada quince minutos, treinta dias son 2.880 filas con un
-- jsonb cada una, y eso es cerca de un mega para enseñar seis numeros.
--
-- Se calcula aqui, que es donde estan los datos. La pantalla solo se trae en
-- crudo las ultimas sesenta, que son las que enseña una a una.
--
-- `security invoker` a proposito: la funcion se ejecuta con los permisos de
-- quien la llama, asi que la politica de `ejecuciones_motor` sigue mandando y
-- para quien no sea direccion esto devuelve ceros. Una funcion `definer` aqui
-- seria una puerta lateral al registro.
-- ----------------------------------------------------------------------------

create or replace function resumen_motor(dias integer default 7)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with ventana as (
    select id, inicio, ok, duracion_ms, resultado, fallos
    from ejecuciones_motor
    where inicio >= now() - make_interval(days => greatest(1, least(dias, 30)))
  ),
  huecos as (
    select extract(epoch from (inicio - lag(inicio) over (order by inicio))) / 60 as minutos
    from ventana
  ),
  -- Suma de cada contador. Se ignora lo que no sea un numero: el resultado es
  -- jsonb libre y no hay nada que impida que algun dia lleve un texto dentro.
  totales as (
    select x.clave, sum(x.valor::numeric) as suma
    from ventana v, jsonb_each_text(v.resultado) as x(clave, valor)
    where x.valor ~ '^-?[0-9]+(\.[0-9]+)?$'
    group by x.clave
  ),
  -- Fases que fallaron, con cuantas veces y el mensaje mas reciente.
  averias as (
    select
      f->>'fase' as fase,
      count(*) as veces,
      (array_agg(f->>'error' order by v.inicio desc))[1] as ultimo_error
    from ventana v, jsonb_array_elements(v.fallos) as f
    group by f->>'fase'
  )
  select jsonb_build_object(
    'total', (select count(*) from ventana),
    'conFallo', (select count(*) from ventana where not ok),
    'medianaMs', (
      select percentile_cont(0.5) within group (order by duracion_ms)
      from ventana where duracion_ms is not null
    ),
    'huecoMaximoMin', (select round(max(minutos)) from huecos where minutos is not null),
    'totales', coalesce((select jsonb_object_agg(clave, suma) from totales), '{}'::jsonb),
    'fases', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('fase', fase, 'veces', veces, 'ultimoError', ultimo_error)
          order by veces desc
        )
        from averias
      ),
      '[]'::jsonb
    )
  );
$$;

comment on function resumen_motor(integer) is
  'Resumen de las pasadas del motor en los ultimos N dias (max 30). Se calcula en la base para no traerse miles de filas de jsonb al navegador. Respeta RLS: quien no sea direccion recibe ceros.';

revoke all on function resumen_motor(integer) from public, anon;
grant execute on function resumen_motor(integer) to authenticated;
