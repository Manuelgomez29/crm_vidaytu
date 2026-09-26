-- ============================================================================
-- DE DONDE VIENE, CON DETALLE
-- ============================================================================
--
-- Un comercial que reciba a alguien llegado de Instagram ve un nombre, un
-- telefono y poco mas. No sabe por que escribio, y eso lo obliga a empezar la
-- llamada preguntando lo que la persona ya conto una vez.
--
-- La conversacion no la tenemos para todo el mundo —ZeroChats no expone los
-- mensajes— pero SI tenemos, desde el primer dia y sin usarlo:
--
--   · A que publicacion respondio: el reel, la historia o el anuncio, con su
--     enlace. «Vino del reel de familias» dice mucho en una linea.
--   · Las etiquetas que le puso el bot y en que etapa del embudo lo dejo.
--
-- Eso no es la conversacion, pero es concepto de verdad.
-- ============================================================================

alter table canal_identidades add column if not exists publicacion jsonb;

comment on column canal_identidades.publicacion is
  'La publicación a la que respondió: {id, tipo, enlace, via, cuando}. Tipo es STORY, REELS, FEED o AD. Llega en el evento lead.media_replied y es la mejor pista de por qué escribió esa persona.';

-- ----------------------------------------------------------------------------
-- Quien puede leer esto
-- ----------------------------------------------------------------------------
--
-- Hasta ahora `canal_identidades` era solo de direccion de grupo, porque vive
-- al lado de las conversaciones. Pero el origen de una persona no es una
-- conversacion: es el dato que necesita quien la va a llamar.
--
-- Se abre SOLO para las identidades ya enlazadas a una persona que ese usuario
-- puede ver. Ni una suelta, ni una de alguien que no le corresponde — con la
-- misma regla que decide si ve a esa persona en el directorio.
create policy canal_identidades_de_los_mios on canal_identidades for select to authenticated
  using (
    contacto_id is not null
    and mi_rol() in ('direccion', 'admisiones')
    and puedo_ver_recorrido(
      (select c.recorrido_id from contactos c where c.id = contacto_id),
      contacto_id
    )
  );
