-- ============================================================================
-- Recordatorios de cita automaticos y reparto por disponibilidad.
-- ============================================================================

-- La direccion postal del centro. Es lo que de verdad necesita quien recibe el
-- recordatorio: "en Bellamar" no lleva a nadie a ningun sitio.
alter table centros
  add column if not exists direccion text;

-- Marca de recordatorio enviado. Sin ella, con el motor corriendo cada quince
-- minutos, la misma cita recibiria un recordatorio en cada pasada.
alter table citas
  add column if not exists recordatorio_enviado_at timestamptz;

create index if not exists idx_citas_sin_recordatorio
  on citas (inicio)
  where recordatorio_enviado_at is null and estado = 'programada';

insert into configuracion (clave, valor, descripcion) values
  (
    'recordatorios_automaticos',
    'false',
    'Envia el recordatorio de cita por email 24 h antes, al contacto con quien se agendo. Requiere proveedor de correo configurado.'
  ),
  (
    'reparto_automatico',
    'false',
    'Reparte los leads sin propietario entre los comerciales disponibles del centro, al que menos carga tenga. Apagado por defecto: mientras el equipo se rueda, la autoasignacion manual funciona mejor.'
  )
on conflict (clave) do nothing;
