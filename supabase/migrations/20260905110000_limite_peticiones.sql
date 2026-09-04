-- ============================================================================
-- LIMITE DE PETICIONES
--
-- Faltaba en todas partes: login, webhooks, enlace de baja, alta de
-- dispositivos y consultas a la IA. Los tokens son de 24 bytes aleatorios, asi
-- que enumerarlos es inviable, pero nada impedia machacar el login o inundar
-- la ingesta de formularios.
--
-- Se hace en la base de datos, no en memoria del proceso: en un despliegue sin
-- servidor cada peticion puede caer en una instancia distinta, y un contador
-- en memoria se reinicia solo y no ve lo que hacen las demas.
--
-- LO LLAMA SOLO EL SERVIDOR. La funcion esta revocada a anon y authenticated:
-- si un anonimo pudiera invocarla con la clave que quisiera, podria agotar de
-- antemano la cuota de login de una persona concreta y dejarla fuera.
-- ============================================================================

create table if not exists limite_peticiones (
  clave text not null,
  ventana timestamptz not null,
  contador integer not null default 0,
  primary key (clave, ventana)
);

comment on table limite_peticiones is
  'Contadores por ventana de tiempo. Los escribe solo la service role a traves de consumir_intento().';

create index if not exists idx_limite_ventana on limite_peticiones (ventana);

alter table limite_peticiones enable row level security;
-- Sin ninguna politica: nadie con sesion normal lo lee ni lo escribe. La
-- service role salta RLS y es la unica que pasa por aqui.

revoke all on limite_peticiones from anon, authenticated;

-- ----------------------------------------------------------------------------
-- consumir_intento(clave, maximo, ventana_segundos)
--
-- Suma uno al contador de la ventana actual y dice si el intento cabe dentro
-- del limite. Es una sola sentencia atomica: dos peticiones simultaneas no
-- pueden colarse ambas por el hueco del ultimo intento.
--
-- La ventana es fija, no deslizante. Una deslizante seria mas justa, pero
-- exige guardar cada intento con su instante; con esto basta para lo que hace
-- falta —frenar el abuso— y cuesta una fila por clave y ventana.
-- ----------------------------------------------------------------------------
create or replace function consumir_intento(
  p_clave text,
  p_maximo integer,
  p_ventana_segundos integer
)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_ventana timestamptz;
  v_contador integer;
begin
  -- Inicio de la ventana actual, redondeado hacia abajo.
  v_ventana := to_timestamp(
    floor(extract(epoch from now()) / p_ventana_segundos) * p_ventana_segundos
  );

  insert into limite_peticiones (clave, ventana, contador)
  values (p_clave, v_ventana, 1)
  on conflict (clave, ventana)
    do update set contador = limite_peticiones.contador + 1
  returning contador into v_contador;

  return v_contador <= p_maximo;
end;
$$;

revoke execute on function consumir_intento(text, integer, integer) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Limpieza. Sin esto la tabla crece para siempre con ventanas ya pasadas.
-- La llama el motor periodico una vez al dia.
-- ----------------------------------------------------------------------------
create or replace function limpiar_limites()
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_borradas integer;
begin
  delete from limite_peticiones where ventana < now() - interval '2 days';
  get diagnostics v_borradas = row_count;
  return v_borradas;
end;
$$;

revoke execute on function limpiar_limites() from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- Los limites, configurables como todo lo demas (regla 13).
--
-- Numeros pensados para no estorbar a nadie que trabaje normal: un comercial
-- no se equivoca de contrasena diez veces en un cuarto de hora, y un
-- formulario de la web no envia sesenta altas por minuto.
-- ----------------------------------------------------------------------------
insert into configuracion (clave, valor, descripcion) values
  (
    'limites_peticiones',
    '{"login_por_cuenta":{"maximo":10,"ventana":900},"login_por_ip":{"maximo":30,"ventana":900},"formularios":{"maximo":60,"ventana":60},"whatsapp":{"maximo":300,"ventana":60},"cron":{"maximo":20,"ventana":60},"baja":{"maximo":30,"ventana":3600},"push":{"maximo":20,"ventana":3600},"ia":{"maximo":40,"ventana":3600}}',
    'Limite de peticiones por ventana. maximo = intentos permitidos, ventana = segundos. Bajarlos aprieta; subirlos afloja.'
  )
on conflict (clave) do nothing;
