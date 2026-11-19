
alter table public.restaurantes enable row level security;
alter table public.products enable row level security;
alter table public.restaurant_settings enable row level security;
alter table public.restaurant_members enable row level security;
alter table public.orders enable row level security;
alter table public.quotes enable row level security;
alter table public.order_events enable row level security;
alter table public.refund_requests enable row level security;
alter table public.reviews enable row level security;
alter table public.delivery_secrets enable row level security;
alter table public.pilot_profiles enable row level security;
alter table public.restaurant_pilot_contacts enable row level security;
alter table public.order_delivery_offers enable row level security;

drop policy if exists "restaurantes_public_read" on public.restaurantes;
drop policy if exists "products_read" on public.products;
drop policy if exists "orders_read" on public.orders;
drop policy if exists "events_read" on public.order_events;
drop policy if exists "refunds_read" on public.refund_requests;
drop policy if exists "reviews_read" on public.reviews;
drop policy if exists "restaurant settings staff read" on public.restaurant_settings;
drop policy if exists "restaurant settings managers write" on public.restaurant_settings;
drop policy if exists "members read self or managers" on public.restaurant_members;
drop policy if exists "members managers insert" on public.restaurant_members;
drop policy if exists "members managers update" on public.restaurant_members;
drop policy if exists "members managers delete" on public.restaurant_members;
drop policy if exists "pilots public directory" on public.pilot_profiles;
drop policy if exists "pilots register self" on public.pilot_profiles;
drop policy if exists "pilots update self" on public.pilot_profiles;
drop policy if exists "pilot contacts company read" on public.restaurant_pilot_contacts;
drop policy if exists "pilot contacts company insert" on public.restaurant_pilot_contacts;
drop policy if exists "pilot contacts company update" on public.restaurant_pilot_contacts;
drop policy if exists "pilot contacts company delete" on public.restaurant_pilot_contacts;
drop policy if exists "profile_own" on public.profiles;
drop policy if exists "profile own read" on public.profiles;
drop policy if exists "profile own update" on public.profiles;

create policy "restaurants public or member read" on public.restaurantes
for select to anon,authenticated
using (ativo=true or private.restaurant_member(id,null,(select auth.uid())));

create policy "products public or staff read" on public.products
for select to anon,authenticated
using (active=true or private.restaurant_member(restaurant_id,array['owner','admin','attendant','kitchen'],(select auth.uid())));

create policy "products managers write" on public.products
for all to authenticated
using (private.restaurant_member(restaurant_id,array['owner','admin'],(select auth.uid())))
with check (private.restaurant_member(restaurant_id,array['owner','admin'],(select auth.uid())));

create policy "settings staff read" on public.restaurant_settings
for select to authenticated
using (private.restaurant_member(restaurante_id,array['owner','admin','attendant','kitchen'],(select auth.uid())));

create policy "settings managers insert" on public.restaurant_settings
for insert to authenticated
with check (private.restaurant_member(restaurante_id,array['owner','admin'],(select auth.uid())));

create policy "settings managers update" on public.restaurant_settings
for update to authenticated
using (private.restaurant_member(restaurante_id,array['owner','admin'],(select auth.uid())))
with check (private.restaurant_member(restaurante_id,array['owner','admin'],(select auth.uid())));

create policy "members self or managers read" on public.restaurant_members
for select to authenticated
using (profile_id=(select auth.uid()) or private.restaurant_member(restaurante_id,array['owner','admin'],(select auth.uid())));

create policy "orders customer staff pilot read" on public.orders
for select to authenticated
using (
  user_id=(select auth.uid())
  or assigned_pilot_id=(select auth.uid())
  or private.restaurant_member(restaurant_id,array['owner','admin','attendant','kitchen'],(select auth.uid()))
);

create policy "quotes own read" on public.quotes
for select to authenticated using(user_id=(select auth.uid()));

create policy "events related read" on public.order_events
for select to authenticated
using(exists(
  select 1 from public.orders o where o.id=order_id and (
    o.user_id=(select auth.uid()) or o.assigned_pilot_id=(select auth.uid())
    or private.restaurant_member(o.restaurant_id,array['owner','admin','attendant','kitchen'],(select auth.uid()))
  )
));

create policy "refund related read" on public.refund_requests
for select to authenticated
using(user_id=(select auth.uid()) or private.restaurant_member(restaurant_id,array['owner','admin','attendant'],(select auth.uid())));

create policy "review related read" on public.reviews
for select to authenticated
using(user_id=(select auth.uid()) or private.restaurant_member(restaurant_id,array['owner','admin','attendant'],(select auth.uid())));

create policy "delivery secret owner read" on public.delivery_secrets
for select to authenticated using(user_id=(select auth.uid()));

create policy "pilots authenticated directory" on public.pilot_profiles
for select to authenticated using(accepting_offers=true or profile_id=(select auth.uid()));
create policy "pilots own insert" on public.pilot_profiles
for insert to authenticated with check(profile_id=(select auth.uid()));
create policy "pilots own update" on public.pilot_profiles
for update to authenticated using(profile_id=(select auth.uid())) with check(profile_id=(select auth.uid()));

create policy "pilot contacts staff read" on public.restaurant_pilot_contacts
for select to authenticated
using(private.restaurant_member(restaurante_id,array['owner','admin','attendant'],(select auth.uid())) or pilot_profile_id=(select auth.uid()));
create policy "pilot contacts staff insert" on public.restaurant_pilot_contacts
for insert to authenticated
with check(created_by=(select auth.uid()) and private.restaurant_member(restaurante_id,array['owner','admin','attendant'],(select auth.uid())));
create policy "pilot contacts staff update" on public.restaurant_pilot_contacts
for update to authenticated
using(private.restaurant_member(restaurante_id,array['owner','admin','attendant'],(select auth.uid())))
with check(private.restaurant_member(restaurante_id,array['owner','admin','attendant'],(select auth.uid())));
create policy "pilot contacts managers delete" on public.restaurant_pilot_contacts
for delete to authenticated
using(private.restaurant_member(restaurante_id,array['owner','admin'],(select auth.uid())));

create policy "offers staff or target read" on public.order_delivery_offers
for select to authenticated
using(pilot_profile_id=(select auth.uid()) or private.restaurant_member(restaurant_id,array['owner','admin','attendant'],(select auth.uid())));

create policy "profile own read" on public.profiles
for select to authenticated
using(id=(select auth.uid()) and private.verified((select auth.uid())));
create policy "profile own update" on public.profiles
for update to authenticated
using(id=(select auth.uid()) and private.verified((select auth.uid())))
with check(id=(select auth.uid()));

do $$
begin
  begin alter publication supabase_realtime add table public.orders; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.order_events; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.refund_requests; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.reviews; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.products; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.restaurant_settings; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.restaurant_members; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.pilot_profiles; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.restaurant_pilot_contacts; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.order_delivery_offers; exception when duplicate_object then null; end;
end $$;
