-- ============================================================================
-- DAR DE BAJA A ALGUIEN DEL EQUIPO
--
-- Habia 20 claves foraneas hacia `perfiles` que bloqueaban el borrado de un
-- perfil, sin criterio: mezclaban dos cosas que no son lo mismo.
--
--   AUTORIA      quien hizo algo. Una nota, un presupuesto, un mensaje del
--                chat, una sesion ya celebrada. Es un hecho del pasado: no se
--                reasigna a nadie, porque reescribirlo falsearia el historial
--                (regla 11). Pero tampoco puede impedir para siempre dar de
--                baja a una persona.
--
--   ASIGNACION   de que es responsable alguien AHORA. Sus casos, sus tareas
--                pendientes, sus citas futuras, sus pacientes. Esto si tiene
--                que cambiar de manos, y de forma deliberada.
--
-- Criterio, y es el que explica todo el fichero:
--
--   Lo que alguien HIZO se queda suyo hasta que se le borra, y entonces pasa
--   a ser anonimo. Lo que alguien LLEVA hay que traspasarlo antes.
--
-- Por eso los 16 campos de autoria pasan a `on delete set null` —el registro
-- sobrevive, el autor desaparece— y los 4 de asignacion SIGUEN BLOQUEANDO a
-- proposito. Ese bloqueo no es un estorbo: es lo que obliga a pasar por el
-- traspaso de `/admin/equipo` en vez de dejar casos y pacientes huerfanos sin
-- que nadie se entere.
--
-- Los cuatro que se quedan como estan:
--   leads.propietario_id · tareas.responsable_id
--   citas.profesional_id · pacientes.terapeuta_id
--
-- Continua lo empezado en 20260904200000_autoria_sobrevive_a_las_bajas.sql,
-- que hizo esto mismo con nueve columnas y se dejo el resto a medias.
-- ============================================================================

alter table actividades drop constraint actividades_usuario_id_fkey;
alter table actividades add constraint actividades_usuario_id_fkey
  foreign key (usuario_id) references perfiles (id) on delete set null;

alter table ausencias drop constraint ausencias_created_by_fkey;
alter table ausencias add constraint ausencias_created_by_fkey
  foreign key (created_by) references perfiles (id) on delete set null;

alter table caso_adjuntos drop constraint caso_adjuntos_subido_por_fkey;
alter table caso_adjuntos add constraint caso_adjuntos_subido_por_fkey
  foreign key (subido_por) references perfiles (id) on delete set null;

alter table contacto_etiquetas drop constraint contacto_etiquetas_aplicada_por_fkey;
alter table contacto_etiquetas add constraint contacto_etiquetas_aplicada_por_fkey
  foreign key (aplicada_por) references perfiles (id) on delete set null;

alter table conversaciones drop constraint conversaciones_created_by_fkey;
alter table conversaciones add constraint conversaciones_created_by_fkey
  foreign key (created_by) references perfiles (id) on delete set null;

alter table conversiones drop constraint conversiones_registrada_por_fkey;
alter table conversiones add constraint conversiones_registrada_por_fkey
  foreign key (registrada_por) references perfiles (id) on delete set null;

alter table conversiones drop constraint conversiones_validada_por_fkey;
alter table conversiones add constraint conversiones_validada_por_fkey
  foreign key (validada_por) references perfiles (id) on delete set null;

alter table etiquetas drop constraint etiquetas_created_by_fkey;
alter table etiquetas add constraint etiquetas_created_by_fkey
  foreign key (created_by) references perfiles (id) on delete set null;

alter table leads drop constraint leads_created_by_fkey;
alter table leads add constraint leads_created_by_fkey
  foreign key (created_by) references perfiles (id) on delete set null;

alter table lista_contactos drop constraint lista_contactos_added_by_fkey;
alter table lista_contactos add constraint lista_contactos_added_by_fkey
  foreign key (added_by) references perfiles (id) on delete set null;

alter table listas drop constraint listas_created_by_fkey;
alter table listas add constraint listas_created_by_fkey
  foreign key (created_by) references perfiles (id) on delete set null;

alter table mensajes drop constraint mensajes_autor_id_fkey;
alter table mensajes add constraint mensajes_autor_id_fkey
  foreign key (autor_id) references perfiles (id) on delete set null;

alter table objetivos drop constraint objetivos_created_by_fkey;
alter table objetivos add constraint objetivos_created_by_fkey
  foreign key (created_by) references perfiles (id) on delete set null;

alter table pipelines drop constraint pipelines_created_by_fkey;
alter table pipelines add constraint pipelines_created_by_fkey
  foreign key (created_by) references perfiles (id) on delete set null;

alter table presupuestos drop constraint presupuestos_creado_por_fkey;
alter table presupuestos add constraint presupuestos_creado_por_fkey
  foreign key (creado_por) references perfiles (id) on delete set null;

-- La sesion ya celebrada es historia: dice quien la hizo, y no se reasigna.
alter table sesiones drop constraint sesiones_terapeuta_id_fkey;
alter table sesiones add constraint sesiones_terapeuta_id_fkey
  foreign key (terapeuta_id) references perfiles (id) on delete set null;

-- ----------------------------------------------------------------------------
-- Los cuatro de asignacion se quedan bloqueando. Se documenta para que nadie
-- los "arregle" mas adelante pensando que es un descuido.
-- ----------------------------------------------------------------------------
comment on column leads.propietario_id is
  'Comercial responsable. Bloquea el borrado del perfil a proposito: traspasa la cartera desde /admin/equipo antes de dar de baja a alguien.';
comment on column tareas.responsable_id is
  'Quien tiene que hacerla. Bloquea el borrado del perfil a proposito: una tarea sin responsable no aparece en la bandeja de nadie.';
comment on column citas.profesional_id is
  'Quien atiende la cita. Bloquea el borrado del perfil a proposito: una cita futura sin profesional deja a alguien esperando.';
comment on column pacientes.terapeuta_id is
  'Terapeuta referente. Bloquea el borrado del perfil a proposito: un paciente sin referente no lo ve nadie salvo direccion.';
