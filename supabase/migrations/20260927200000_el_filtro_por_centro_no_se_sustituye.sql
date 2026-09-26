-- ============================================================================
-- EL FILTRO POR CENTRO NO SE SUSTITUYE: SE SUMA
-- ============================================================================
--
-- Arregla una fuga que abri yo mismo tres migraciones atras.
--
-- `20260927160000_los_centros_no_ven_home` tenia que QUITAR visibilidad: que
-- los comerciales de los centros no vieran a las personas del recorrido de
-- HOME. Lo que hizo fue cambiar la regla de sitio:
--
--   antes:  mi_rol() = 'admisiones' and puedo_ver_contacto(id)
--   quedo:  mi_rol() = 'admisiones' and puedo_ver_recorrido(recorrido_id, id)
--
-- Y las dos funciones no son la misma clase de regla:
--
--   · `puedo_ver_contacto()` es una LISTA BLANCA: ves a alguien si manda_en_grupo,
--     si la creaste tu, o si tiene un caso en un centro tuyo. Por defecto, NO.
--   · `puedo_ver_recorrido()` es una LISTA NEGRA: si el recorrido no esta
--     marcado como restringido, pasa. Por defecto, SI.
--
-- Al poner la segunda EN LUGAR DE la primera, el filtro por centro desaparecio
-- y un comercial sin Horizonte volvia a poder listar el nombre y el telefono de
-- TODAS las personas del sistema. Que es, palabra por palabra, el agujero que
-- cerro `20260905120000_directorio_por_centro`.
--
-- La de direccion perdio lo mismo, y ademas en su `with check`: una direccion
-- de CENTRO podia editar cualquier ficha del grupo.
--
-- Lo caza `npm run staging:verificar:seguridad` en el punto 4. Mi propia prueba
-- del recorrido reservado daba OK porque solo comprobaba la mitad que quita, no
-- la que ya estaba puesta: una comprobacion de un solo sentido no protege una
-- regla que tiene dos.
--
-- La leccion ya estaba escrita en `20260909120000_alcance_por_centro`, sobre
-- este mismo par de politicas: «al sustituir una por otra a secas, la politica
-- dejo de mirar el rol». Aqui dejo de mirar el centro. Las reglas de permisos
-- se COMPONEN con `and`; cada funcion nueva solo puede restar.
-- ============================================================================

-- Direccion: vuelve la lista blanca, y el recorrido resta encima.
-- `mi_rol() = 'direccion'` en vez de `es_direccion()` para dejarlo igual que
-- estaba: son equivalentes hoy, pero el resto del fichero de alcance usa este.
drop policy if exists contactos_direccion on contactos;
create policy contactos_direccion on contactos for all to authenticated
  using (
    mi_rol() = 'direccion'
    and puedo_ver_contacto(id)
    and puedo_ver_recorrido(recorrido_id, id)
  )
  with check (mi_rol() = 'direccion' and puedo_ver_contacto(id));

-- Admisiones: igual. Las dos condiciones, no una de ellas.
drop policy if exists contactos_admisiones_leer on contactos;
create policy contactos_admisiones_leer on contactos for select to authenticated
  using (
    mi_rol() = 'admisiones'
    and puedo_ver_contacto(id)
    and puedo_ver_recorrido(recorrido_id, id)
  );

comment on function puedo_ver_recorrido(uuid, uuid) is
  'SOLO RESTA. Dice si el recorrido de una persona deja verla, y va SIEMPRE con un and junto a puedo_ver_contacto(): por si sola deja pasar a cualquier admisiones, porque su caso por defecto es «el recorrido no esta restringido, adelante».';
