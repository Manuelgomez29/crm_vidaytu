-- ============================================================================
-- Fecha de cierre de un caso.
--
-- La retencion contaba desde `updated_at`, y eso esta mal: `updated_at` lo
-- pisa el trigger en CADA update. Un caso cerrado hace catorce meses en el
-- que alguien corrige una falta de ortografia vuelve a empezar el reloj desde
-- cero, y nunca llega a anonimizarse. Al reves tambien falla: un caso que se
-- cerro ayer pero cuya fila lleva meses sin tocarse no existe, pero la logica
-- no distinguia un caso del otro.
--
-- `cerrado_at` marca cuando el caso paso a perdido o no valido, y solo cambia
-- cuando cambia el estado. Al reabrirse vuelve a null, que es lo correcto: un
-- caso reabierto no esta cerrado y su reloj no corre.
-- ============================================================================

alter table leads
  add column if not exists cerrado_at timestamptz;

comment on column leads.cerrado_at is
  'Cuando el caso paso a perdido o no valido. Es el reloj de la retencion RGPD: no se toca al editar la fila.';

-- ----------------------------------------------------------------------------
-- Trigger
-- ----------------------------------------------------------------------------
create or replace function fn_marcar_cierre()
returns trigger
language plpgsql
as $$
begin
  -- Entra en un estado cerrado y todavia no tiene fecha: se marca ahora.
  if new.estado in ('perdido', 'no_valido')
     and (old.estado is distinct from new.estado)
     and new.cerrado_at is null then
    new.cerrado_at := now();

  -- Sale de un estado cerrado: el reloj se para y se borra.
  elsif new.estado not in ('perdido', 'no_valido')
        and old.estado in ('perdido', 'no_valido') then
    new.cerrado_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_leads_cierre on leads;
create trigger trg_leads_cierre
  before update on leads
  for each row execute function fn_marcar_cierre();

-- ----------------------------------------------------------------------------
-- Relleno de lo que ya existe.
--
-- Para los casos ya cerrados no hay forma de saber cuando se cerraron: lo mas
-- cercano es su ultima modificacion. Se usa esa, que es la estimacion mas
-- conservadora disponible, y a partir de aqui el dato es exacto.
-- ----------------------------------------------------------------------------
update leads
   set cerrado_at = updated_at
 where estado in ('perdido', 'no_valido')
   and cerrado_at is null;

create index if not exists idx_leads_cerrado_at on leads (cerrado_at)
  where cerrado_at is not null;
