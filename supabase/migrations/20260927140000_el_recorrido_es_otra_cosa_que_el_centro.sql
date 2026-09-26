-- ============================================================================
-- EL RECORRIDO ES OTRA COSA QUE EL CENTRO
-- ============================================================================
--
-- El directorio mezclaba dos preguntas distintas en una sola columna: PARA QUE
-- consulta esta persona, y POR DONDE llego. Si tenia centro se veia el centro,
-- y si no, el origen. Nunca las dos, y son independientes: alguien puede pedir
-- hora en Bellamar por una landing, o preguntar por el Metodo HOME desde
-- Instagram.
--
-- El origen ya vive en `contactos.origen`. Falta el otro eje.
--
-- POR QUE UN CATALOGO Y NO UNA LISTA EN EL CODIGO. Metodo HOME es un programa
-- que ha salido este año; mañana habra otro. Un recorrido nuevo tiene que
-- poder crearse desde administracion sin desplegar (regla 13).
--
-- POR QUE NO DUPLICA A LOS CENTROS. Horizonte, Eclipse y Bellamar siguen
-- siendo centros: son el eje de los permisos y de la atribucion, y meterlos
-- tambien aqui seria tener la misma verdad en dos sitios, que es como empiezan
-- las incoherencias. El recorrido es para lo que NO es un centro —HOME, el
-- tratamiento online— y para decir «todavia no se sabe».
-- ============================================================================

create table recorridos (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  nombre text not null,
  -- Para ordenar la lista en la pantalla sin depender del alfabeto.
  orden smallint not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

insert into recorridos (slug, nombre, orden) values
  ('metodo-home', 'Método HOME', 1),
  ('online', 'Tratamiento online', 2),
  ('sin-aclarar', 'Sin aclarar', 9)
on conflict (slug) do nothing;

alter table contactos
  add column if not exists recorrido_id uuid references recorridos (id) on delete set null;

create index if not exists idx_contactos_recorrido on contactos (recorrido_id)
  where recorrido_id is not null;

comment on column contactos.recorrido_id is
  'Para qué consulta esta persona, cuando no es un centro: Método HOME, tratamiento online, o sin aclarar. Independiente del centro y del origen.';

/*
 * Las personas que ya estan en HighLevel son de Metodo HOME. No es una
 * deduccion nuestra: es la regla de negocio —a HighLevel va lo de HOME y los
 * centros no entran ahi—, asi que se aplica tal cual a las que ya estaban.
 */
update contactos
set recorrido_id = (select id from recorridos where slug = 'metodo-home')
where origen = 'highlevel' and recorrido_id is null;

-- ----------------------------------------------------------------------------
-- Quien lo ve y quien lo toca
-- ----------------------------------------------------------------------------
-- Leer, cualquiera que entre: es un catalogo, como los canales o las
-- modalidades, y sin poder leerlo no se puede pintar una ficha. Gestionarlo,
-- solo direccion.
alter table recorridos enable row level security;

create policy recorridos_leer on recorridos for select to authenticated using (true);
create policy recorridos_gestionar on recorridos for all to authenticated
  using (es_direccion()) with check (es_direccion());
