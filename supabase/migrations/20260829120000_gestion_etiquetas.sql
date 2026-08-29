-- ============================================================================
-- Gestión de etiquetas por parte de admisiones: ya podían crearlas, pero no
-- renombrarlas ni retirarlas, así que un error de nombre era permanente.
-- Cada cual gestiona las suyas; las de dirección (y las del catálogo inicial,
-- con created_by nulo) solo las toca dirección.
-- ============================================================================

create policy etiquetas_admisiones_editar on etiquetas
  for update to authenticated
  using (mi_rol() = 'admisiones' and created_by = auth.uid())
  with check (mi_rol() = 'admisiones' and created_by = auth.uid());

create policy etiquetas_admisiones_borrar on etiquetas
  for delete to authenticated
  using (mi_rol() = 'admisiones' and created_by = auth.uid());
