-- ============================================================================
-- LOS DE LOS CENTROS NO VEN LOS DE HOME
-- ============================================================================
--
-- Al traer al directorio las personas de HighLevel, ochenta y cinco familiares
-- que consultaron por el Metodo HOME quedaron a la vista de todo el equipo
-- comercial de los centros, que ni las atiende ni tiene por que conocerlas.
--
-- No es un detalle de orden: son datos de categoria especial (regla 11), y el
-- criterio de siempre es que cada uno vea lo que necesita para su trabajo.
--
-- SE RESTRINGE POR RECORRIDO, NO POR ORIGEN. El origen dice por donde llego
-- una persona y eso no cambia; el recorrido dice a que equipo pertenece hoy, y
-- puede cambiar. Si alguien que consulto por HOME acaba ingresando en
-- Bellamar, el comercial que lleva ese caso TIENE que poder verla — y por eso
-- la regla incluye esa excepcion en vez de dejarla para un parche futuro.
--
-- Y SE DECIDE EN EL CATALOGO, no aqui: manana habra otro programa, y que sea
-- reservado o no es una decision de negocio (regla 13).
-- ============================================================================

alter table recorridos add column if not exists restringido boolean not null default false;

comment on column recorridos.restringido is
  'Si es cierto, las personas de este recorrido solo las ve la dirección de grupo — y quien lleve un caso suyo en un centro propio. Para programas cuyo público no atiende el equipo de los centros.';

update recorridos set restringido = true where slug = 'metodo-home';

-- ----------------------------------------------------------------------------
-- La regla, escrita una vez
-- ----------------------------------------------------------------------------
--
-- `security definer` porque tiene que mirar los casos de esa persona aunque
-- quien pregunta no pueda verlos: justamente esta comprobando si deberia. No
-- devuelve nada de ellos, solo si o no.
create or replace function puedo_ver_recorrido(p_recorrido uuid, p_contacto uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    -- Sin recorrido, o recorrido abierto: el directorio es compartido.
    p_recorrido is null
    or not exists (
      select 1 from recorridos r where r.id = p_recorrido and r.restringido
    )
    -- Reservado: la dirección de grupo lo ve todo.
    or manda_en_grupo()
    -- Y quien lleve un caso suyo en un centro que sí atiende.
    or exists (
      select 1
      from lead_contactos lc
      join leads l on l.id = lc.lead_id
      where lc.contacto_id = p_contacto
        and (l.centro_id in (select centro_id from perfil_centros where perfil_id = auth.uid())
             or manda_en(l.centro_id))
    );
$$;

revoke execute on function puedo_ver_recorrido(uuid, uuid) from public, anon;
grant execute on function puedo_ver_recorrido(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Las politicas de lectura pasan por ella
-- ----------------------------------------------------------------------------
--
-- Las dos, la de direccion y la de admisiones: una direccion de CENTRO tambien
-- es «de los centros», y dejarla fuera de la regla habria sido una puerta
-- lateral. La direccion de grupo sigue viendolo todo, por la propia funcion.
drop policy if exists contactos_direccion on contactos;
create policy contactos_direccion on contactos for all to authenticated
  using (es_direccion() and puedo_ver_recorrido(recorrido_id, id))
  with check (es_direccion());

drop policy if exists contactos_admisiones_leer on contactos;
create policy contactos_admisiones_leer on contactos for select to authenticated
  using (mi_rol() = 'admisiones' and puedo_ver_recorrido(recorrido_id, id));
