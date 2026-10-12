-- =============================================================================
-- Las identidades sociales, solo de las personas que ves.
-- =============================================================================
--
-- `canal_identidades_de_los_mios` (20260927180000) decía en su comentario que
-- abría las identidades «con la misma regla que decide si ve a esa persona en
-- el directorio». No lo hacía, por dos fallos encadenados:
--
--   1. Solo miraba `puedo_ver_recorrido`, que únicamente RESTA (quita lo
--      reservado); nunca miraba `puedo_ver_contacto`, que es lo que da acceso.
--   2. El recorrido lo leía con una subconsulta a `contactos` hecha con los
--      permisos del propio usuario. Para una persona que no ve, la subconsulta
--      devuelve NULO, y `puedo_ver_recorrido(NULL, …)` es «sin recorrido»:
--      abierto.
--
-- Resultado, medido en staging: una cuenta de admisiones veía 704 identidades,
-- todas de personas fuera de su alcance — usuario de Instagram, teléfono, la
-- publicación a la que respondió y las etiquetas del bot. En la pantalla no
-- salían (la ficha solo pide las de su persona), pero la API las daba a quien
-- las pidiera con su sesión.
--
-- Ahora es literalmente la regla del directorio: la identidad se ve si su
-- persona sale en `contactos` para ese usuario. La subconsulta pasa por la
-- política de contactos —que desde 20261013100000 se calcula una vez por
-- consulta—, así que no hay una segunda regla que pueda desviarse de la
-- primera.

alter policy canal_identidades_de_los_mios on canal_identidades
  using (
    contacto_id is not null
    and (select mi_rol()) in ('direccion', 'admisiones')
    and contacto_id in (select c.id from contactos c)
  );

alter policy canal_identidades_direccion on canal_identidades
  using ((select manda_en_grupo()))
  with check ((select manda_en_grupo()));
