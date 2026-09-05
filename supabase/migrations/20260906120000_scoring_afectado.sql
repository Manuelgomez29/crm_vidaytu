-- ============================================================================
-- LA SENAL QUE SE PERDIO AL PASAR A REGLAS
--
-- El sistema anterior de pesos sumaba 5 puntos cuando contactaba la propia
-- persona afectada, y el seed de reglas se lo dejo. Eso habria cambiado el
-- comportamiento sin que nadie lo pidiera, que es peor que cambiarlo a
-- proposito: se nota meses despues, cuando ya nadie recuerda por que.
-- ============================================================================

insert into scoring_reglas (nombre, condicion, puntos, descripcion) values
  ('Contacta la propia persona afectada', '{"senal":"afectado_contacta"}', 5,
   'Que llame quien tiene el problema, y no un tercero, es senal de disposicion')
on conflict (nombre) do nothing;
