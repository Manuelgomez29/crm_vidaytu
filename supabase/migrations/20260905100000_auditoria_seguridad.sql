-- ============================================================================
-- CORRECCIONES DE LA AUDITORIA DE SEGURIDAD
--
-- Cinco agujeros encontrados revisando la plataforma como atacante, cada uno
-- reproducido antes de arreglarlo.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. FUGA A TRAVES DEL MURO: las tablas de marketing eran legibles por
--    CUALQUIER usuario autenticado.
--
-- `campana_destinatarios` guarda el email de cada persona de la base de
-- marketing y su token de baja. Con `using (true)`, un terapeuta —que no ve
-- ni un solo contacto ni un solo caso— podia listar todos los correos y sus
-- tokens. Y esos correos son de personas vinculadas a centros de adicciones:
-- la lista en si misma es el dato sensible.
--
-- Comprobado: sesion de terapeuta@test.com devolvia email y token en claro.
--
-- El marketing es de direccion de punta a punta (es quien redacta, programa y
-- envia), asi que la lectura tambien lo es.
-- ----------------------------------------------------------------------------
drop policy if exists campanas_leer on campanas_email;
create policy campanas_leer on campanas_email for select to authenticated
  using (es_direccion());

drop policy if exists destinatarios_leer on campana_destinatarios;
create policy destinatarios_leer on campana_destinatarios for select to authenticated
  using (es_direccion());

drop policy if exists bajas_leer on bajas_marketing;
create policy bajas_leer on bajas_marketing for select to authenticated
  using (es_direccion());

drop policy if exists plantillas_leer on plantillas_email;
create policy plantillas_leer on plantillas_email for select to authenticated
  using (es_direccion());

-- ----------------------------------------------------------------------------
-- 2. CUALQUIERA EN INTERNET PODIA QUEMAR NUMEROS DE FACTURA.
--
-- `siguiente_numero_factura` incrementa el contador de la serie fiscal, y
-- Postgres concede EXECUTE a PUBLIC por defecto al crear una funcion. El
-- GRANT a `authenticated` no revoca eso.
--
-- Comprobado: con la clave publicable del navegador y SIN iniciar sesion, tres
-- llamadas movieron la serie de Bellamar del 1 al 4. La siguiente factura real
-- habria salido con el 5, dejando tres huecos — justo el problema que la
-- numeracion al emitir pretendia evitar.
--
-- Se revoca a PUBLIC y, ademas, la funcion comprueba por dentro quien llama:
-- si el GRANT se recreara por accidente, seguiria sin poder usarse.
-- ----------------------------------------------------------------------------
create or replace function siguiente_numero_factura(p_centro uuid, p_ano smallint)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_siguiente integer;
  v_slug text;
begin
  -- Segunda cerradura, dentro de la funcion: consumir un numero de serie es
  -- un acto contable, no una consulta.
  if not (es_direccion() or mi_rol() = 'administracion') then
    raise exception 'Solo direccion o administracion pueden emitir facturas';
  end if;

  insert into series_factura (centro_id, ano, ultimo_numero)
  values (p_centro, p_ano, 1)
  on conflict (centro_id, ano)
    do update set ultimo_numero = series_factura.ultimo_numero + 1
  returning ultimo_numero into v_siguiente;

  select upper(left(regexp_replace(slug, '[^a-zA-Z]', '', 'g'), 2))
    into v_slug from centros where id = p_centro;

  return format('VYT-%s-%s-%s', coalesce(v_slug, 'XX'), p_ano, lpad(v_siguiente::text, 4, '0'));
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. FUNCIONES EXPUESTAS A ANONIMOS.
--
-- Todas las funciones heredaban EXECUTE de PUBLIC. La mayoria son inofensivas
-- sin sesion (devuelven false o vacio), pero no hay razon para ofrecerlas:
-- `aviso_disponibilidad` contestaba a un anonimo si un profesional tiene hueco
-- a una hora dada, y los triggers no deberian poder invocarse a mano.
--
-- `darse_de_baja` es la unica excepcion: la llama el enlace del correo, de
-- alguien que por definicion no tiene cuenta.
-- ----------------------------------------------------------------------------
revoke execute on function siguiente_numero_factura(uuid, smallint) from public, anon;
revoke execute on function aviso_disponibilidad(uuid, timestamptz, timestamptz) from public, anon;
revoke execute on function agenda_citas(timestamptz, timestamptz) from public, anon;
revoke execute on function profesionales_agendables() from public, anon;
revoke execute on function es_direccion() from public, anon;
revoke execute on function mi_rol() from public, anon;
revoke execute on function mis_centros() from public, anon;
revoke execute on function mis_pacientes() from public, anon;
revoke execute on function mis_conversaciones() from public, anon;
revoke execute on function tiene_acceso_clinico() from public, anon;
revoke execute on function fn_auditoria() from public, anon;
revoke execute on function fn_guard_propietario() from public, anon;
revoke execute on function fn_sync_estado_etapa() from public, anon;
revoke execute on function fn_sync_contacto_principal() from public, anon;
revoke execute on function fn_touch_updated_at() from public, anon;
revoke execute on function fn_touch_configuracion() from public, anon;
revoke execute on function fn_marcar_cierre() from public, anon;

grant execute on function siguiente_numero_factura(uuid, smallint) to authenticated;
grant execute on function aviso_disponibilidad(uuid, timestamptz, timestamptz) to authenticated;
grant execute on function agenda_citas(timestamptz, timestamptz) to authenticated;
grant execute on function profesionales_agendables() to authenticated;
grant execute on function es_direccion(), mi_rol(), mis_centros() to authenticated;
grant execute on function mis_pacientes(), mis_conversaciones(), tiene_acceso_clinico() to authenticated;

-- ----------------------------------------------------------------------------
-- 4. FUGA ENTRE CENTROS: los mensajes de WhatsApp.
--
-- La politica daba acceso a cualquier `admisiones`, sin mirar el centro. Un
-- comercial de Horizonte no ve NI UN lead de Bellamar, pero podia leer los
-- mensajes entrantes de sus leads, con el telefono incluido.
--
-- Comprobado: 0 leads de Bellamar visibles, 1 mensaje de WhatsApp de Bellamar
-- legible.
--
-- Ahora hereda la visibilidad del caso al que pertenece. Los mensajes todavia
-- sin emparejar (lead_id null) los ve solo direccion: hasta que se sabe de que
-- caso son, no se sabe de que centro son.
-- ----------------------------------------------------------------------------
drop policy if exists whatsapp_ver on mensajes_whatsapp;
create policy whatsapp_ver on mensajes_whatsapp for select to authenticated
  using (
    es_direccion()
    or (
      lead_id is not null
      and exists (
        select 1 from leads l
        where l.id = mensajes_whatsapp.lead_id
          and l.centro_id in (select mis_centros())
      )
    )
  );

-- ----------------------------------------------------------------------------
-- 5. LOS AVISOS ENTRE COMPANEROS SE PERDIAN EN SILENCIO.
--
-- `notificaciones` tenia politicas de leer, actualizar y borrar las propias,
-- pero NINGUNA de insertar. Todo aviso creado por una accion con la sesion del
-- usuario —asignar un paciente a un terapeuta, agendar una cita para otro,
-- escribir en el chat clinico, traspasar una cartera— era rechazado por RLS.
-- El codigo no miraba el error, asi que nadie se enteraba de nada y no habia
-- ni rastro del fallo.
--
-- Comprobado: insertar un aviso para otro usuario devolvia "violates
-- row-level security policy" y la fila nunca llegaba.
--
-- Se permite avisar a un companero ACTIVO. Es una capacidad entre personal
-- interno, no un canal hacia fuera: lo peor que permite es que alguien del
-- equipo moleste a otro, y eso ya lo puede hacer por cualquier via.
-- ----------------------------------------------------------------------------
create policy notificaciones_avisar on notificaciones for insert to authenticated
  with check (
    exists (select 1 from perfiles p where p.id = usuario_id and p.activo)
  );

-- ----------------------------------------------------------------------------
-- 6. ENDURECIMIENTO: quitar a `anon` los permisos de tabla.
--
-- Supabase concede SELECT/INSERT/UPDATE/DELETE/TRUNCATE sobre todo el esquema
-- `public` tanto a `anon` como a `authenticated`. Hoy no se cuela nada porque
-- todas las tablas tienen RLS con politicas que exigen `auth.uid()`, y esta
-- comprobado. Pero eso deja a RLS como UNICA barrera: el dia que una migracion
-- cree una tabla y se olvide del `enable row level security`, esa tabla queda
-- abierta a internet para leer Y ESCRIBIR.
--
-- `anon` no consulta ninguna tabla en esta plataforma: la unica ruta anonima
-- es el enlace de baja, que va por una funcion security definer. Asi que se
-- le retira todo, y queda una segunda barrera bajo RLS.
--
-- TRUNCATE se retira tambien a `authenticated`: RLS NO se aplica a TRUNCATE,
-- asi que con ese permiso la auditoria "imborrable" se podia vaciar entera.
-- ----------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke truncate on all tables in schema public from authenticated;

-- Y lo mismo para lo que se cree a partir de ahora.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- ----------------------------------------------------------------------------
-- 7. LIMITES EN EL ALMACENAMIENTO.
--
-- Los buckets no tenian ni tamano maximo ni tipos permitidos. El limite de
-- 20 MB solo estaba en la accion del servidor, y el almacenamiento de Supabase
-- es accesible DIRECTAMENTE desde el navegador con la sesion del usuario: ese
-- limite era una sugerencia.
--
-- Los tipos importan mas que el tamano: un .html subido como documento se
-- sirve con su content-type desde el dominio del almacenamiento, y ahi ejecuta
-- javascript. Con la lista de tipos, deja de poder subirse.
-- ----------------------------------------------------------------------------
update storage.buckets
   set file_size_limit = 20971520, -- 20 MB
       allowed_mime_types = array[
         'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic',
         'application/pdf',
         'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.ms-excel',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'text/plain', 'text/csv'
       ]
 where id in ('adjuntos-casos', 'documentos-clinicos');
