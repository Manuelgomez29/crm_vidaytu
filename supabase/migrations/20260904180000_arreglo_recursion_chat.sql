-- ============================================================================
-- Arregla la recursion infinita del chat clinico.
--
-- La politica de `conversacion_participantes` preguntaba por la propia tabla
-- para decidir si podias ver una fila, asi que Postgres tenia que evaluar la
-- politica para evaluar la politica. Crear una conversacion fallaba con
-- "infinite recursion detected in policy".
--
-- La salida es la de siempre en RLS: una funcion SECURITY DEFINER que
-- responde la pregunta saltandose las politicas, igual que ya hacen
-- `mis_centros()` o `mis_pacientes()`.
-- ============================================================================

create or replace function mis_conversaciones()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select conversacion_id from conversacion_participantes where perfil_id = auth.uid();
$$;

grant execute on function mis_conversaciones() to authenticated;

-- ----------------------------------------------------------------------------
-- Conversaciones
-- ----------------------------------------------------------------------------
drop policy if exists conversaciones_ver on conversaciones;
drop policy if exists conversaciones_editar on conversaciones;

create policy conversaciones_ver on conversaciones for select to authenticated
  using (tiene_acceso_clinico() and id in (select mis_conversaciones()));

create policy conversaciones_editar on conversaciones for update to authenticated
  using (tiene_acceso_clinico() and id in (select mis_conversaciones()))
  with check (tiene_acceso_clinico());

-- ----------------------------------------------------------------------------
-- Participantes
--
-- Ver: los de las conversaciones en las que estoy, o los mios propios. La
-- segunda mitad es lo que permite que la fila que acabo de insertarme al
-- crear la conversacion sea visible sin consultar la tabla en su propia
-- politica.
-- ----------------------------------------------------------------------------
drop policy if exists participantes_ver on conversacion_participantes;
drop policy if exists participantes_gestionar on conversacion_participantes;

create policy participantes_ver on conversacion_participantes for select to authenticated
  using (
    tiene_acceso_clinico()
    and (perfil_id = auth.uid() or conversacion_id in (select mis_conversaciones()))
  );

-- Anadir gente: solo a una conversacion que yo he creado o en la que estoy.
create policy participantes_anadir on conversacion_participantes for insert to authenticated
  with check (
    tiene_acceso_clinico()
    and (
      conversacion_id in (select mis_conversaciones())
      or conversacion_id in (select id from conversaciones where created_by = auth.uid())
    )
  );

-- Marcar leido: solo mi propia fila.
create policy participantes_editar on conversacion_participantes for update to authenticated
  using (perfil_id = auth.uid())
  with check (perfil_id = auth.uid());

-- Salirse de una conversacion.
create policy participantes_salir on conversacion_participantes for delete to authenticated
  using (perfil_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Mensajes
-- ----------------------------------------------------------------------------
drop policy if exists mensajes_ver on mensajes;
drop policy if exists mensajes_escribir on mensajes;

create policy mensajes_ver on mensajes for select to authenticated
  using (conversacion_id in (select mis_conversaciones()));

create policy mensajes_escribir on mensajes for insert to authenticated
  with check (autor_id = auth.uid() and conversacion_id in (select mis_conversaciones()));
