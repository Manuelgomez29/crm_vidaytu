-- ============================================================================
-- EL TABLERO SE VE DESDE CUALQUIER CENTRO
-- ============================================================================
--
-- Sintoma: la direccion de Horizonte abre el kanban y ve «2 casos abiertos»
-- sobre un tablero COMPLETAMENTE VACIO. Ni columnas ni tarjetas. Y en la
-- cabecera, «Proceso: —».
--
-- Causa: las politicas de `pipelines` y `pipeline_etapas` dejaban leer a la
-- direccion con `manda_en(centro_id)`. El proceso «Estandar Vidaitu» es del
-- grupo, o sea `centro_id is null`, y `manda_en(null)` es falso para quien
-- tiene alcance de centro —lo dice su propia definicion, `p_centro is not
-- null`—. Sin proceso no hay etapas, sin etapas no hay columnas, y sin columnas
-- no se pinta ninguna tarjeta aunque los casos si se puedan leer.
--
-- Lo llamativo es que un COMERCIAL si lo veia: `pipelines_admisiones_leer`
-- permite leer a `mi_rol() = 'admisiones'` sin mirar el centro. O sea que el
-- tablero funcionaba para todo el equipo y se rompia justo para quien dirige un
-- centro, que es el perfil que se acaba de crear.
--
-- Arreglo: un proceso de venta es la FORMA DEL TABLERO, no un dato sobre nadie.
-- No lleva nombres, ni telefonos, ni importes: lleva «Nuevo, Contactado, Cita
-- agendada». Quien trabaja casos tiene que poder verlo, asi que la lectura se
-- abre a cualquier usuario autenticado. No es abrir nada nuevo: es poner a la
-- direccion al mismo nivel que admisiones, que ya lo leia entero.
--
-- Lo que NO cambia es quien lo TOCA. Crear procesos, anadir etapas y borrarlas
-- sigue exactamente igual, y ademas el panel lo escribe con la clave de
-- servicio, asi que la barrera de verdad esta en `exigirDireccionDeGrupo` de
-- `src/app/admin/actions.ts`. Aqui solo se toca el SELECT.
-- ============================================================================

-- --------------------------------------------------------------------------
-- pipelines
-- --------------------------------------------------------------------------

-- La de admisiones deja de hacer falta: la nueva la incluye.
drop policy if exists pipelines_admisiones_leer on pipelines;
drop policy if exists pipelines_leer on pipelines;

create policy pipelines_leer on pipelines
  for select to authenticated
  using (true);

-- --------------------------------------------------------------------------
-- pipeline_etapas
-- --------------------------------------------------------------------------

drop policy if exists pipeline_etapas_admisiones_leer on pipeline_etapas;
drop policy if exists pipeline_etapas_leer on pipeline_etapas;

create policy pipeline_etapas_leer on pipeline_etapas
  for select to authenticated
  using (true);

comment on policy pipelines_leer on pipelines is
  'La forma del tablero la ve cualquiera que entre; tocarla, solo la direccion de grupo desde el panel.';
comment on policy pipeline_etapas_leer on pipeline_etapas is
  'Las etapas son las columnas del kanban: sin poder leerlas el tablero sale vacio.';
