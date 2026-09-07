-- ============================================================================
-- EL RESUMEN DEL MOTOR DICE DESDE CUANDO HAY REGISTRO
-- ============================================================================
--
-- La pantalla compara las pasadas que hubo con las que tocaban en la ventana:
-- treinta dias son 2.880 al ritmo de una cada quince minutos. Pero si el
-- registro solo tiene una semana —porque la instalacion es nueva, o porque se
-- acaba de desplegar— esa cuenta da 23 % y lo pinta en rojo como si el motor
-- estuviera medio muerto, cuando lo unico que pasa es que no habia nada que
-- registrar todavia.
--
-- Devolviendo la primera pasada de la ventana, la pantalla puede contar solo
-- desde que hay registro. Una alarma que salta cuando no pasa nada malo se deja
-- de mirar, y entonces tampoco se mira la que importa.
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
  totales as (
    select x.clave, sum(x.valor::numeric) as suma
    from ventana v, jsonb_each_text(v.resultado) as x(clave, valor)
    where x.valor ~ '^-?[0-9]+(\.[0-9]+)?$'
    group by x.clave
  ),
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
    -- Desde cuando hay registro dentro de la ventana. Con esto la pantalla
    -- cuenta las pasadas previstas desde que hay algo que contar.
    'primera', (select min(inicio) from ventana),
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
