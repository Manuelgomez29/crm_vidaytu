-- ============================================================================
-- INFORMES MENSUALES GUARDADOS
--
-- Hasta ahora el informe era una pantalla imprimible y un correo con el enlace.
-- Funciona, pero exige tener sesion: direccion no podia reenviarlo al asesor,
-- ni archivarlo, ni mirarlo desde un movil sin entrar.
--
-- Ahora se genera un PDF, se guarda en un bucket privado y se adjunta al correo.
-- El enlace sigue existiendo; lo que se anade es un fichero.
--
-- Los NUMEROS no se duplican: siguen saliendo de `informe-mensual.ts`, que ya
-- alimentaba la pantalla y el correo. Lo unico que vive dos veces es la
-- maquetacion.
-- ============================================================================

create table informes_mensuales (
  id uuid primary key default gen_random_uuid(),
  -- Primer dia del mes que resume. Uno por mes, se regenera encima.
  mes date not null unique,
  ruta_fichero text not null,
  -- Cifras de portada, para poder listar sin abrir el PDF.
  resumen jsonb not null default '{}'::jsonb,
  generado_at timestamptz not null default now(),
  generado_por uuid references perfiles (id) on delete set null,
  enviado_at timestamptz
);

comment on table informes_mensuales is
  'Un PDF por mes, en el bucket privado. `enviado_at` marca que salio por correo a direccion.';

create index idx_informes_mes on informes_mensuales (mes desc);

-- ----------------------------------------------------------------------------
-- RLS: solo direccion.
--
-- El informe consolida ingresos, conversiones y rendimiento por comercial de
-- todo el grupo. Un comercial no tiene por que ver los numeros de sus
-- companeros, y la regla 11 ya reserva las exportaciones a direccion.
-- ----------------------------------------------------------------------------
alter table informes_mensuales enable row level security;

create policy informes_direccion on informes_mensuales for all to authenticated
  using (es_direccion()) with check (es_direccion());

revoke all on informes_mensuales from anon;
grant select, insert, update, delete on informes_mensuales to authenticated;

-- ----------------------------------------------------------------------------
-- Bucket privado. Como los demas: nada publico, y con tope de tamano y tipo.
-- Un informe de un grupo de tres centros no llega a un mega; el tope esta para
-- que un fallo no llene el almacenamiento, no porque se espere que crezca.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('informes', 'informes', false, 10485760, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Solo direccion toca este bucket. Se sirve siempre con URL firmada.
create policy informes_leer on storage.objects for select to authenticated
  using (bucket_id = 'informes' and es_direccion());

create policy informes_escribir on storage.objects for insert to authenticated
  with check (bucket_id = 'informes' and es_direccion());

create policy informes_actualizar on storage.objects for update to authenticated
  using (bucket_id = 'informes' and es_direccion());
