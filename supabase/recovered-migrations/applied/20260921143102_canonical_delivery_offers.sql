
alter table public.orders drop constraint if exists orders_delivery_offer_fkey;
alter table public.pedidos drop constraint if exists pedidos_delivery_offer_fkey;
drop table if exists public.delivery_offers cascade;

create table public.delivery_offers (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  restaurant_id uuid not null references public.restaurantes(id) on delete cascade,
  pilot_profile_id uuid references public.pilot_profiles(profile_id) on delete cascade,
  pilot_contact_id uuid references public.restaurant_pilot_contacts(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending','accepted','rejected','cancelled','expired')),
  offered_by uuid not null references public.profiles(id) on delete restrict,
  message text not null default '',
  offered_at timestamptz not null default now(),
  expires_at timestamptz,
  responded_at timestamptz,
  check (pilot_profile_id is not null or pilot_contact_id is not null),
  check (char_length(message) <= 500)
);

alter table public.orders
  add constraint orders_delivery_offer_fkey
  foreign key (delivery_offer_id) references public.delivery_offers(id) on delete set null;

create index delivery_offers_pilot_idx on public.delivery_offers(pilot_profile_id,status,offered_at desc);
create index delivery_offers_restaurant_idx on public.delivery_offers(restaurant_id,status,offered_at desc);
create index delivery_offers_order_idx on public.delivery_offers(order_id,status);
alter table public.delivery_offers enable row level security;
