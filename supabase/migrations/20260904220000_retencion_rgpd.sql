-- ============================================================================
-- Parametros de retencion (RGPD art. 5.1.e).
--
-- APAGADO POR DEFECTO Y A PROPOSITO. El plazo de conservacion es una decision
-- juridica del grupo, no tecnica: la propuesta de partida son 12 meses desde
-- que el caso se cerro, pero eso lo confirma el asesor. Hasta entonces la
-- plataforma no anonimiza nada por su cuenta.
--
-- Se anonimiza, no se borra: las filas se quedan sin datos personales, para
-- que las metricas historicas sigan cuadrando sin conservar a quien
-- pertenecian.
-- ============================================================================

insert into configuracion (clave, valor, descripcion) values
  (
    'retencion_meses',
    '12',
    'Meses tras el cierre de un caso perdido o no valido antes de anonimizarlo. PROPUESTA: validar con el asesor antes de encender la anonimizacion automatica.'
  ),
  (
    'retencion_automatica',
    'false',
    'Si el motor anonimiza solo los casos que pasan del plazo. Encender unicamente cuando el plazo este validado juridicamente.'
  )
on conflict (clave) do nothing;

-- La accion nueva de auditoria. La tabla no restringe el texto, pero se deja
-- constancia aqui de que ANONIMIZACION es una accion esperada y no un error.
comment on column auditoria.accion is
  'INSERT, UPDATE, DELETE de los triggers; EXPORTACION y ANONIMIZACION los escribe la aplicacion.';
