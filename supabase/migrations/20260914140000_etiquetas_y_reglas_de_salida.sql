-- ============================================================================
-- ETIQUETAS Y REGLAS DE SALIDA
-- ============================================================================
--
-- El motor de etiquetado automatico esta entero y hay CERO reglas escritas. El
-- resultado es que el directorio de contactos es hoy una agenda de telefonos:
-- nueve nombres sin una sola etiqueta con la que buscarlos ni segmentarlos.
--
-- No es que nadie quiera reglas: es que nadie las escribe desde una pantalla en
-- blanco. Hace falta ver tres o cuatro funcionando para entender de que va la
-- cosa, y a partir de ahi salen solas las propias.
--
-- Esto NO es cablear nada (regla 13). Son filas normales: se editan, se apagan
-- y se borran desde Contactos → Etiquetas como cualquier otra. Lo unico que
-- hacen es que la plataforma no nazca vacia.
--
-- CADA REGLA, Y POR QUE:
--
--   · Familiar / Afectado — la unica que mira a la PERSONA y no al caso, y por
--     eso la mas util de todas. En un caso donde estan la madre y el hijo, las
--     demas les pondrian la misma etiqueta a los dos. No se escribe igual a
--     quien consulta por si mismo que a quien consulta por otro, y esta es la
--     que permite distinguirlos al segmentar.
--
--   · Recomendacion / Prescriptor — de donde vienen los que mejor convierten.
--     Sirve para saber a quien cuidar.
--
--   · Ha sido paciente — para reseñas, seguimiento y reactivacion. Es un hecho
--     de la relacion, no un diagnostico.
--
--   · Interes: ingreso residencial — la derivacion Eclipse→Bellamar (regla 3)
--     es el flujo estructural del grupo; esta es la etiqueta que la hace
--     visible en el directorio.
--
-- LO QUE NO SE SIEMBRA, A PROPOSITO: ninguna regla por ADICCION. Una etiqueta
-- va pegada al CONTACTO, asi que seria marcar a una persona con una categoria
-- de salud (regla 11) y dejarla disponible para segmentar campañas (regla 12).
-- Ver la nota larga en `src/lib/reglas.ts`.
--
-- Todo es idempotente: correrlo dos veces no duplica nada.
-- ============================================================================

-- --------------------------------------------------------------------------
-- Las etiquetas
-- --------------------------------------------------------------------------

-- `etiquetas` no tiene slug: la clave natural es el NOMBRE, que es unico.
insert into etiquetas (nombre, color, activa) values
  ('Familiar',                     '#C08427', true),
  ('Afectado',                     '#384B71', true),
  ('Llegó por recomendación',      '#2F9160', true),
  ('Vía prescriptor',              '#5B54C0', true),
  ('Ha sido paciente',             '#2E5C48', true),
  ('Interés: ingreso residencial', '#6E8AF0', true)
on conflict (nombre) do nothing;

-- --------------------------------------------------------------------------
-- Las reglas
-- --------------------------------------------------------------------------
--
-- `condicion` es el mismo jsonb {campo, valor} que escribe el formulario, y el
-- valor se compara sin acentos ni mayusculas contra el nombre O el slug del
-- catalogo, asi que «Recomendación» y «recomendacion» valen igual.

insert into reglas_etiquetado (nombre, condicion, etiqueta_id, activa)
select v.nombre, v.condicion, e.id, true
from (values
  ('Quien consulta por otro',
   '{"campo":"tipo_contacto","valor":"familiar"}'::jsonb,
   'Familiar'),
  ('Quien consulta por si mismo',
   '{"campo":"tipo_contacto","valor":"afectado"}'::jsonb,
   'Afectado'),
  ('Llega recomendado',
   '{"campo":"canal","valor":"recomendacion"}'::jsonb,
   'Llegó por recomendación'),
  ('Llega por un prescriptor',
   '{"campo":"canal","valor":"prescriptor"}'::jsonb,
   'Vía prescriptor'),
  ('El caso convirtio',
   '{"campo":"estado","valor":"convertido"}'::jsonb,
   'Ha sido paciente'),
  ('Interesado en ingreso residencial',
   '{"campo":"modalidad","valor":"ingreso_residencial"}'::jsonb,
   'Interés: ingreso residencial')
) as v(nombre, condicion, nombre_etiqueta)
join etiquetas e on e.nombre = v.nombre_etiqueta
where not exists (
  select 1 from reglas_etiquetado r where r.nombre = v.nombre
);
