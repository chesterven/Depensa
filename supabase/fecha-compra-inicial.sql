-- ============================================================================
--  Despensa · fecha de compra inicial (script de una sola vez)
--
--  Pone el 25 de septiembre de 2026 como fecha de compra a TODO lo que está
--  disponible («hay en casa»), para que el cálculo de «cuánto dura» arranque
--  desde ahí en lugar de esperar a la próxima compra de cada producto.
--
--  Cómo usarlo:  Supabase → SQL Editor → New query → pegar → Run.
--  Ejecuta primero el PASO 1 solo, revisa la lista, y luego el PASO 2.
--
--  Requisito: haber ejecutado antes supabase/schema.sql (el que crea la
--  columna purchased_on). Si no, el script falla con «column does not exist».
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PASO 1 · Ver qué se va a cambiar (no modifica nada)
-- ---------------------------------------------------------------------------
select
  p.name                                as producto,
  p.in_stock                            as hay_en_casa,
  p.purchased_on                        as fecha_actual,
  case
    when not p.in_stock              then 'se omite (no hay en casa)'
    when p.purchased_on is not null  then 'se REEMPLAZA la fecha que ya tenía'
    else                                  'se pone la fecha nueva'
  end                                   as que_le_pasa
from public.products p
order by p.in_stock desc, p.name;


-- ---------------------------------------------------------------------------
-- PASO 2 · Aplicar el cambio
--
--  Está envuelto en una transacción con verificación al final. Si el número
--  de filas no te cuadra, cambia COMMIT por ROLLBACK y no queda nada hecho.
--
--  Solo toca los productos disponibles: `purchased_on` significa «cuándo entró
--  a casa la existencia actual», así que en algo que NO hay no tendría sentido
--  (y el disparador lo volvería a borrar en cuanto lo marcaras como comprado).
-- ---------------------------------------------------------------------------
begin;

update public.products
   set purchased_on = date '2026-09-25'
 where in_stock = true;

-- Cuántos quedaron con la fecha, cuántos se omitieron por no haber en casa
select
  count(*) filter (where in_stock and purchased_on = date '2026-09-25') as con_fecha_nueva,
  count(*) filter (where in_stock and purchased_on is distinct from date '2026-09-25') as disponibles_sin_cambiar,
  count(*) filter (where not in_stock)                                  as omitidos_no_hay,
  count(*)                                                              as total
from public.products;

commit;
-- rollback;   ← usa esta línea en lugar de commit si algo no cuadra


-- ---------------------------------------------------------------------------
-- PASO 3 · Comprobar el resultado
-- ---------------------------------------------------------------------------
select
  p.name          as producto,
  p.in_stock      as hay_en_casa,
  p.purchased_on  as fecha_de_compra,
  case when p.purchased_on is null then null
       else current_date - p.purchased_on
  end             as dias_en_casa
from public.products p
order by p.in_stock desc, p.name;


-- ============================================================================
--  VARIANTE · rellenar solo lo que está vacío
--
--  Si vuelves a necesitar esto más adelante y NO quieres pisar las fechas que
--  ya se hayan registrado, usa este update en lugar del del PASO 2:
--
--    update public.products
--       set purchased_on = date '2026-09-25'
--     where in_stock = true
--       and purchased_on is null;
--
--  NOTAS
--  · No dispara ningún ciclo: los disparadores de historial solo actúan cuando
--    cambia `in_stock`, y aquí no se toca.
--  · Sí actualiza `updated_at` de esas filas (lo hace el disparador general).
--    No afecta a nada de lo que muestra la aplicación.
--  · En el SQL Editor se ejecuta como `postgres`, que se salta el RLS: si
--    algún día hubiera más de un hogar, esto los tocaría todos. Para limitarlo
--    a uno, añade al where:
--      and household_id = (select id from public.households
--                           where owner_id = '<uuid-de-la-cuenta>')
--
--  · OJO al comprobar desde el SQL Editor: la vista product_duration_stats
--    saldrá VACÍA ahí. No está rota — filtra por auth.uid(), y en el editor
--    eres `postgres`, sin sesión de hogar. Los promedios se ven desde la app.
--    Para mirarlos aquí, consulta la tabla product_cycles directamente:
--      select p.name, c.started_on, c.ended_on, c.days
--        from public.product_cycles c
--        join public.products p on p.id = c.product_id
--       order by c.ended_on desc;
-- ============================================================================
