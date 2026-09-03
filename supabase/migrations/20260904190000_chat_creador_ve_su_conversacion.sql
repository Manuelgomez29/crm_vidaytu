-- ============================================================================
-- Quien crea una conversacion tiene que poder leerla.
--
-- El insert devuelve la fila recien creada (para saber su id y redirigir), y
-- en ese instante todavia no hay ningun participante: la politica de lectura,
-- que solo miraba la lista de participantes, rechazaba la propia fila que se
-- acababa de insertar.
--
-- Se anade "o la he creado yo", que ademas es correcto por si solo: nadie
-- deberia perder el acceso a una conversacion que abrio.
-- ============================================================================

drop policy if exists conversaciones_ver on conversaciones;

create policy conversaciones_ver on conversaciones for select to authenticated
  using (
    tiene_acceso_clinico()
    and (created_by = auth.uid() or id in (select mis_conversaciones()))
  );
