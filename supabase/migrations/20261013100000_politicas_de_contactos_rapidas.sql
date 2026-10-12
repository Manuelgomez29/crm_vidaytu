-- =============================================================================
-- Políticas de contactos, casos y etiquetas que no se recalculan fila a fila.
-- =============================================================================
--
-- Contactos tardaba más de dos segundos en abrirse. No era la red ni los datos:
-- contar los 711 contactos de staging costaba 243 ms DENTRO de la base, y una
-- página de 50 lo mismo, porque para ordenar hay que filtrar todo antes. La
-- política llamaba POR CADA FILA a `mi_rol()` dos veces, a
-- `puedo_ver_contacto()` y a `puedo_ver_recorrido()`, y cada una vuelve a
-- mirar perfiles, casos y centros. Con los 1.609 contactos de producción eso
-- pasa del medio segundo por consulta, y la pantalla hace varias.
--
-- NINGÚN CAMBIO DE QUIÉN VE QUÉ. Lo que cambia es cuántas veces se calcula:
--
-- 1. `(select mi_rol())` en vez de `mi_rol()`: con el `select` delante,
--    Postgres lo calcula UNA vez por consulta (un InitPlan) y no una vez por
--    fila. Es la recomendación de Supabase para RLS, y da lo mismo porque la
--    función es STABLE.
--
-- 2. En `contactos`, las dos funciones se sustituyen por lo que dicen, con
--    conjuntos calculados una vez:
--
--      puedo_ver_contacto  = G o C o M
--      puedo_ver_recorrido = R o G o M
--
--    donde G = manda en el grupo, C = creó el contacto, M = tiene un caso del
--    contacto en un centro suyo, R = el contacto no tiene recorrido o el suyo
--    no está reservado. Las dos juntas son exactamente G o M o (C y R).
--    M sale de `contactos_de_mis_casos()`, que repite la condición de las
--    funciones palabra por palabra.
--
--    Una trampa que costó encontrar: «C» con `created_by` vacío es NULO, no
--    falso, y «NULO y X» obliga a Postgres a calcular X. Por eso va con
--    `coalesce(…, false)`. Sin él, el atajo no ataja.
--
-- 3. En casos, etiquetas y contactos-de-caso, el «manda en el grupo» que las
--    funciones ya comprueban primero se pregunta una vez por consulta delante
--    de ellas: misma respuesta, sin la llamada por fila para la dirección.
--
-- Las condiciones de ESCRITURA (`with check`) se quedan con las funciones: en
-- un alta, `puedo_ver_contacto` mira la tabla, donde la fila nueva aún no
-- está, y cambiarla por la columna del propio registro abriría la puerta.
--
-- Comprobado antes de aplicar: con cada cuenta de prueba, las filas visibles
-- de las cuatro tablas son idénticas antes y después, también forzando
-- contactos creados por una cuenta de admisiones.

-- ---- conjuntos que se calculan una vez por consulta -------------------------

/*
 * Los contactos que tienen un caso en un centro mío: la tercera rama de
 * `puedo_ver_contacto` y la última de `puedo_ver_recorrido`, idéntica en las
 * dos. SECURITY DEFINER como ellas, para ver los casos sin depender de las
 * políticas de casos.
 */
create or replace function public.contactos_de_mis_casos()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select lc.contacto_id
  from lead_contactos lc
  join leads l on l.id = lc.lead_id
  where l.centro_id in (select mis_centros()) or manda_en(l.centro_id);
$$;

revoke all on function public.contactos_de_mis_casos() from public, anon;
grant execute on function public.contactos_de_mis_casos() to authenticated;

-- ---- contactos --------------------------------------------------------------

alter policy contactos_direccion on contactos
  using (
    (select mi_rol()) = 'direccion'
    and (
      (select manda_en_grupo())
      or id in (select contactos_de_mis_casos())
      or (
        coalesce(created_by = (select auth.uid()), false)
        and (
          recorrido_id is null
          or recorrido_id in (select r.id from recorridos r where r.restringido is not true)
        )
      )
    )
  )
  with check (
    (select mi_rol()) = 'direccion'
    and ((select manda_en_grupo()) or puedo_ver_contacto(id))
  );

alter policy contactos_admisiones_leer on contactos
  using (
    (select mi_rol()) = 'admisiones'
    and (
      (select manda_en_grupo())
      or id in (select contactos_de_mis_casos())
      or (
        coalesce(created_by = (select auth.uid()), false)
        and (
          recorrido_id is null
          or recorrido_id in (select r.id from recorridos r where r.restringido is not true)
        )
      )
    )
  );

alter policy contactos_admisiones_editar on contactos
  using (
    (select mi_rol()) = 'admisiones'
    and exists (
      select 1
      from lead_contactos lc
      join leads l on l.id = lc.lead_id
      where lc.contacto_id = contactos.id
        and l.centro_id in (select mis_centros())
    )
  )
  with check ((select mi_rol()) = 'admisiones');

alter policy contactos_admisiones_crear on contactos
  with check (
    (select mi_rol()) = 'admisiones'
    and (created_by is null or created_by = (select auth.uid()))
  );

-- ---- contacto_etiquetas -----------------------------------------------------

alter policy contacto_etiquetas_direccion on contacto_etiquetas
  using (
    (select mi_rol()) = 'direccion'
    and ((select manda_en_grupo()) or puedo_ver_contacto(contacto_id))
  )
  with check (
    (select mi_rol()) = 'direccion'
    and ((select manda_en_grupo()) or puedo_ver_contacto(contacto_id))
  );

alter policy contacto_etiquetas_admisiones_leer on contacto_etiquetas
  using ((select mi_rol()) = 'admisiones' and puedo_ver_contacto(contacto_id));

alter policy contacto_etiquetas_admisiones_borrar on contacto_etiquetas
  using ((select mi_rol()) = 'admisiones' and puedo_ver_contacto(contacto_id));

alter policy contacto_etiquetas_admisiones_crear on contacto_etiquetas
  with check ((select mi_rol()) = 'admisiones');

-- ---- lead_contactos ---------------------------------------------------------

alter policy lead_contactos_direccion on lead_contactos
  using ((select manda_en_grupo()) or manda_en_lead(lead_id))
  with check ((select manda_en_grupo()) or manda_en_lead(lead_id));

alter policy lead_contactos_admisiones on lead_contactos
  using (
    (select mi_rol()) = 'admisiones'
    and exists (
      select 1 from leads l
      where l.id = lead_contactos.lead_id
        and l.centro_id in (select mis_centros())
    )
  )
  with check (
    (select mi_rol()) = 'admisiones'
    and exists (
      select 1 from leads l
      where l.id = lead_contactos.lead_id
        and l.centro_id in (select mis_centros())
    )
  );

-- ---- leads ------------------------------------------------------------------

alter policy leads_direccion on leads
  using ((select manda_en_grupo()) or manda_en(centro_id))
  with check ((select manda_en_grupo()) or manda_en(centro_id));

alter policy leads_admisiones_leer on leads
  using ((select mi_rol()) = 'admisiones' and centro_id in (select mis_centros()));

alter policy leads_admisiones_editar on leads
  using ((select mi_rol()) = 'admisiones' and centro_id in (select mis_centros()))
  with check ((select mi_rol()) = 'admisiones' and centro_id in (select mis_centros()));

alter policy leads_admisiones_crear on leads
  with check ((select mi_rol()) = 'admisiones' and centro_id in (select mis_centros()));
