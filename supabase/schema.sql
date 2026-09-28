-- ============================================================================
--  Despensa · esquema de base de datos (PostgreSQL / Supabase)
--  Ejecuta este archivo completo en:  Supabase → SQL Editor → New query → Run
--  Es idempotente: puedes volver a ejecutarlo sin romper nada.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tablas
-- ---------------------------------------------------------------------------

-- Un hogar por cuenta. Guarda también las preferencias compartidas.
create table if not exists public.households (
  id                   uuid primary key default gen_random_uuid(),
  owner_id             uuid not null references auth.users (id) on delete cascade,
  name                 text not null default 'Mi hogar',
  expiry_warning_days  integer not null default 7 check (expiry_warning_days between 1 and 90),
  currency_symbol      text not null default '$',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (owner_id)
);

-- Categorías del hogar (alimentos, medicina, aseo…). Editables por el usuario.
create table if not exists public.categories (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households (id) on delete cascade,
  name           text not null,
  icon           text not null default 'tag',
  color          text not null default '#6C7684',
  tracks_expiry  boolean not null default false,  -- si sus productos suelen vencer
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Comercios donde se compra cada producto.
create table if not exists public.stores (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  name          text not null,
  notes         text not null default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Productos del hogar. `in_stock` responde la única pregunta importante: ¿hay o no hay?
create table if not exists public.products (
  id                 uuid primary key default gen_random_uuid(),
  household_id       uuid not null references public.households (id) on delete cascade,
  name               text not null,
  category_id        uuid references public.categories (id) on delete set null,
  store_id           uuid references public.stores (id) on delete set null,
  unit               text not null default '',          -- presentación: «1 litro», «bolsa de 5 lb»
  in_stock           boolean not null default true,
  tracks_expiry      boolean not null default false,    -- false = «no aplica» (aseo, utensilios…)
  expires_on         date,                              -- null = sin fecha registrada
  reference_price    numeric(10,2),
  notes              text not null default '',
  photo_path         text,                              -- ruta dentro del bucket de fotos
  purchased_on       date,                              -- cuándo entró a casa la existencia actual
  status_changed_at  timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Para instalaciones anteriores a la función «cuánto dura»
alter table public.products add column if not exists purchased_on date;

-- Historial: un renglón por cada vez que un producto se acabó.
-- Lo escribe sola la base de datos (ver disparadores), así que da igual qué
-- teléfono marque «ya no hay»: el ciclo queda registrado.
create table if not exists public.product_cycles (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  product_id    uuid not null references public.products (id) on delete cascade,
  started_on    date not null,                          -- fecha de compra
  ended_on      date not null,                          -- día en que se marcó «no hay»
  days          integer generated always as (ended_on - started_on) stored,
  created_at    timestamptz not null default now(),
  constraint product_cycles_orden check (ended_on >= started_on)
);

-- ---------------------------------------------------------------------------
-- 2. Índices
-- ---------------------------------------------------------------------------
create index if not exists products_household_idx     on public.products (household_id);
create index if not exists products_stock_idx         on public.products (household_id, in_stock);
create index if not exists products_expiry_idx        on public.products (household_id, expires_on) where expires_on is not null;
create index if not exists products_name_idx          on public.products (household_id, lower(name));
create index if not exists categories_household_idx   on public.categories (household_id, sort_order);
create index if not exists stores_household_idx       on public.stores (household_id);
create index if not exists cycles_product_idx         on public.product_cycles (product_id, ended_on desc);
create index if not exists cycles_household_idx       on public.product_cycles (household_id);

-- Evita productos repetidos con el mismo nombre dentro de un hogar
create unique index if not exists products_unique_name_idx
  on public.products (household_id, lower(trim(name)));

-- ---------------------------------------------------------------------------
-- 3. updated_at automático
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['households', 'categories', 'stores', 'products'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I
         for each row execute function public.touch_updated_at()', t);
  end loop;
end;
$$;

-- Si cambia la existencia del producto, se guarda cuándo ocurrió.
--
-- `purchased_on` significa «cuándo entró a casa la existencia actual», así que
-- se borra al acabarse y se pone sola al reponer. La regla es «solo si viene
-- vacía», y eso es justo lo que permite deshacer: al deshacer, la app manda la
-- fecha original y el disparador la respeta en lugar de pisarla con la de hoy.
-- (El disparador AFTER sigue viendo old.purchased_on intacta, que es la que
-- necesita para cerrar el ciclo.)
create or replace function public.touch_status_changed_at()
returns trigger
language plpgsql
as $$
begin
  if new.in_stock is distinct from old.in_stock then
    new.status_changed_at := now();
    if new.in_stock then
      if new.purchased_on is null then
        new.purchased_on := current_date;
      end if;
    else
      new.purchased_on := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists set_status_changed_at on public.products;
create trigger set_status_changed_at before update on public.products
  for each row execute function public.touch_status_changed_at();

-- Cuando un producto pasa de «hay» a «no hay», se cierra el ciclo y queda
-- guardado cuánto duró. Es la materia prima del promedio.
create or replace function public.close_product_cycle()
returns trigger
language plpgsql
as $$
begin
  if old.in_stock and not new.in_stock
     and old.purchased_on is not null
     and current_date >= old.purchased_on then
    insert into public.product_cycles (household_id, product_id, started_on, ended_on)
    values (new.household_id, new.id, old.purchased_on, current_date);
  end if;
  return null;
end;
$$;

drop trigger if exists record_product_cycle on public.products;
create trigger record_product_cycle after update on public.products
  for each row execute function public.close_product_cycle();

-- Promedio de duración por producto.
--
-- El filtro por auth.uid() NO es decorativo: una vista normal se ejecuta con
-- los permisos de su dueño (postgres), que se salta el RLS de product_cycles.
-- Sin ese where, cualquier cuenta vería los promedios de todos los hogares.
create or replace view public.product_duration_stats as
select
  product_id,
  household_id,
  count(*)::int                as cycles,
  round(avg(days))::int        as avg_days,
  min(days)::int               as min_days,
  max(days)::int               as max_days,
  max(ended_on)                as last_ended_on
from public.product_cycles
where household_id in (select id from public.households where owner_id = auth.uid())
group by product_id, household_id;

-- security_invoker existe desde PostgreSQL 15. Donde esté, se añade como
-- segunda barrera; donde no, la vista ya se protege con el filtro de arriba.
do $$
begin
  execute 'alter view public.product_duration_stats set (security_invoker = on)';
exception when others then
  raise notice 'security_invoker no disponible en esta versión; la vista se protege con auth.uid()';
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Hogar y categorías iniciales al crear la cuenta
-- ---------------------------------------------------------------------------
create or replace function public.create_household_for_user(user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_household uuid;
begin
  select id into new_household from public.households where owner_id = user_id;
  if new_household is not null then
    return new_household;
  end if;

  insert into public.households (owner_id) values (user_id) returning id into new_household;

  insert into public.categories (household_id, name, icon, color, tracks_expiry, sort_order) values
    (new_household, 'Alimentos',      'jar',      '#2F7D5B', true,  1),
    (new_household, 'Bebidas',        'drop',     '#2A7EA8', true,  2),
    (new_household, 'Medicina',       'shield',   '#C2557F', true,  3),
    (new_household, 'Aseo del hogar', 'sparkles', '#7A6BC4', false, 4),
    (new_household, 'Aseo personal',  'drop',     '#3E8E7E', false, 5),
    (new_household, 'Mascotas',       'star',     '#B4762A', true,  6),
    (new_household, 'Bebé',           'heart',    '#D2789B', true,  7),
    (new_household, 'Cocina y hogar', 'scale',    '#C0602F', false, 8),
    (new_household, 'Otros',          'tag',      '#6C7684', false, 9);

  return new_household;
end;
$$;

-- Cada cuenta nueva arranca con su hogar y sus categorías listas
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.create_household_for_user(new.id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- La app puede llamarla si la cuenta se creó antes de instalar este esquema
grant execute on function public.create_household_for_user(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Seguridad a nivel de fila (RLS)
--    Cada cuenta solo ve y modifica la información de su propio hogar.
-- ---------------------------------------------------------------------------
alter table public.households enable row level security;
alter table public.categories enable row level security;
alter table public.stores     enable row level security;
alter table public.products   enable row level security;
alter table public.product_cycles enable row level security;

drop policy if exists "hogar propio" on public.households;
create policy "hogar propio" on public.households
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

do $$
declare
  t text;
begin
  foreach t in array array['categories', 'stores', 'products', 'product_cycles'] loop
    execute format('drop policy if exists "solo mi hogar" on public.%I', t);
    execute format($p$
      create policy "solo mi hogar" on public.%I
        for all to authenticated
        using (household_id in (select id from public.households where owner_id = auth.uid()))
        with check (household_id in (select id from public.households where owner_id = auth.uid()))
    $p$, t);
  end loop;
end;
$$;

-- Permisos de las tablas para las sesiones iniciadas (Supabase ya los concede
-- por defecto; se repiten aquí para que el script funcione en cualquier proyecto).
grant usage on schema public to authenticated;
grant select, insert, update, delete
  on public.households, public.categories, public.stores, public.products,
     public.product_cycles
  to authenticated;
grant select on public.product_duration_stats to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Almacenamiento de fotografías
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-photos', 'product-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "fotos: lectura publica"    on storage.objects;
drop policy if exists "fotos: subir autenticado"  on storage.objects;
drop policy if exists "fotos: editar autenticado" on storage.objects;
drop policy if exists "fotos: borrar autenticado" on storage.objects;

create policy "fotos: lectura publica" on storage.objects
  for select using (bucket_id = 'product-photos');

create policy "fotos: subir autenticado" on storage.objects
  for insert to authenticated with check (bucket_id = 'product-photos');

create policy "fotos: editar autenticado" on storage.objects
  for update to authenticated using (bucket_id = 'product-photos');

create policy "fotos: borrar autenticado" on storage.objects
  for delete to authenticated using (bucket_id = 'product-photos');

-- ============================================================================
--  Listo. Crea la cuenta del hogar desde la app (o en Authentication → Users)
--  y empieza a registrar productos.
-- ============================================================================
