-- ============================================================================
-- DE DONDE VIENE CADA PERSONA
-- ============================================================================
--
-- Al traer al directorio las personas de HighLevel, ochenta y cinco filas
-- aparecen sin centro, sin caso y sin nada que las explique. Quien abre
-- Contactos ve una lista donde no distingue a quien pidio hora en Bellamar de
-- quien escribio por Instagram preguntando por el Metodo HOME.
--
-- La informacion existia —esta en `canal_identidades`— pero esa tabla solo la
-- ve la direccion de grupo, porque guarda conversaciones. Asi que el dato mas
-- inocente de todos, «de donde vino esta persona», quedaba tapado justo para
-- quien lo necesita a diario.
--
-- Va aqui, en el directorio, donde siempre debio estar: una palabra, visible
-- para quien ya puede ver a la persona, sin abrir nada mas.
-- ============================================================================

alter table contactos add column if not exists origen text;

comment on column contactos.origen is
  'De dónde vino esta persona: «highlevel», «zerochats», «formulario», «manual»… Es un rótulo para leer la lista de un vistazo, no una clave: la trazabilidad fina vive en canal_identidades.';

create index if not exists idx_contactos_origen on contactos (origen) where origen is not null;
