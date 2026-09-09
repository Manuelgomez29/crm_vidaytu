-- ============================================================================
-- CAMPAÑAS Y LISTAS CON CENTRO
-- ============================================================================
--
-- El correo era del grupo entero: una sola direccion podia crear campañas y
-- salian sobre un directorio global. Con direcciones de centro eso no vale —
-- Horizonte tiene que poder escribir a los suyos— pero tampoco se puede abrir
-- sin mas, porque escribir a alguien de otro centro es peor que no escribir.
--
-- El centro es NULO = del grupo. Asi lo que hay hoy sigue siendo del grupo sin
-- tener que decidir nada por nadie, y lo nuevo puede llevar centro.
--
-- LO QUE NO SE PARTE, Y ES A PROPOSITO:
--
--   · La BAJA. Quien pide no recibir mas correo se da de baja de Vidaitu, no de
--     Horizonte. Partirla por centros significaria que darse de baja en uno no
--     sirve en el siguiente, y eso —ademas de ser una groseria— es justo lo que
--     el RGPD no perdona. `bajas_marketing` sigue siendo unica y la respetan
--     todas las campañas.
--
--   · El CONSENTIMIENTO. Por lo mismo: se da a Vidaitu.
--
--   · Las PLANTILLAS. Son texto reutilizable, no datos de nadie. Las escribe la
--     direccion de grupo y las lee todo el mundo: obligar a cada centro a
--     reescribir el mismo correo no protege nada y garantiza que acaben
--     diciendo cosas distintas.
-- ----------------------------------------------------------------------------

alter table campanas_email
  add column if not exists centro_id uuid references centros (id) on delete restrict;

comment on column campanas_email.centro_id is
  'Centro al que pertenece la campaña. Nulo = del grupo. Con centro, solo pueden recibirla personas ligadas a un caso de ese centro.';

alter table listas
  add column if not exists centro_id uuid references centros (id) on delete restrict;

comment on column listas.centro_id is
  'Centro de la lista. Nula = del grupo. Una lista de centro solo la ve y la usa quien manda en ese centro.';

create index if not exists idx_campanas_centro on campanas_email (centro_id);
create index if not exists idx_listas_centro on listas (centro_id);

-- ----------------------------------------------------------------------------
-- Quien manda en una campaña o en una lista
--
-- Nula = del grupo, y entonces solo la direccion de grupo. Con centro, quien
-- mande en ese centro —lo que incluye a la direccion de grupo, que manda en
-- todos—.
-- ----------------------------------------------------------------------------
create or replace function manda_en_marketing(p_centro uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select case when p_centro is null then manda_en_grupo() else manda_en(p_centro) end;
$$;

revoke execute on function manda_en_marketing(uuid) from public, anon;
grant execute on function manda_en_marketing(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Politicas
-- ----------------------------------------------------------------------------
drop policy if exists campanas_leer on campanas_email;
create policy campanas_leer on campanas_email for select to authenticated
  using (manda_en_marketing(centro_id));

drop policy if exists campanas_gestionar on campanas_email;
create policy campanas_gestionar on campanas_email for all to authenticated
  using (manda_en_marketing(centro_id)) with check (manda_en_marketing(centro_id));

drop policy if exists listas_direccion on listas;
create policy listas_direccion on listas for all to authenticated
  using (manda_en_marketing(centro_id)) with check (manda_en_marketing(centro_id));

/*
 * Los miembros de una lista van con su lista. Y ademas tienen que ser personas
 * que quien edita pueda ver: sin esa segunda mitad, meter a alguien en una
 * lista seria una forma de averiguar que existe.
 */
drop policy if exists lista_contactos_direccion on lista_contactos;
create policy lista_contactos_direccion on lista_contactos for all to authenticated
  using (
    manda_en_marketing((select centro_id from listas l where l.id = lista_id))
    and puedo_ver_contacto(contacto_id)
  )
  with check (
    manda_en_marketing((select centro_id from listas l where l.id = lista_id))
    and puedo_ver_contacto(contacto_id)
  );

drop policy if exists destinatarios_leer on campana_destinatarios;
create policy destinatarios_leer on campana_destinatarios for select to authenticated
  using (manda_en_marketing((select centro_id from campanas_email c where c.id = campana_id)));

drop policy if exists destinatarios_gestionar on campana_destinatarios;
create policy destinatarios_gestionar on campana_destinatarios for all to authenticated
  using (manda_en_marketing((select centro_id from campanas_email c where c.id = campana_id)))
  with check (manda_en_marketing((select centro_id from campanas_email c where c.id = campana_id)));

/* Las plantillas: las escribe el grupo, las lee toda la direccion. */
drop policy if exists plantillas_leer on plantillas_email;
create policy plantillas_leer on plantillas_email for select to authenticated
  using (mi_rol() = 'direccion');

drop policy if exists plantillas_gestionar on plantillas_email;
create policy plantillas_gestionar on plantillas_email for all to authenticated
  using (manda_en_grupo()) with check (manda_en_grupo());

-- ----------------------------------------------------------------------------
-- La red de seguridad de la BASE
--
-- Lo que de verdad impide que una campaña de Horizonte llegue a alguien de
-- Eclipse esta en `prepararDestinatarios`, que es quien construye la lista. Pero
-- esa es una funcion de la aplicacion, y una regla que solo vive en el codigo se
-- salta con un `insert` a mano.
--
-- Este trigger es el cinturon: si la campaña lleva centro, cada destinatario
-- tiene que estar ligado a un caso de ese centro. No sustituye al filtro de
-- arriba —que ademas comprueba consentimiento y correo—, lo respalda.
-- ----------------------------------------------------------------------------
create or replace function fn_destinatario_del_centro()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  el_centro uuid;
begin
  select centro_id into el_centro from campanas_email where id = new.campana_id;
  if el_centro is null then
    return new;  -- Campaña de grupo: cualquiera del directorio.
  end if;

  if not exists (
    select 1
    from lead_contactos lc
    join leads l on l.id = lc.lead_id
    where lc.contacto_id = new.contacto_id and l.centro_id = el_centro
  ) then
    raise exception 'Esa persona no pertenece al centro de la campaña';
  end if;

  return new;
end;
$$;

drop trigger if exists tg_destinatario_del_centro on campana_destinatarios;
create trigger tg_destinatario_del_centro before insert or update on campana_destinatarios
  for each row execute function fn_destinatario_del_centro();
