-- =============================================================================
-- Auditoría de octubre: lo que señala el asesor de Supabase, resuelto.
-- =============================================================================
--
-- Tres bloques, ninguno cambia quién ve qué ni qué hace la aplicación.

-- -----------------------------------------------------------------------------
-- 1. `auth.uid()` una vez por consulta, no una vez por fila
-- -----------------------------------------------------------------------------
--
-- 43 políticas llamaban a `auth.uid()` en cada fila. Con `(select auth.uid())`
-- Postgres lo calcula una sola vez (un InitPlan): mismo resultado, porque
-- dentro de una consulta el usuario no cambia. Es lo mismo que se hizo a mano
-- en contactos (20261013100000); aquí se hace con todas, recorriéndolas, para
-- no copiar a mano 43 expresiones y equivocarse en una.
--
-- Solo se tocan las apariciones que no estaban ya envueltas en un `select`.

do $$
declare
  p record;
  usando text;
  comprobar text;
  patron constant text := '(?<!SELECT )auth\.uid\(\)';
  cambio constant text := '( SELECT auth.uid() AS uid)';
begin
  for p in
    select c.relname as tabla, pol.polname as nombre,
           pg_get_expr(pol.polqual, pol.polrelid) as q,
           pg_get_expr(pol.polwithcheck, pol.polrelid) as w
    from pg_policy pol
    join pg_class c on c.oid = pol.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and (pg_get_expr(pol.polqual, pol.polrelid) ~ patron
        or pg_get_expr(pol.polwithcheck, pol.polrelid) ~ patron)
  loop
    usando := case when p.q is null then null else regexp_replace(p.q, patron, cambio, 'g') end;
    comprobar := case when p.w is null then null else regexp_replace(p.w, patron, cambio, 'g') end;

    if usando is not null and comprobar is not null then
      execute format('alter policy %I on public.%I using (%s) with check (%s)', p.nombre, p.tabla, usando, comprobar);
    elsif usando is not null then
      execute format('alter policy %I on public.%I using (%s)', p.nombre, p.tabla, usando);
    else
      execute format('alter policy %I on public.%I with check (%s)', p.nombre, p.tabla, comprobar);
    end if;
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- 2. Índice para cada clave foránea que no lo tenía
-- -----------------------------------------------------------------------------
--
-- Hoy las tablas son pequeñas y no se nota. Con meses de casos, tareas,
-- notificaciones y citas, cada búsqueda por su caso o su persona —y cada
-- borrado en cascada— recorrería la tabla entera. Un índice por clave foránea
-- es la regla de base, y a este tamaño cuesta casi nada.
--
-- Se crea solo si ningún índice existente empieza ya por esas columnas.

do $$
declare
  fk record;
  nombre text;
begin
  for fk in
    select c.conrelid::regclass as tabla, cl.relname as nombre_tabla, c.conname,
           c.conkey,
           (select string_agg(quote_ident(a.attname), ', ' order by k.ord)
              from unnest(c.conkey) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) as columnas,
           (select string_agg(a.attname, '_' order by k.ord)
              from unnest(c.conkey) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum) as sufijo
    from pg_constraint c
    join pg_class cl on cl.oid = c.conrelid
    join pg_namespace n on n.oid = cl.relnamespace
    where c.contype = 'f'
      and n.nspname = 'public'
      and not exists (
        select 1 from pg_index i
        where i.indrelid = c.conrelid
          and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] = c.conkey
      )
  loop
    nombre := left('idx_fk_' || fk.nombre_tabla || '_' || fk.sufijo, 63);
    execute format('create index if not exists %I on %s (%s)', nombre, fk.tabla, fk.columnas);
  end loop;
end
$$;

-- -----------------------------------------------------------------------------
-- 3. Permisos de funciones
-- -----------------------------------------------------------------------------
--
-- `darse_de_baja` la llama la página de baja con la clave de servidor; nadie
-- más la necesita, y abierta a cualquiera bastaba conocer un token para dar de
-- baja a alguien desde fuera de la página. Las otras dos son de disparador:
-- un disparador se ejecuta sin mirar este permiso, así que quitarlo no cambia
-- nada salvo cerrar una puerta que no lleva a ningún sitio.

revoke execute on function public.darse_de_baja(text) from public, anon, authenticated;
revoke execute on function public.fn_destinatario_del_centro() from public, anon, authenticated;
revoke execute on function public.fn_guard_alcance() from public, anon, authenticated;
grant execute on function public.darse_de_baja(text) to service_role;

-- Y la ruta de búsqueda fija en las que no la tenían: así ninguna puede
-- acabar resolviendo un nombre en un esquema que no es el suyo.
alter function public.fn_touch_updated_at() set search_path = public;
alter function public.fn_touch_configuracion() set search_path = public;
alter function public.fn_marcar_cierre() set search_path = public;
alter function public.hora_del_servidor() set search_path = public;
