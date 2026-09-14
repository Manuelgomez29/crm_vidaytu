-- ============================================================================
-- LA PLATAFORMA SE ENTREGA POR PARTES
-- ============================================================================
--
-- Esta construida entera, pero el primer dia solo se usa el area comercial. Las
-- demas, tal y como estan hoy, solo pueden decepcionar: marketing no puede
-- enviar nada —sin proveedor de correo y con un contacto con consentimiento—,
-- facturacion tiene una factura de prueba y la clinica es de la fase 3.
--
-- Se apagan como AJUSTE, no comentando codigo (regla 13): el dia que haya
-- proveedor de correo, marketing se enciende desde Configuracion -> Parametros
-- y sin desplegar. Nada se borra; los datos siguen donde estaban.
--
-- `comercial` y `administracion` no se pueden quitar y por eso no hacia falta
-- ponerlas aqui — pero se ponen igual, porque una lista que dice solo la mitad
-- de la verdad se lee mal. `lib/areas.ts` las anade de todos modos: sin
-- administracion no habria forma de volver a encender nada, ni siquiera ella.
-- ============================================================================

insert into configuracion (clave, valor, descripcion)
values (
  'areas_activas',
  '["comercial","administracion"]'::jsonb,
  'Áreas encendidas. Las apagadas se ven en el menú en gris y con su fase, y su ruta queda bloqueada en el servidor. comercial y administracion no se pueden apagar.'
)
on conflict (clave) do nothing;
