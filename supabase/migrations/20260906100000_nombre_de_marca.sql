-- ============================================================================
-- LA MARCA SE ESCRIBE «VIDAITU»
--
-- El nombre del grupo se escribio mal desde el primer dia: «Vida y Tu» en vez
-- de «Vidaitu». Estaba en la interfaz, en la documentacion y tambien en datos
-- que ya viven en la base.
--
-- Se corrige aqui y no editando la migracion inicial: aquella ya se ejecuto en
-- los dos entornos, y cambiarla dejaria el fichero diciendo una cosa distinta
-- de lo que de verdad se aplico. Una migracion aplicada no se reescribe; se
-- corrige con otra.
--
-- Se usa `replace` sobre el nombre en vez de fijar el texto completo porque el
-- proyecto de staging lleva un sufijo « [STAGING]» en sus centros, y la misma
-- migracion tiene que valer en los dos sitios sin borrar esa marca.
-- ============================================================================

update centros
set nombre = replace(nombre, 'Vida y Tu', 'Vidaitu')
where nombre like '%Vida y Tu%';

update pipelines
set nombre = replace(nombre, 'Vida y Tu', 'Vidaitu')
where nombre like '%Vida y Tu%';

-- Textos por defecto de las campanas de marketing.
update configuracion
set valor = to_jsonb(replace(valor #>> '{}', 'Vida y Tu', 'Vidaitu'))
where clave = 'marketing_pie'
  and valor #>> '{}' like '%Vida y Tu%';

comment on column centros.nombre is
  'Nombre del centro tal como se ensena. El grupo es «Vidaitu», sin espacios.';
