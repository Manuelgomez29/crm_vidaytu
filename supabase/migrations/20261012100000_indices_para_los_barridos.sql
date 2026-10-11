-- ============================================================================
-- INDICES PARA LOS BARRIDOS DEL MOTOR DE FLUJOS
-- ============================================================================
--
-- Hallazgo de la auditoria con datos reales (1.609 personas, 2.000 identidades,
-- 5.500 filas de espejo): el motor de flujos barre cada quince minutos
-- «lo que ha pasado desde la ultima vez» en tres tablas, y ninguna tenia un
-- indice que sirviera para esa pregunta:
--
--   · contacto_etiquetas: «esta etiqueta, puesta despues de T» → recorrido
--     completo de la tabla por cada flujo activo.
--   · actividades: «cambios de estado despues de T» → idem, y esta tabla crece
--     con cada llamada, nota y WhatsApp.
--   · contactos: «consentimiento dado despues de T» → recorrido del directorio.
--
-- Con cien filas no se nota. Con cien mil, cada pasada del motor se convierte
-- en tres recorridos completos cada quince minutos. Los indices son parciales o
-- compuestos para que sirvan exactamente a esa consulta y no pesen mas de lo
-- que aportan.
-- ============================================================================

-- Disparador «etiqueta aplicada».
create index if not exists idx_contacto_etiquetas_etiqueta_fecha
  on contacto_etiquetas (etiqueta_id, created_at);

-- Disparador «cambio de estado»: solo las actividades de ese tipo, por fecha.
create index if not exists idx_actividades_cambio_estado_fecha
  on actividades (created_at)
  where tipo = 'cambio_estado';

-- Disparador «consentimiento»: solo quien lo ha dado, por fecha.
create index if not exists idx_contactos_consentimiento_fecha
  on contactos (consentimiento_marketing_at)
  where consentimiento_marketing = true;

-- Las campañas perpetuas de los flujos se buscan por estado en cada pasada.
create index if not exists idx_campanas_email_estado
  on campanas_email (estado);

-- La purga del espejo borra por «ultima vez visto» y tipo.
create index if not exists idx_canal_espejo_tipo_visto
  on canal_espejo (tipo, visto_at);
