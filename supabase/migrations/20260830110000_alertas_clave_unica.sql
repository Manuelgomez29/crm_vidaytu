-- El índice único de `notificaciones.clave` era parcial (`where clave is not
-- null`), y ON CONFLICT no puede apoyarse en un índice parcial salvo que la
-- sentencia repita su predicado. Se sustituye por uno completo: en Postgres los
-- NULL no colisionan entre sí, así que los avisos sin clave siguen conviviendo.

drop index if exists idx_notificaciones_clave;

create unique index if not exists idx_notificaciones_clave on notificaciones (clave);
