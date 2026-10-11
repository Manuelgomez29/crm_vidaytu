-- ============================================================================
-- UN REMITENTE POR CENTRO
-- ============================================================================
--
-- Las campanas de email ya son por centro (`campanas_email.centro_id`) pero el
-- remitente era UNO para todo el grupo: la clave `marketing_remitente` de
-- `configuracion`. Asi, una campana de Bellamar salia firmada igual que una de
-- Eclipse, desde el mismo dominio.
--
-- Eso tiene dos problemas, y el segundo es el grave:
--
--   · De marca: quien consulto en Bellamar espera un correo de Bellamar.
--   · De DISCRECION (regla 12): un remitente generico del grupo, con un nombre
--     que no dice nada, hace que el correo parezca lo que no debe parecer. Un
--     correo de «Bellamar Centro» es un correo de un centro con el que esa
--     persona ya hablo; uno de «Vidaitu» es un desconocido escribiendo.
--
-- Se decidio verificar en Resend un dominio por web, asi que cada centro firma
-- con el suyo. El remitente vive en la ficha del centro (regla 13: nada
-- cableado) y se edita desde Administracion → Centros. Si un centro no lo tiene,
-- se usa el global, que sigue existiendo para la bandeja de grupo y para no
-- dejar ninguna campana sin remitente.
-- ============================================================================

alter table centros add column if not exists email_remitente text;

comment on column centros.email_remitente is
  'Remitente de las campañas de este centro, en formato «Nombre <correo@dominio>» o solo el correo. El dominio tiene que estar verificado en Resend o el envío falla. Vacío = se usa el remitente global de configuracion.marketing_remitente.';
