
create extension if not exists pgcrypto;

alter table public.products
  add column if not exists restaurant_id uuid references public.restaurantes(id) on delete cascade,
  add column if not exists config jsonb not null default '{}'::jsonb;

update public.products
set restaurant_id=(select id from public.restaurantes where slug='pratopronto' limit 1)
where restaurant_id is null;

alter table public.products alter column restaurant_id set not null;
alter table public.products drop constraint if exists products_slug_key;
create unique index if not exists products_restaurant_slug_unique on public.products(restaurant_id,slug) where slug is not null;
create index if not exists products_restaurant_active_idx on public.products(restaurant_id,active,category);

update public.products
set category=case when slug in ('coca-cola','guarana','fanta','sprite','monster','red-bull') then 'Bebidas' else 'Pizzas' end,
    config=case when slug in ('coca-cola','guarana','fanta','sprite','monster','red-bull')
      then '{"personalizavel":false}'::jsonb
      else '{"personalizavel":true,"sizes":{"pequena":-1200,"media":-600,"grande":0},"crusts":{"tradicional":0,"catupiry":700,"cheddar":700},"extras":{"bacon":500,"cebola":200,"azeitona":300}}'::jsonb end
where restaurant_id=(select id from public.restaurantes where slug='pratopronto' limit 1);

alter table public.orders
  add column if not exists restaurant_id uuid references public.restaurantes(id) on delete restrict,
  add column if not exists assigned_pilot_id uuid references public.pilot_profiles(profile_id) on delete set null,
  add column if not exists delivery_status text not null default 'unassigned',
  add column if not exists delivery_verification_required boolean not null default true;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='orders_delivery_status_check') then
    alter table public.orders add constraint orders_delivery_status_check
      check(delivery_status in ('unassigned','offered','accepted','picked_up','delivered'));
  end if;
end $$;

create unique index if not exists orders_request_id_unique on public.orders(request_id) where request_id is not null;
create index if not exists orders_restaurant_created_idx on public.orders(restaurant_id,created_at desc);
create index if not exists orders_user_created_idx on public.orders(user_id,created_at desc);
create index if not exists orders_pilot_idx on public.orders(assigned_pilot_id,delivery_status,created_at desc);

alter table public.quotes add column if not exists restaurant_id uuid references public.restaurantes(id) on delete cascade;
create index if not exists quotes_user_expires_idx on public.quotes(user_id,expires_at);

alter table public.reviews add column if not exists restaurant_id uuid references public.restaurantes(id) on delete cascade;
alter table public.refund_requests add column if not exists restaurant_id uuid references public.restaurantes(id) on delete cascade;

create table if not exists public.delivery_secrets(
  order_id uuid primary key references public.orders(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  code text not null check(code ~ '^[0-9]{4}$'),
  code_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.order_delivery_offers(
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  restaurant_id uuid not null references public.restaurantes(id) on delete cascade,
  pilot_profile_id uuid references public.pilot_profiles(profile_id) on delete cascade,
  pilot_contact_id uuid references public.restaurant_pilot_contacts(id) on delete set null,
  status text not null default 'pending' check(status in ('pending','accepted','rejected','cancelled','expired')),
  offered_by uuid not null references public.profiles(id) on delete restrict,
  message text not null default '',
  offered_at timestamptz not null default now(),
  expires_at timestamptz,
  responded_at timestamptz,
  check(pilot_profile_id is not null or pilot_contact_id is not null),
  check(char_length(message)<=500)
);
create index if not exists order_delivery_offers_pilot_idx on public.order_delivery_offers(pilot_profile_id,status,offered_at desc);
create index if not exists order_delivery_offers_restaurant_idx on public.order_delivery_offers(restaurant_id,status,offered_at desc);
create index if not exists order_delivery_offers_order_idx on public.order_delivery_offers(order_id,status);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path=public as $$
begin new.updated_at=now(); return new; end $$;

create or replace function private.restaurant_id_from_slug(p_slug text)
returns uuid language sql stable security definer set search_path='' as $$
  select r.id from public.restaurantes r where r.slug=lower(trim(p_slug)) limit 1
$$;

create or replace function private.restaurant_role(p_restaurant_id uuid,p_user_id uuid default auth.uid())
returns text language sql stable security definer set search_path='' as $$
  select rm.role from public.restaurant_members rm
  where rm.restaurante_id=p_restaurant_id and rm.profile_id=p_user_id and rm.active=true limit 1
$$;

create or replace function private.restaurant_member(p_restaurant_id uuid,p_roles text[] default null,p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path='' as $$
  select private.verified(p_user_id) and exists(
    select 1 from public.restaurant_members rm
    where rm.restaurante_id=p_restaurant_id and rm.profile_id=p_user_id and rm.active=true
      and (p_roles is null or rm.role=any(p_roles))
  )
$$;

create or replace function private.normalize_search(p_value text)
returns text language sql immutable set search_path='' as $$
  select lower(trim(translate(coalesce(p_value,''),'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç','AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc')))
$$;
