-- ============================================================================
-- Directorio de contactos: permitir a admisiones RETIRAR etiquetas y sacar
-- contactos de listas estáticas (ya podían añadirlos). Una etiqueta que se
-- puede poner pero nunca quitar deja el directorio sucio para siempre.
-- Las etiquetas y listas no son datos clínicos: son organización comercial.
-- ============================================================================

create policy contacto_etiquetas_admisiones_borrar on contacto_etiquetas
  for delete to authenticated
  using (mi_rol() = 'admisiones');

create policy lista_contactos_admisiones_borrar on lista_contactos
  for delete to authenticated
  using (mi_rol() = 'admisiones');

-- Admisiones necesita poder editar sus propias listas (renombrar, cambiar el
-- filtro de un segmento). Solo las suyas; las de dirección quedan protegidas.
create policy listas_admisiones_editar on listas
  for update to authenticated
  using (mi_rol() = 'admisiones' and created_by = auth.uid())
  with check (mi_rol() = 'admisiones' and created_by = auth.uid());

create policy listas_admisiones_borrar on listas
  for delete to authenticated
  using (mi_rol() = 'admisiones' and created_by = auth.uid());

-- Búsqueda del directorio: índices para nombre y teléfono parcial.
create extension if not exists pg_trgm;
create index if not exists idx_contactos_nombre_trgm on contactos using gin (nombre gin_trgm_ops);
create index if not exists idx_contactos_telefono_trgm on contactos using gin (telefono gin_trgm_ops);
