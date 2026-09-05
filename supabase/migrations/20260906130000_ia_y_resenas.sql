-- ============================================================================
-- CACHE DEL RESUMEN, RESENA POR CENTRO Y CANDADO POR PERSONA
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Cache de los resumenes de IA
--
-- Hasta ahora el resumen se pedia bajo demanda y se tiraba: volver a abrir la
-- misma ficha volvia a llamar al modelo. Con cache se puede generar al abrir,
-- que es lo util —quien retoma un caso ajeno lo quiere ya hecho— sin pagar una
-- llamada por cada vistazo.
--
-- `hash_actividad` es lo que decide si sigue valiendo: mientras no pase nada
-- nuevo en el caso, el resumen de ayer describe el caso de hoy.
-- ----------------------------------------------------------------------------
create table resumenes_ia (
  lead_id uuid primary key references leads (id) on delete cascade,
  resumen text not null,
  -- Huella de la actividad del caso cuando se genero. Si cambia, caduca.
  hash_actividad text not null,
  generado_at timestamptz not null default now(),
  -- Quien lo pidio. El contenido ya salio de lo que ESA persona podia ver.
  generado_por uuid references perfiles (id) on delete set null
);

comment on table resumenes_ia is
  'Ultimo resumen de IA de cada caso. Caduca solo cuando cambia la actividad: mientras no pase nada nuevo, el resumen de ayer describe el caso de hoy.';

comment on column resumenes_ia.hash_actividad is
  'Huella de la actividad del caso al generarlo (numero de anotaciones + la mas reciente). Si no coincide, hay que rehacerlo.';

alter table resumenes_ia enable row level security;

/*
 * El resumen hereda la visibilidad del caso: quien no puede ver el caso no
 * puede leer su resumen. Es importante que sea asi y no «quien lo genero»,
 * porque si no el traspaso de una cartera dejaria resumenes ilegibles para
 * quien recibe los casos.
 */
create policy resumenes_ver on resumenes_ia for select to authenticated
  using (
    exists (
      select 1 from leads l
      where l.id = lead_id
        and (es_direccion() or l.centro_id in (select mis_centros()))
    )
  );

create policy resumenes_escribir on resumenes_ia for all to authenticated
  using (
    exists (
      select 1 from leads l
      where l.id = lead_id
        and (es_direccion() or l.centro_id in (select mis_centros()))
    )
  )
  with check (
    exists (
      select 1 from leads l
      where l.id = lead_id
        and (es_direccion() or l.centro_id in (select mis_centros()))
    )
  );

revoke all on resumenes_ia from anon;
grant select, insert, update, delete on resumenes_ia to authenticated;

-- ----------------------------------------------------------------------------
-- 2. Enlace de resena por centro
--
-- Habia una sola URL global (`configuracion.resena_url`), y no sirve: cada
-- centro tiene su ficha de Google. Una resena de Bellamar en el perfil de
-- Horizonte no ayuda a nadie.
-- ----------------------------------------------------------------------------
alter table centros
  add column if not exists url_resena_google text;

comment on column centros.url_resena_google is
  'Enlace directo para dejar resena en la ficha de Google de ESTE centro. Vacio = no se propone pedir resena para sus casos.';

-- ----------------------------------------------------------------------------
-- 3. Candado por persona, no por conversion
--
-- La marca estaba en `conversiones.resena_propuesta_at`, asi que la misma
-- persona podia recibir dos peticiones si aparecia en dos casos —una madre con
-- dos hijos en tratamiento, por ejemplo—. Pedir dos veces una resena a la misma
-- familia es exactamente la clase de detalle que hace quedar mal a un centro.
-- ----------------------------------------------------------------------------
alter table contactos
  add column if not exists resena_pedida_at timestamptz;

comment on column contactos.resena_pedida_at is
  'Cuando se le pidio resena. A una persona se le pide UNA vez, aunque aparezca en varios casos.';

create index if not exists idx_contactos_resena on contactos (resena_pedida_at)
  where resena_pedida_at is not null;
