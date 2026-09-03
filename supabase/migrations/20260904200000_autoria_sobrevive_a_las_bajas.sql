-- ============================================================================
-- La autoria no puede bloquear una baja del equipo.
--
-- `facturas.created_by` y `cobros.registrado_por` apuntaban a `perfiles` sin
-- ON DELETE, asi que borrar a alguien que hubiera emitido una sola factura
-- fallaba con un error de clave ajena. En una plataforma donde la gente entra
-- y sale, eso significa que nadie se puede borrar nunca.
--
-- Se pasan a ON DELETE SET NULL, igual que el resto del esquema: el documento
-- sobrevive, la autoria concreta se pierde. Quien hizo que sigue estando en
-- `auditoria`, que es append-only y no depende de estas tablas.
-- ============================================================================

alter table facturas drop constraint if exists facturas_created_by_fkey;
alter table facturas
  add constraint facturas_created_by_fkey
  foreign key (created_by) references perfiles (id) on delete set null;

alter table cobros drop constraint if exists cobros_registrado_por_fkey;
alter table cobros
  add constraint cobros_registrado_por_fkey
  foreign key (registrado_por) references perfiles (id) on delete set null;

alter table gasto_campanas drop constraint if exists gasto_campanas_created_by_fkey;
alter table gasto_campanas
  add constraint gasto_campanas_created_by_fkey
  foreign key (created_by) references perfiles (id) on delete set null;

alter table plantillas_email drop constraint if exists plantillas_email_created_by_fkey;
alter table plantillas_email
  add constraint plantillas_email_created_by_fkey
  foreign key (created_by) references perfiles (id) on delete set null;

alter table campanas_email drop constraint if exists campanas_email_created_by_fkey;
alter table campanas_email
  add constraint campanas_email_created_by_fkey
  foreign key (created_by) references perfiles (id) on delete set null;

alter table pacientes drop constraint if exists pacientes_created_by_fkey;
alter table pacientes
  add constraint pacientes_created_by_fkey
  foreign key (created_by) references perfiles (id) on delete set null;

alter table sesiones drop constraint if exists sesiones_created_by_fkey;
alter table sesiones
  add constraint sesiones_created_by_fkey
  foreign key (created_by) references perfiles (id) on delete set null;

alter table documentos_clinicos drop constraint if exists documentos_clinicos_subido_por_fkey;
alter table documentos_clinicos
  add constraint documentos_clinicos_subido_por_fkey
  foreign key (subido_por) references perfiles (id) on delete set null;

alter table cuestionario_respuestas drop constraint if exists cuestionario_respuestas_registrado_por_fkey;
alter table cuestionario_respuestas
  add constraint cuestionario_respuestas_registrado_por_fkey
  foreign key (registrado_por) references perfiles (id) on delete set null;

alter table ocupaciones drop constraint if exists ocupaciones_created_by_fkey;
alter table ocupaciones
  add constraint ocupaciones_created_by_fkey
  foreign key (created_by) references perfiles (id) on delete set null;
