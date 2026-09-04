-- ============================================================================
-- TAREAS QUE NO CUELGAN DE UN CASO
--
-- `tareas.lead_id` era obligatorio, asi que la unica forma de crear una tarea
-- era desde la ficha de un caso. La bandeja personal solo sabia listar lo que
-- generaba el motor.
--
-- Pero un comercial tiene trabajo que no cuelga de ningun caso: llamar a un
-- prescriptor, preparar la reunion del lunes, repasar los presupuestos
-- pendientes. Sin sitio donde apuntarlo, eso acaba en un post-it, y lo que
-- acaba en un post-it no aparece en ninguna metrica ni lo cubre nadie cuando
-- esa persona esta de baja.
--
-- La regla 9 no cambia: un caso abierto sigue necesitando su proxima accion
-- con fecha. Lo que se anade es el resto del trabajo.
-- ============================================================================

alter table tareas alter column lead_id drop not null;

comment on column tareas.lead_id is
  'El caso al que pertenece. Null = tarea suelta del responsable, sin caso asociado.';

-- Quien la creo. En una tarea suelta es lo unico que la ata a alguien ademas
-- del responsable, y hace falta para las politicas.
alter table tareas
  add column if not exists created_by uuid references perfiles (id) on delete set null;

create index if not exists idx_tareas_sueltas on tareas (responsable_id, vence_at)
  where lead_id is null and completada_at is null;

-- ----------------------------------------------------------------------------
-- RLS
--
-- La politica anterior exigia que la tarea colgara de un caso de tus centros;
-- con `lead_id` nulo ese EXISTS no encuentra nada y la tarea seria invisible
-- incluso para quien la creo.
-- ----------------------------------------------------------------------------
drop policy if exists tareas_admisiones on tareas;

create policy tareas_admisiones on tareas for all to authenticated
  using (
    mi_rol() = 'admisiones'
    and (
      -- Atada a un caso: la ve quien ve el caso.
      (lead_id is not null and exists (
        select 1 from leads l where l.id = lead_id and l.centro_id in (select mis_centros())
      ))
      -- Suelta: la ve su responsable y quien la escribio.
      or (lead_id is null and (responsable_id = auth.uid() or created_by = auth.uid()))
    )
  )
  with check (
    mi_rol() = 'admisiones'
    and (
      (lead_id is not null and exists (
        select 1 from leads l where l.id = lead_id and l.centro_id in (select mis_centros())
      ))
      -- Una tarea suelta se crea para uno mismo. Encargarle algo suelto a otro
      -- sin que haya un caso de por medio es una via para molestar sin rastro;
      -- si hay caso, ese caso ya deja el rastro.
      or (lead_id is null and responsable_id = auth.uid())
    )
  );
