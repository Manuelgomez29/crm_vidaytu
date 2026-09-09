-- ============================================================================
-- EL ROL DICE QUE PUEDES HACER; EL ALCANCE, DONDE
-- ============================================================================
--
-- Hasta ahora `direccion` significaba dos cosas a la vez que no se podian
-- separar: puedes todo, y en todos los centros. Por eso no habia forma de tener
-- una direccion de Horizonte que mandara en Horizonte y solo en Horizonte.
--
-- La alternativa que se descarto —una cuenta por centro— rompia tres cosas: el
-- directorio de personas es GLOBAL a proposito (la misma madre puede aparecer
-- en un caso de Eclipse y otro de Bellamar, y de ahi sale la deduplicacion por
-- telefono que evita abrir un caso nuevo cuando alguien vuelve), las
-- derivaciones Eclipse -> Bellamar dejarian de ser un mismo caso con historial,
-- y el panel de grupo desapareceria.
--
-- Asi que se separa en dos ejes:
--
--   ROL     que puedes hacer  (direccion, admisiones, terapeuta, administracion)
--   ALCANCE donde              (grupo, o los centros que tengas asignados)
--
-- «Direccion de Horizonte» = rol direccion + alcance centros + Horizonte en
-- `perfil_centros`. Y el CEO = rol direccion + alcance grupo.
--
-- NADIE CAMBIA HOY: todos los perfiles existentes nacen con alcance 'grupo', asi
-- que quien mandaba en todo sigue mandando en todo. Lo que cambia es que ahora
-- se puede crear a alguien que no.
-- ----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'alcance_perfil') then
    create type alcance_perfil as enum ('grupo', 'centros');
  end if;
end
$$;

alter table perfiles
  add column if not exists alcance alcance_perfil not null default 'grupo';

comment on column perfiles.alcance is
  'grupo = manda en todo el grupo. centros = manda solo en los centros de perfil_centros. Ortogonal al rol: un director de centro tiene rol direccion y alcance centros.';

-- ----------------------------------------------------------------------------
-- Los tres cerrojos nuevos
-- ----------------------------------------------------------------------------

/*
 * Direccion de GRUPO: la que puede tocar lo que es de todos —catalogos,
 * parametros, reglas de puntuacion, integraciones—. Cambiar eso desde un centro
 * seria cambiarle las reglas a los otros dos sin que se enteren.
 */
create or replace function manda_en_grupo()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from perfiles
    where id = auth.uid() and rol = 'direccion' and activo and alcance = 'grupo'
  );
$$;

/*
 * Direccion CON MANDO EN ESE CENTRO. Es el reemplazo de `es_direccion()` en
 * todo lo que lleva centro: el de grupo pasa siempre, el de centro solo por lo
 * suyo.
 *
 * Un centro nulo —la bandeja de grupo no tiene centro asignado— solo lo ve la
 * direccion de grupo: un lead sin centro todavia no es de nadie en particular.
 */
create or replace function manda_en(p_centro uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    manda_en_grupo()
    or (
      p_centro is not null
      and exists (
        select 1 from perfiles
        where id = auth.uid() and rol = 'direccion' and activo and alcance = 'centros'
      )
      and p_centro in (select centro_id from perfil_centros where perfil_id = auth.uid())
    );
$$;

/* Lo mismo, para todo lo que cuelga de un caso: actividades, tareas, notas… */
create or replace function manda_en_lead(p_lead uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select manda_en((select centro_id from leads where id = p_lead));
$$;

revoke execute on function manda_en_grupo(), manda_en(uuid), manda_en_lead(uuid)
  from public, anon;
grant execute on function manda_en_grupo(), manda_en(uuid), manda_en_lead(uuid)
  to authenticated;

-- ----------------------------------------------------------------------------
-- 1. LO QUE LLEVA CENTRO
-- ----------------------------------------------------------------------------
drop policy if exists leads_direccion on leads;
create policy leads_direccion on leads for all to authenticated
  using (manda_en(centro_id)) with check (manda_en(centro_id));

drop policy if exists citas_direccion on citas;
create policy citas_direccion on citas for all to authenticated
  using (manda_en(centro_id)) with check (manda_en(centro_id));

drop policy if exists conversiones_direccion on conversiones;
create policy conversiones_direccion on conversiones for all to authenticated
  using (manda_en(centro_id)) with check (manda_en(centro_id));

drop policy if exists gasto_direccion on gasto_campanas;
create policy gasto_direccion on gasto_campanas for all to authenticated
  using (manda_en(centro_id)) with check (manda_en(centro_id));

drop policy if exists habitaciones_gestionar on habitaciones;
create policy habitaciones_gestionar on habitaciones for all to authenticated
  using (manda_en(centro_id)) with check (manda_en(centro_id));

drop policy if exists pipelines_direccion on pipelines;
create policy pipelines_direccion on pipelines for all to authenticated
  using (manda_en(centro_id)) with check (manda_en(centro_id));

drop policy if exists pipeline_etapas_direccion on pipeline_etapas;
create policy pipeline_etapas_direccion on pipeline_etapas for all to authenticated
  using (manda_en((select centro_id from pipelines p where p.id = pipeline_id)))
  with check (manda_en((select centro_id from pipelines p where p.id = pipeline_id)));

-- Facturacion: la lleva direccion o administracion, cada cual en lo suyo.
drop policy if exists facturas_ver on facturas;
create policy facturas_ver on facturas for select to authenticated
  using (manda_en(centro_id) or mi_rol() = 'administracion');

drop policy if exists facturas_gestionar on facturas;
create policy facturas_gestionar on facturas for all to authenticated
  using (manda_en(centro_id) or mi_rol() = 'administracion')
  with check (manda_en(centro_id) or mi_rol() = 'administracion');

drop policy if exists cobros_ver on cobros;
create policy cobros_ver on cobros for select to authenticated
  using (manda_en(centro_id) or mi_rol() = 'administracion');

drop policy if exists cobros_gestionar on cobros;
create policy cobros_gestionar on cobros for all to authenticated
  using (manda_en(centro_id) or mi_rol() = 'administracion')
  with check (manda_en(centro_id) or mi_rol() = 'administracion');

drop policy if exists series_ver on series_factura;
create policy series_ver on series_factura for select to authenticated
  using (manda_en(centro_id) or mi_rol() = 'administracion');

drop policy if exists lineas_ver on factura_lineas;
create policy lineas_ver on factura_lineas for select to authenticated
  using (
    mi_rol() = 'administracion'
    or manda_en((select centro_id from facturas f where f.id = factura_id))
  );

drop policy if exists lineas_gestionar on factura_lineas;
create policy lineas_gestionar on factura_lineas for all to authenticated
  using (
    mi_rol() = 'administracion'
    or manda_en((select centro_id from facturas f where f.id = factura_id))
  )
  with check (
    mi_rol() = 'administracion'
    or manda_en((select centro_id from facturas f where f.id = factura_id))
  );

-- ----------------------------------------------------------------------------
-- 2. LO QUE CUELGA DE UN CASO
-- ----------------------------------------------------------------------------
drop policy if exists actividades_direccion_leer on actividades;
create policy actividades_direccion_leer on actividades for select to authenticated
  using (manda_en_lead(lead_id));

drop policy if exists actividades_direccion_crear on actividades;
create policy actividades_direccion_crear on actividades for insert to authenticated
  with check (manda_en_lead(lead_id));

drop policy if exists tareas_direccion on tareas;
create policy tareas_direccion on tareas for all to authenticated
  using (manda_en_lead(lead_id)) with check (manda_en_lead(lead_id));

drop policy if exists presupuestos_direccion on presupuestos;
create policy presupuestos_direccion on presupuestos for all to authenticated
  using (manda_en_lead(lead_id)) with check (manda_en_lead(lead_id));

drop policy if exists caso_adjuntos_direccion on caso_adjuntos;
create policy caso_adjuntos_direccion on caso_adjuntos for all to authenticated
  using (manda_en_lead(lead_id)) with check (manda_en_lead(lead_id));

drop policy if exists lead_contactos_direccion on lead_contactos;
create policy lead_contactos_direccion on lead_contactos for all to authenticated
  using (manda_en_lead(lead_id)) with check (manda_en_lead(lead_id));

drop policy if exists resumenes_ver on resumenes_ia;
create policy resumenes_ver on resumenes_ia for select to authenticated
  using (
    manda_en_lead(lead_id)
    or exists (
      select 1 from leads l
      where l.id = lead_id and l.centro_id in (select mis_centros())
    )
  );

drop policy if exists resumenes_escribir on resumenes_ia;
create policy resumenes_escribir on resumenes_ia for all to authenticated
  using (
    manda_en_lead(lead_id)
    or exists (
      select 1 from leads l
      where l.id = lead_id and l.centro_id in (select mis_centros())
    )
  )
  with check (
    manda_en_lead(lead_id)
    or exists (
      select 1 from leads l
      where l.id = lead_id and l.centro_id in (select mis_centros())
    )
  );

/*
 * Una derivacion tiene DOS centros, y por eso la ve quien manda en cualquiera de
 * los dos: el que la manda y el que la recibe tienen los mismos motivos para
 * verla. Si solo la viera el de origen, Bellamar no sabria de donde le llegan
 * los ingresos.
 */
drop policy if exists derivaciones_direccion on derivaciones;
create policy derivaciones_direccion on derivaciones for all to authenticated
  using (manda_en(centro_origen_id) or manda_en(centro_destino_id))
  with check (manda_en(centro_origen_id) or manda_en(centro_destino_id));

-- ----------------------------------------------------------------------------
-- 3. AREA CLINICA
-- ----------------------------------------------------------------------------
drop policy if exists pacientes_direccion on pacientes;
create policy pacientes_direccion on pacientes for all to authenticated
  using (manda_en(centro_id)) with check (manda_en(centro_id));

drop policy if exists pacientes_leer on pacientes;
create policy pacientes_leer on pacientes for select to authenticated
  using (manda_en(centro_id) or (tiene_acceso_clinico() and terapeuta_id = auth.uid()));

/* `mis_pacientes()` decidia por `es_direccion()`: ahora tambien por centro. */
create or replace function mis_pacientes()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select p.id
  from pacientes p
  where manda_en(p.centro_id)
     or (tiene_acceso_clinico() and p.terapeuta_id = auth.uid());
$$;

revoke execute on function mis_pacientes() from public, anon;
grant execute on function mis_pacientes() to authenticated;

-- ----------------------------------------------------------------------------
-- 4. PERSONAS DEL DIRECTORIO
--
-- Decision tomada: la direccion de un centro ve las personas ligadas a un caso
-- suyo, mas las que haya creado. Es lo que ya hacian los comerciales; lo unico
-- que cambia es que `es_direccion()` dejaba pasar por encima de esa regla.
-- ----------------------------------------------------------------------------
create or replace function puedo_ver_contacto(p_contacto uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    manda_en_grupo()
    or exists (select 1 from contactos c where c.id = p_contacto and c.created_by = auth.uid())
    or exists (
      select 1
      from lead_contactos lc
      join leads l on l.id = lc.lead_id
      where lc.contacto_id = p_contacto
        and (l.centro_id in (select mis_centros()) or manda_en(l.centro_id))
    );
$$;

revoke execute on function puedo_ver_contacto(uuid) from public, anon;
grant execute on function puedo_ver_contacto(uuid) to authenticated;

/*
 * El `mi_rol() = 'direccion'` de delante NO sobra, y casi se me olvida.
 *
 * `es_direccion()` hacia dos trabajos a la vez: decir «esta persona es
 * direccion» y, de paso, cerrar el area comercial a quien no lo es.
 * `puedo_ver_contacto()` solo hace el primero. Al sustituir una por otra a
 * secas, la politica dejo de mirar el rol y un TERAPEUTA empezo a ver
 * contactos: cumple la parte de «esta ligado a un caso de un centro mio»
 * porque tiene Eclipse asignado.
 *
 * Lo cazo `npm run staging:verificar:muro` en la primera pasada. Es
 * exactamente el agujero que una migracion de permisos abre sin hacer ruido:
 * todo sigue funcionando, solo que alguien ve lo que no debe.
 */
drop policy if exists contactos_direccion on contactos;
create policy contactos_direccion on contactos for all to authenticated
  using (mi_rol() = 'direccion' and puedo_ver_contacto(id))
  with check (mi_rol() = 'direccion' and puedo_ver_contacto(id));

drop policy if exists contacto_etiquetas_direccion on contacto_etiquetas;
create policy contacto_etiquetas_direccion on contacto_etiquetas for all to authenticated
  using (mi_rol() = 'direccion' and puedo_ver_contacto(contacto_id))
  with check (mi_rol() = 'direccion' and puedo_ver_contacto(contacto_id));

/*
 * Las bajas las sigue viendo SOLO direccion, como hasta ahora; lo unico que
 * cambia es que la de centro ve las de su gente. Sustituir `es_direccion()` por
 * `puedo_ver_contacto()` a secas habria abierto la lista a los comerciales
 * tambien: es una ampliacion de acceso, y una migracion de permisos no es sitio
 * para colar una de propina.
 */
drop policy if exists bajas_leer on bajas_marketing;
create policy bajas_leer on bajas_marketing for select to authenticated
  using (mi_rol() = 'direccion' and puedo_ver_contacto(contacto_id));

-- ----------------------------------------------------------------------------
-- 5. EL EQUIPO
--
-- Una direccion de centro gestiona a la gente de su centro y ve sus ausencias y
-- disponibilidad. No puede crear ni tocar a alguien de otro centro, ni darse a
-- si misma alcance de grupo —eso ultimo lo impide el trigger de mas abajo—.
-- ----------------------------------------------------------------------------
create or replace function manda_sobre_perfil(p_perfil uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select
    manda_en_grupo()
    or (
      p_perfil is not null
      and exists (
        select 1 from perfiles
        where id = auth.uid() and rol = 'direccion' and activo and alcance = 'centros'
      )
      -- Alguien de mi centro: comparte al menos un centro conmigo.
      and exists (
        select 1
        from perfil_centros suyo
        join perfil_centros mio on mio.centro_id = suyo.centro_id
        where suyo.perfil_id = p_perfil and mio.perfil_id = auth.uid()
      )
    );
$$;

revoke execute on function manda_sobre_perfil(uuid) from public, anon;
grant execute on function manda_sobre_perfil(uuid) to authenticated;

drop policy if exists perfiles_gestionar on perfiles;
create policy perfiles_gestionar on perfiles for all to authenticated
  using (manda_sobre_perfil(id)) with check (manda_sobre_perfil(id));

drop policy if exists perfil_centros_gestionar on perfil_centros;
create policy perfil_centros_gestionar on perfil_centros for all to authenticated
  using (manda_en(centro_id) and manda_sobre_perfil(perfil_id))
  with check (manda_en(centro_id) and manda_sobre_perfil(perfil_id));

drop policy if exists ausencias_direccion on ausencias;
create policy ausencias_direccion on ausencias for all to authenticated
  using (manda_sobre_perfil(perfil_id)) with check (manda_sobre_perfil(perfil_id));

drop policy if exists disponibilidad_direccion on disponibilidad;
create policy disponibilidad_direccion on disponibilidad for all to authenticated
  using (manda_sobre_perfil(perfil_id)) with check (manda_sobre_perfil(perfil_id));

drop policy if exists objetivos_gestionar on objetivos;
create policy objetivos_gestionar on objetivos for all to authenticated
  using (manda_sobre_perfil(perfil_id)) with check (manda_sobre_perfil(perfil_id));

/*
 * Nadie se asciende a si mismo.
 *
 * Sin esto, una direccion de centro podria ponerse `alcance = 'grupo'` con un
 * `update` sobre su propia fila —la politica de arriba se lo permite, porque es
 * gente de su centro— y quedarse con todo el grupo. El alcance y el rol solo los
 * cambia la direccion de grupo.
 */
create or replace function fn_guard_alcance()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if (new.alcance is distinct from old.alcance or new.rol is distinct from old.rol)
     and not manda_en_grupo() then
    raise exception 'Solo la direccion de grupo puede cambiar el rol o el alcance de un perfil';
  end if;
  return new;
end;
$$;

drop trigger if exists tg_guard_alcance on perfiles;
create trigger tg_guard_alcance before update on perfiles
  for each row execute function fn_guard_alcance();

-- ----------------------------------------------------------------------------
-- 6. LO QUE ES DE TODOS
--
-- Catalogos, parametros, reglas de puntuacion, etiquetas, integraciones,
-- cuestionarios y metodo: los cambia la direccion de GRUPO. Una direccion de
-- centro los lee —los necesita para trabajar— pero no los toca, porque tocarlos
-- seria cambiarle las reglas a los otros dos centros.
-- ----------------------------------------------------------------------------
drop policy if exists catalogos_gestionar on canales;
create policy catalogos_gestionar on canales for all to authenticated
  using (manda_en_grupo()) with check (manda_en_grupo());

drop policy if exists catalogos_gestionar on adicciones;
create policy catalogos_gestionar on adicciones for all to authenticated
  using (manda_en_grupo()) with check (manda_en_grupo());

drop policy if exists catalogos_gestionar on modalidades;
create policy catalogos_gestionar on modalidades for all to authenticated
  using (manda_en_grupo()) with check (manda_en_grupo());

drop policy if exists catalogos_gestionar on motivos_perdida;
create policy catalogos_gestionar on motivos_perdida for all to authenticated
  using (manda_en_grupo()) with check (manda_en_grupo());

drop policy if exists catalogos_gestionar on centros;
create policy catalogos_gestionar on centros for all to authenticated
  using (manda_en_grupo()) with check (manda_en_grupo());

drop policy if exists catalogos_gestionar on configuracion;
create policy catalogos_gestionar on configuracion for all to authenticated
  using (manda_en_grupo()) with check (manda_en_grupo());

drop policy if exists catalogos_gestionar on modalidad_centros;
create policy catalogos_gestionar on modalidad_centros for all to authenticated
  using (manda_en(centro_id)) with check (manda_en(centro_id));

drop policy if exists scoring_direccion on scoring_reglas;
create policy scoring_direccion on scoring_reglas for all to authenticated
  using (manda_en_grupo()) with check (manda_en_grupo());

drop policy if exists etiquetas_direccion on etiquetas;
create policy etiquetas_direccion on etiquetas for all to authenticated
  using (manda_en_grupo()) with check (manda_en_grupo());

drop policy if exists reglas_etiquetado_direccion on reglas_etiquetado;
create policy reglas_etiquetado_direccion on reglas_etiquetado for all to authenticated
  using (manda_en_grupo()) with check (manda_en_grupo());

drop policy if exists fases_gestionar on fases_metodo;
create policy fases_gestionar on fases_metodo for all to authenticated
  using (manda_en_grupo()) with check (manda_en_grupo());

drop policy if exists cuestionarios_gestionar on cuestionarios;
create policy cuestionarios_gestionar on cuestionarios for all to authenticated
  using (manda_en_grupo()) with check (manda_en_grupo());

drop policy if exists preguntas_gestionar on cuestionario_preguntas;
create policy preguntas_gestionar on cuestionario_preguntas for all to authenticated
  using (manda_en_grupo()) with check (manda_en_grupo());

drop policy if exists integraciones_ver on integraciones;
create policy integraciones_ver on integraciones for select to authenticated
  using (manda_en_grupo());

drop policy if exists integraciones_gestionar on integraciones;
create policy integraciones_gestionar on integraciones for all to authenticated
  using (manda_en_grupo()) with check (manda_en_grupo());

-- ----------------------------------------------------------------------------
-- 7. MARKETING
--
-- Por decidir que las campañas vayan por centro hace falta partir listas,
-- segmentos y consentimientos, que es un trabajo aparte. Hasta entonces el
-- correo sigue siendo del grupo, y se dice aqui para que no parezca un olvido.
-- ----------------------------------------------------------------------------
drop policy if exists listas_direccion on listas;
create policy listas_direccion on listas for all to authenticated
  using (manda_en_grupo()) with check (manda_en_grupo());

drop policy if exists lista_contactos_direccion on lista_contactos;
create policy lista_contactos_direccion on lista_contactos for all to authenticated
  using (manda_en_grupo()) with check (manda_en_grupo());

drop policy if exists campanas_leer on campanas_email;
create policy campanas_leer on campanas_email for select to authenticated
  using (manda_en_grupo());

drop policy if exists campanas_gestionar on campanas_email;
create policy campanas_gestionar on campanas_email for all to authenticated
  using (manda_en_grupo()) with check (manda_en_grupo());

drop policy if exists destinatarios_leer on campana_destinatarios;
create policy destinatarios_leer on campana_destinatarios for select to authenticated
  using (manda_en_grupo());

drop policy if exists destinatarios_gestionar on campana_destinatarios;
create policy destinatarios_gestionar on campana_destinatarios for all to authenticated
  using (manda_en_grupo()) with check (manda_en_grupo());

drop policy if exists plantillas_leer on plantillas_email;
create policy plantillas_leer on plantillas_email for select to authenticated
  using (manda_en_grupo());

drop policy if exists plantillas_gestionar on plantillas_email;
create policy plantillas_gestionar on plantillas_email for all to authenticated
  using (manda_en_grupo()) with check (manda_en_grupo());

-- ----------------------------------------------------------------------------
-- 8. REGISTROS DEL SISTEMA
--
-- La auditoria, los accesos, el motor y las consultas a la IA son del grupo: un
-- registro de seguridad partido por centros deja de servir para ver un patron,
-- que es justo para lo que sirve.
-- ----------------------------------------------------------------------------
drop policy if exists auditoria_direccion_leer on auditoria;
create policy auditoria_direccion_leer on auditoria for select to authenticated
  using (manda_en_grupo());

drop policy if exists accesos_ver on accesos;
create policy accesos_ver on accesos for select to authenticated
  using (manda_en_grupo());

drop policy if exists ejecuciones_motor_ver on ejecuciones_motor;
create policy ejecuciones_motor_ver on ejecuciones_motor for select to authenticated
  using (manda_en_grupo());

drop policy if exists presencia_ver on presencia_app;
create policy presencia_ver on presencia_app for select to authenticated
  using (manda_en_grupo());

drop policy if exists ia_ver on ia_consultas;
create policy ia_ver on ia_consultas for select to authenticated
  using (manda_en_grupo() or usuario_id = auth.uid());

drop policy if exists informes_direccion on informes_mensuales;
create policy informes_direccion on informes_mensuales for all to authenticated
  using (manda_en_grupo()) with check (manda_en_grupo());

drop policy if exists whatsapp_ver on mensajes_whatsapp;
create policy whatsapp_ver on mensajes_whatsapp for select to authenticated
  using (manda_en_grupo() or manda_en_lead(lead_id));
