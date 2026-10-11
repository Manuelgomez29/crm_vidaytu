-- ============================================================================
-- CORREOS POR BLOQUES
-- ============================================================================
--
-- El editor de campañas era dos cajas de texto: el texto plano y el HTML a
-- pelo. Nadie que no sepa HTML podia montar una guia con un titulo, dos
-- parrafos y un boton; y quien lo sabia, lo hacia distinto cada vez.
--
-- Ahora el contenido se compone por BLOQUES —titulo, parrafo, boton, imagen,
-- separador— y es la aplicacion la que genera el HTML con la marca del centro
-- y la version en texto plano. Lo que se guarda aqui es la lista de bloques:
-- es lo que permite volver a abrir el correo y seguir editandolo. `cuerpo_html`
-- y `cuerpo_texto` se siguen rellenando (generados) porque son lo que envia la
-- maquinaria de campañas y lo que lee el filtro de terminos clinicos; asi nada
-- de lo que ya existe cambia de contrato.
--
-- Nulo = correo escrito a mano, como hasta ahora. Las dos formas conviven.
-- ============================================================================

alter table plantillas_email add column if not exists bloques jsonb;
alter table campanas_email   add column if not exists bloques jsonb;

comment on column plantillas_email.bloques is
  'Lista de bloques del editor: [{tipo:"titulo"|"parrafo"|"boton"|"imagen"|"separador", ...}]. Si es nulo, el correo se escribió a mano en cuerpo_texto/cuerpo_html.';
comment on column campanas_email.bloques is
  'Lista de bloques del editor, copiada de la plantilla al crear la campaña y editable después. Nulo = escrito a mano.';
