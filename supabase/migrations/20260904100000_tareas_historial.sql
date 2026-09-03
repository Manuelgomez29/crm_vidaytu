-- Historial de tareas completadas.
--
-- Hasta ahora solo guardabamos CUANDO se completo una tarea. Para que el
-- historial sirva de algo hace falta saber QUIEN la completo: el responsable
-- no siempre es quien la cierra (direccion puede cerrar la de un comercial
-- ausente, o un traspaso cambia el responsable despues).

alter table public.tareas
  add column if not exists completada_por uuid references public.perfiles (id) on delete set null;

comment on column public.tareas.completada_por is
  'Quien marco la tarea como completada. Puede no ser el responsable.';

-- El historial se consulta por fecha de cierre, de lo mas reciente a lo mas
-- antiguo, y casi siempre filtrando por persona.
create index if not exists tareas_completadas_idx
  on public.tareas (completada_at desc)
  where completada_at is not null;
