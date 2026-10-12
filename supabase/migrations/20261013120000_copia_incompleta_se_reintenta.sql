-- =============================================================================
-- La copia de HighLevel que queda incompleta se retoma antes.
-- =============================================================================
--
-- La copia nocturna solo traía la primera página de conversaciones (100 de
-- 1.799). Ahora las trae todas y, de las que cambiaron, sus mensajes, con un
-- tope por pasada para no pasarse del tiempo de la tarea programada. La
-- primera vez no caben todas: si la copia queda incompleta, en lugar de
-- esperar un día entero se retoma a las pocas horas, hasta ponerse al día.
-- Después cada pasada solo trae lo nuevo y vuelve a ser diaria.

insert into configuracion (clave, valor, descripcion)
values
  (
    'canal_copia_reintento_horas',
    '1'::jsonb,
    'Si la última copia de HighLevel quedó incompleta, cada cuántas horas se retoma (en vez de esperar a canal_copia_cada_horas). Sirve para ponerse al día la primera vez sin pasarse del tiempo de la tarea programada.'
  )
on conflict (clave) do nothing;
