
create extension if not exists pgcrypto;

alter table public.restaurantes
  add column if not exists slug text,
  add column if not exists ativo boolean not null default true;

create unique index if not exists restaurantes_slug_unique
  on public.restaurantes (slug)
  where slug is not null;

insert into public.restaurantes (nome, descricao, slug, ativo)
select 'PratoPronto', 'Loja principal do PratoPronto', 'pratopronto', true
where not exists (
  select 1 from public.restaurantes where slug = 'pratopronto'
);

create table if not exists public.restaurant_settings (
  restaurante_id uuid primary key references public.restaurantes(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  revision uuid not null default gen_random_uuid(),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.restaurant_settings (restaurante_id, data, updated_at)
select r.id, s.data, s.updated_at
from public.restaurantes r
join public.store_settings s on s.id = true
where r.slug = 'pratopronto'
on conflict (restaurante_id) do nothing;

create table if not exists public.restaurant_members (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner','admin','attendant','kitchen')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurante_id, profile_id)
);

create index if not exists restaurant_members_profile_idx
  on public.restaurant_members (profile_id, active);
create index if not exists restaurant_members_restaurante_idx
  on public.restaurant_members (restaurante_id, active, role);

create table if not exists public.pilot_profiles (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  display_name text not null default '',
  vehicle_type text not null default 'moto',
  city text not null default '',
  accepting_offers boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(display_name) <= 100),
  check (char_length(city) <= 100),
  check (vehicle_type in ('moto','carro','bicicleta','outro'))
);

create table if not exists public.restaurant_pilot_contacts (
  id uuid primary key default gen_random_uuid(),
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
  pilot_profile_id uuid references public.pilot_profiles(profile_id) on delete set null,
  relation_type text not null check (relation_type in ('own','partner')),
  label text not null,
  contact_type text not null check (contact_type in ('phone','whatsapp','email','other')),
  contact_value text not null,
  notes text not null default '',
  active boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(label) between 2 and 100),
  check (char_length(contact_value) between 3 and 254),
  check (char_length(notes) <= 500)
);

create index if not exists restaurant_pilot_contacts_restaurante_idx
  on public.restaurant_pilot_contacts (restaurante_id, active);

alter table public.pedidos
  add column if not exists assigned_pilot_id uuid references public.pilot_profiles(profile_id) on delete set null,
  add column if not exists delivery_status text not null default 'unassigned',
  add column if not exists delivery_offer_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'pedidos_delivery_status_check'
  ) then
    alter table public.pedidos
      add constraint pedidos_delivery_status_check
      check (delivery_status in ('unassigned','offered','accepted','picked_up','delivered'));
  end if;
end $$;

create table if not exists public.delivery_offers (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.pedidos(id) on delete cascade,
  restaurante_id uuid not null references public.restaurantes(id) on delete cascade,
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

create index if not exists delivery_offers_pilot_idx
  on public.delivery_offers (pilot_profile_id, status, offered_at desc);
create index if not exists delivery_offers_restaurante_idx
  on public.delivery_offers (restaurante_id, status, offered_at desc);
create index if not exists delivery_offers_order_idx
  on public.delivery_offers (order_id, status);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'pedidos_delivery_offer_fkey'
  ) then
    alter table public.pedidos
      add constraint pedidos_delivery_offer_fkey
      foreign key (delivery_offer_id)
      references public.delivery_offers(id)
      on delete set null;
  end if;
end $$;

create or replace function public.restaurant_role(p_restaurante_id uuid, p_user_id uuid default auth.uid())
returns text
language sql
stable
security definer
set search_path = public
as $$
  select rm.role
  from public.restaurant_members rm
  where rm.restaurante_id = p_restaurante_id
    and rm.profile_id = p_user_id
    and rm.active = true
  limit 1
$$;

create or replace function public.is_restaurant_member(
  p_restaurante_id uuid,
  p_allowed_roles text[] default null,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.restaurant_members rm
    where rm.restaurante_id = p_restaurante_id
      and rm.profile_id = p_user_id
      and rm.active = true
      and (p_allowed_roles is null or rm.role = any(p_allowed_roles))
  )
$$;

revoke all on function public.restaurant_role(uuid, uuid) from public;
revoke all on function public.is_restaurant_member(uuid, text[], uuid) from public;
grant execute on function public.restaurant_role(uuid, uuid) to authenticated;
grant execute on function public.is_restaurant_member(uuid, text[], uuid) to authenticated;

create or replace function public.respond_delivery_offer(p_offer_id uuid, p_accept boolean)
returns public.delivery_offers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_offer public.delivery_offers;
  v_order_id uuid;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  select *
    into v_offer
  from public.delivery_offers
  where id = p_offer_id
  for update;

  if not found then
    raise exception 'delivery offer not found';
  end if;

  if v_offer.pilot_profile_id is distinct from v_uid then
    raise exception 'offer does not belong to this pilot';
  end if;

  if v_offer.status <> 'pending' then
    raise exception 'offer already answered';
  end if;

  if v_offer.expires_at is not null and v_offer.expires_at <= now() then
    update public.delivery_offers
      set status = 'expired', responded_at = now()
    where id = v_offer.id;
    raise exception 'offer expired';
  end if;

  if p_accept then
    update public.pedidos
      set assigned_pilot_id = v_uid,
          delivery_status = 'accepted',
          delivery_offer_id = v_offer.id,
          updated_at = now()
    where id = v_offer.order_id
      and restaurante_id = v_offer.restaurante_id
      and assigned_pilot_id is null
    returning id into v_order_id;

    if v_order_id is null then
      raise exception 'order already assigned or unavailable';
    end if;

    update public.delivery_offers
      set status = 'accepted', responded_at = now()
    where id = v_offer.id;

    update public.delivery_offers
      set status = 'cancelled', responded_at = now()
    where order_id = v_offer.order_id
      and id <> v_offer.id
      and status = 'pending';
  else
    update public.delivery_offers
      set status = 'rejected', responded_at = now()
    where id = v_offer.id;
  end if;

  select * into v_offer
  from public.delivery_offers
  where id = p_offer_id;

  return v_offer;
end
$$;

revoke all on function public.respond_delivery_offer(uuid, boolean) from public;
grant execute on function public.respond_delivery_offer(uuid, boolean) to authenticated;

alter table public.restaurant_settings enable row level security;
alter table public.restaurant_members enable row level security;
alter table public.pilot_profiles enable row level security;
alter table public.restaurant_pilot_contacts enable row level security;
alter table public.delivery_offers enable row level security;

drop policy if exists "restaurant settings staff read" on public.restaurant_settings;
create policy "restaurant settings staff read"
on public.restaurant_settings
for select
to authenticated
using (public.is_restaurant_member(restaurante_id, array['owner','admin','attendant','kitchen']));

drop policy if exists "restaurant settings managers write" on public.restaurant_settings;
create policy "restaurant settings managers write"
on public.restaurant_settings
for all
to authenticated
using (public.is_restaurant_member(restaurante_id, array['owner','admin']))
with check (public.is_restaurant_member(restaurante_id, array['owner','admin']));

drop policy if exists "members read self or managers" on public.restaurant_members;
create policy "members read self or managers"
on public.restaurant_members
for select
to authenticated
using (
  profile_id = auth.uid()
  or public.is_restaurant_member(restaurante_id, array['owner','admin'])
);

drop policy if exists "members managers insert" on public.restaurant_members;
create policy "members managers insert"
on public.restaurant_members
for insert
to authenticated
with check (
  public.is_restaurant_member(restaurante_id, array['owner','admin'])
  and (
    public.restaurant_role(restaurante_id) = 'owner'
    or role <> 'owner'
  )
);

drop policy if exists "members managers update" on public.restaurant_members;
create policy "members managers update"
on public.restaurant_members
for update
to authenticated
using (
  public.is_restaurant_member(restaurante_id, array['owner','admin'])
  and (
    public.restaurant_role(restaurante_id) = 'owner'
    or role <> 'owner'
  )
)
with check (
  public.is_restaurant_member(restaurante_id, array['owner','admin'])
  and (
    public.restaurant_role(restaurante_id) = 'owner'
    or role <> 'owner'
  )
);

drop policy if exists "members managers delete" on public.restaurant_members;
create policy "members managers delete"
on public.restaurant_members
for delete
to authenticated
using (
  public.is_restaurant_member(restaurante_id, array['owner','admin'])
  and (
    public.restaurant_role(restaurante_id) = 'owner'
    or role <> 'owner'
  )
);

drop policy if exists "pilots public directory" on public.pilot_profiles;
create policy "pilots public directory"
on public.pilot_profiles
for select
to authenticated
using (accepting_offers = true or profile_id = auth.uid());

drop policy if exists "pilots register self" on public.pilot_profiles;
create policy "pilots register self"
on public.pilot_profiles
for insert
to authenticated
with check (profile_id = auth.uid());

drop policy if exists "pilots update self" on public.pilot_profiles;
create policy "pilots update self"
on public.pilot_profiles
for update
to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

drop policy if exists "pilot contacts company read" on public.restaurant_pilot_contacts;
create policy "pilot contacts company read"
on public.restaurant_pilot_contacts
for select
to authenticated
using (
  public.is_restaurant_member(restaurante_id, array['owner','admin','attendant'])
  or pilot_profile_id = auth.uid()
);

drop policy if exists "pilot contacts company insert" on public.restaurant_pilot_contacts;
create policy "pilot contacts company insert"
on public.restaurant_pilot_contacts
for insert
to authenticated
with check (
  public.is_restaurant_member(restaurante_id, array['owner','admin','attendant'])
  and created_by = auth.uid()
);

drop policy if exists "pilot contacts company update" on public.restaurant_pilot_contacts;
create policy "pilot contacts company update"
on public.restaurant_pilot_contacts
for update
to authenticated
using (public.is_restaurant_member(restaurante_id, array['owner','admin','attendant']))
with check (public.is_restaurant_member(restaurante_id, array['owner','admin','attendant']));

drop policy if exists "pilot contacts company delete" on public.restaurant_pilot_contacts;
create policy "pilot contacts company delete"
on public.restaurant_pilot_contacts
for delete
to authenticated
using (public.is_restaurant_member(restaurante_id, array['owner','admin']));

drop policy if exists "delivery offers visible to company or pilot" on public.delivery_offers;
create policy "delivery offers visible to company or pilot"
on public.delivery_offers
for select
to authenticated
using (
  pilot_profile_id = auth.uid()
  or public.is_restaurant_member(restaurante_id, array['owner','admin','attendant'])
);

drop policy if exists "delivery offers company creates" on public.delivery_offers;
create policy "delivery offers company creates"
on public.delivery_offers
for insert
to authenticated
with check (
  offered_by = auth.uid()
  and public.is_restaurant_member(restaurante_id, array['owner','admin','attendant'])
  and exists (
    select 1
    from public.pedidos p
    where p.id = order_id
      and p.restaurante_id = restaurante_id
  )
);

do $$
begin
  begin
    alter publication supabase_realtime add table public.delivery_offers;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.pedidos;
  exception when duplicate_object then null;
  end;
end $$;
