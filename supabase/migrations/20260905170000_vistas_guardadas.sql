-- ============================================================================
-- VISTAS GUARDADAS
--
-- Cada comercial acaba mirando siempre lo mismo: «mis casos urgentes de
-- Bellamar», «lo que entro esta semana por Instagram». Hoy eso son cinco
-- desplegables que hay que volver a poner cada manana, y lo que cuesta cinco
-- clics se deja de usar.
--
-- Una vista es una combinacion de filtros con nombre. No es una consulta
-- guardada: los filtros se aplican sobre las mismas consultas de siempre, asi
-- que RLS sigue decidiendo que filas salen. Guardar una vista NO guarda datos,
-- guarda una forma de mirarlos — la diferencia importa, porque si la comparte
-- alguien que ve mas centros, quien la abra seguira viendo solo los suyos.
-- ============================================================================

create type pantalla_vista as enum ('kanban', 'contactos', 'tabla_casos');

create table vistas_guardadas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references perfiles (id) on delete cascade,
  pantalla pantalla_vista not null,
  nombre text not null check (length(trim(nombre)) between 1 and 60),

  -- Los filtros tal cual viajan en la URL: {"centro":"...","urgencia":"alta"}.
  filtros jsonb not null default '{}'::jsonb,
  -- Columna y sentido de ordenacion: {"campo":"created_at","sentido":"desc"}.
  orden jsonb not null default '{}'::jsonb,
  -- Columnas visibles y su orden, solo en la vista de tabla. Null = las de serie.
  columnas jsonb,

  es_favorita boolean not null default false,
  -- Para recordar por donde se andaba: se abre la ultima usada de cada pantalla.
  usada_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  -- Dos vistas con el mismo nombre en la misma pantalla solo confunden.
  unique (usuario_id, pantalla, nombre)
);

comment on table vistas_guardadas is
  'Combinaciones de filtros con nombre, privadas de cada persona. No guardan datos: guardan como mirarlos, y RLS sigue decidiendo que se ve.';

create index idx_vistas_usuario on vistas_guardadas (usuario_id, pantalla, usada_at desc);

-- ----------------------------------------------------------------------------
-- RLS: cada uno las suyas y nada mas.
--
-- Ni siquiera direccion ve las vistas de los demas. No es informacion sensible,
-- pero es espacio de trabajo personal: que el jefe vea como se organiza cada
-- cual no aporta nada y sienta mal.
-- ----------------------------------------------------------------------------
alter table vistas_guardadas enable row level security;

create policy vistas_propias on vistas_guardadas for all to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

revoke all on vistas_guardadas from anon;
grant select, insert, update, delete on vistas_guardadas to authenticated;
