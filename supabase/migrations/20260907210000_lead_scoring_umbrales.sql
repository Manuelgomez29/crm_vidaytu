-- ============================================================================
-- UN SOLO SITIO PARA EL LEAD SCORING
-- ============================================================================
--
-- 1. Se va `scoring_pesos`.
--
-- Era un JSON editable en Parametros, rotulado «Pesos del lead scoring», que ya
-- no lee NADIE: la puntuacion paso a la tabla `scoring_reglas` y el editor viejo
-- se quedo ahi. Direccion podia cambiar esos numeros, guardarlos, y no pasaba
-- absolutamente nada. Y los dos juegos de cifras ni siquiera coincidian —el JSON
-- decia 25 para «cita agendada» y la regla real dice 20—, asi que comparar las
-- dos pantallas daba una contradiccion sin forma de saber cual mandaba.
--
-- Un control que no controla nada es peor que no tenerlo: hace creer que se ha
-- ajustado algo.
--
-- 2. Llegan los umbrales.
--
-- Los cortes entre caliente, templado y frio estaban escritos a mano en TRES
-- sitios —la funcion `nivelDeCalor`, la tarjeta del kanban y el filtro de
-- «solo calientes»—, con un comentario en el kanban que aseguraba que vivian
-- solo en la funcion. No era verdad. Ahora estan aqui, que es donde tiene que
-- vivir un parametro (regla 13), y ademas se pueden mover: donde empieza «lo
-- que hay que llamar hoy» depende de cuantos casos entren, y eso cambia con la
-- campana que este en marcha.
-- ----------------------------------------------------------------------------

delete from configuracion where clave = 'scoring_pesos';

insert into configuracion (clave, valor, descripcion)
values (
  'scoring_umbrales',
  '{"caliente": 70, "templado": 40}'::jsonb,
  'Donde empieza cada nivel de calor. Solo ordena la cola: por debajo del corte un caso no se descarta, se llama mas tarde.'
)
on conflict (clave) do nothing;
