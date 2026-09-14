-- ============================================================================
-- EL RELOJ DEL SLA Y EL MENSAJE QUE MAS SE ENVIA
-- ============================================================================
--
-- Dos cosas que estaban escritas donde no se podian tocar.
--
-- 1. HORARIO DE ATENCION. La columna `centros.horario_atencion` existia en la
--    base desde el esquema inicial y no la leia NADIE. Mientras tanto, el SLA
--    de primera respuesta —«60 min en horario del centro», regla 9— se contaba
--    a reloj, 24 horas al dia. Con dos landings de Meta entrando de madrugada
--    eso significa que un caso de las 02:00 sale fuera de plazo a las 03:00 y
--    el equipo abre a las nueve con la pantalla en rojo por algo que nadie
--    podia contestar. Y peor: «cumplimiento del SLA» pasa a ser un objetivo
--    imposible, porque los casos de madrugada lo incumplen siempre.
--
--    No se rellena aqui ningun horario: inventarselo seria peor que no tenerlo,
--    y `null` sigue significando 24/7 —que es lo correcto para las admisiones
--    de Bellamar y lo que la plataforma hacia hasta ahora—. Se configura en
--    Administracion -> Centros, y la pantalla de puesta en marcha lo recuerda.
--
-- 2. EL MENSAJE DE SEGUIMIENTO. El texto que ofrece la ficha al registrar «no
--    contesta» estaba escrito a pelo en `registrar-llamada.ts`. Es el que mas
--    veces se envia al dia y no se podia cambiar sin desplegar, mientras que el
--    recordatorio de cita —que sale menos— si era editable (regla 13). Ademas
--    cada comercial escribe distinto, y un texto que no sientes tuyo acabas
--    reescribiendolo a mano o no enviandolo.
--
--    Se siembra con el de siempre, asi que nada cambia hasta que alguien lo
--    edite. Pasa por la misma revision de discrecion que el recordatorio: no
--    puede mencionar el motivo de consulta (regla 12).
-- ============================================================================

insert into configuracion (clave, valor, descripcion)
values (
  'plantilla_whatsapp_seguimiento',
  '"Hola {nombre}, te he llamado y no he podido localizarte. Cuando puedas, dime qué momento te viene bien y hablamos. Un saludo."'::jsonb,
  'Mensaje que ofrece la ficha al registrar «no contesta». Marcador: {nombre}. No puede mencionar el motivo de consulta ni el centro: se lee en la pantalla de bloqueo de un móvil.'
)
on conflict (clave) do nothing;

comment on column centros.horario_atencion is
  'Horario de atención, en hora de Madrid. NULL o {"siempre":true} = 24/7. Si no, {"dias":{"1":["09:00","21:00"],...}} con 0=domingo; un día ausente o nulo está cerrado. Es el reloj del SLA de primera respuesta (regla 9).';
