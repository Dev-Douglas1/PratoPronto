
create extension if not exists pgcrypto;

alter table public.products
  add column if not exists restaurant_id uuid references public.restaurantes(id) on delete cascade,
  add column if not exists personalizable boolean not null default false,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.products
set restaurant_id = r.id,
    personalizable = (category = 'Pizzas'),
    metadata = case when category = 'Pizzas' then jsonb_build_object(
      'sizes', jsonb_build_array(
        jsonb_build_object('id','pequena','name','Pequena','adjust_cents',-1200),
        jsonb_build_object('id','media','name','Média','adjust_cents',-600),
        jsonb_build_object('id','grande','name','Grande','adjust_cents',0)
      ),
      'crusts', jsonb_build_array(
        jsonb_build_object('id','tradicional','name','Tradicional','adjust_cents',0),
        jsonb_build_object('id','catupiry','name','Catupiry','adjust_cents',700),
        jsonb_build_object('id','cheddar','name','Cheddar','adjust_cents',700)
      ),
      'extras', jsonb_build_array(
        jsonb_build_object('id','bacon','name','Bacon','adjust_cents',500),
        jsonb_build_object('id','cebola','name','Cebola','adjust_cents',200),
        jsonb_build_object('id','azeitona','name','Azeitona','adjust_cents',300)
      )
    ) else '{}'::jsonb end
from public.restaurantes r
where r.slug='pratopronto'
  and public.products.restaurant_id is null;

alter table public.products alter column restaurant_id set not null;

create index if not exists products_restaurant_active_idx
  on public.products(restaurant_id, active, category);

alter table public.orders
  add column if not exists restaurant_id uuid references public.restaurantes(id) on delete restrict,
  add column if not exists assigned_pilot_id uuid references public.pilot_profiles(profile_id) on delete set null,
  add column if not exists delivery_status text not null default 'unassigned',
  add column if not exists delivery_offer_id uuid,
  add column if not exists delivery_code_required boolean not null default true;

do $$
begin
  if not exists(select 1 from pg_constraint where conname='orders_delivery_status_check') then
    alter table public.orders add constraint orders_delivery_status_check
    check (delivery_status in ('unassigned','offered','accepted','picked_up','delivered'));
  end if;
end $$;

create index if not exists orders_restaurant_status_idx on public.orders(restaurant_id,status,created_at desc);
create index if not exists orders_user_created_idx on public.orders(user_id,created_at desc);
create index if not exists orders_pilot_status_idx on public.orders(assigned_pilot_id,delivery_status,created_at desc);

create table if not exists public.order_secrets (
  order_id uuid primary key references public.orders(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  delivery_code text not null check (delivery_code ~ '^[0-9]{4}$'),
  delivery_code_hash text not null,
  created_at timestamptz not null default now()
);
alter table public.order_secrets enable row level security;

alter table public.reviews
  add column if not exists restaurant_id uuid references public.restaurantes(id) on delete cascade;
alter table public.refund_requests
  add column if not exists restaurant_id uuid references public.restaurantes(id) on delete cascade;

create index if not exists reviews_restaurant_idx on public.reviews(restaurant_id,created_at desc);
create index if not exists refunds_restaurant_idx on public.refund_requests(restaurant_id,status,created_at desc);
