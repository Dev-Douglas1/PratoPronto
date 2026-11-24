-- Applied to Supabase project on 2026-09-21.
-- Removes the abandoned single-store schema and hardens the live multi-company runtime.

drop policy if exists "platform admins self read" on public.platform_admins;
create policy "platform admins self read"
on public.platform_admins
for select
to authenticated
using (profile_id=(select auth.uid()) and active=true);

revoke all on public.platform_admins from anon, authenticated;
grant select on public.platform_admins to authenticated;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists(
    select 1 from public.platform_admins a
    where a.profile_id=auth.uid() and a.active=true
  )
$$;
revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to authenticated;

drop policy if exists privacy_read on public.privacy_requests;
create policy privacy_read
on public.privacy_requests
for select
to authenticated
using (
  private.verified((select auth.uid()))
  and (user_id=(select auth.uid()) or public.is_platform_admin())
);

drop function if exists public.app_commit(uuid,text,jsonb);
drop function if exists public.app_rate(uuid,text);
drop trigger if exists zz_accept_admin_invitation on auth.users;
drop function if exists private.accept_admin_invitation();
drop function if exists private.admin(uuid);

drop function if exists public.restaurant_role(uuid,uuid);
drop function if exists public.is_restaurant_member(uuid,text[],uuid);
drop function if exists public.my_restaurant_role(uuid);
drop function if exists public.is_my_restaurant_member(uuid,text[]);

drop table if exists public.favoritos;
drop table if exists public.pedido_itens;
drop table if exists public.pedidos;
drop table if exists public.enderecos;
drop table if exists public.produtos;
drop table if exists public.store_settings;
drop table if exists public.restaurant_admins;
drop table if exists private.rate_limits;
drop table if exists private.admin_invitations;

drop policy if exists "pilots authenticated directory" on public.pilot_profiles;
drop policy if exists "pilots own read" on public.pilot_profiles;
create policy "pilots own read"
on public.pilot_profiles
for select
to authenticated
using (profile_id=(select auth.uid()));

drop policy if exists "pilots own insert" on public.pilot_profiles;
drop policy if exists "pilots own update" on public.pilot_profiles;
revoke all on public.pilot_profiles from anon, authenticated;
grant select on public.pilot_profiles to authenticated;

create or replace function public.get_my_pilot_profile()
returns public.pilot_profiles
language sql
stable
security invoker
set search_path = ''
as $$
  select pp.*
  from public.pilot_profiles pp
  where pp.profile_id=auth.uid()
  limit 1
$$;
revoke all on function public.get_my_pilot_profile() from public;
grant execute on function public.get_my_pilot_profile() to authenticated;

drop policy if exists "products managers write" on public.products;
drop policy if exists "products managers insert" on public.products;
drop policy if exists "products managers update" on public.products;
drop policy if exists "products managers delete" on public.products;

create policy "products managers insert"
on public.products for insert to authenticated
with check (private.restaurant_member(restaurant_id,array['owner','admin'],(select auth.uid())));

create policy "products managers update"
on public.products for update to authenticated
using (private.restaurant_member(restaurant_id,array['owner','admin'],(select auth.uid())))
with check (private.restaurant_member(restaurant_id,array['owner','admin'],(select auth.uid())));

create policy "products managers delete"
on public.products for delete to authenticated
using (private.restaurant_member(restaurant_id,array['owner','admin'],(select auth.uid())));

drop index if exists public.orders_pilot_status_idx;
drop index if exists public.orders_user_created_idx;

create index if not exists delivery_secrets_user_id_idx on public.delivery_secrets(user_id);
create index if not exists order_delivery_offers_offered_by_idx on public.order_delivery_offers(offered_by);
create index if not exists order_delivery_offers_pilot_contact_idx on public.order_delivery_offers(pilot_contact_id);
create index if not exists pilot_profiles_reviewed_by_idx on public.pilot_profiles(reviewed_by);
create index if not exists quotes_restaurant_id_idx on public.quotes(restaurant_id);
create index if not exists restaurant_pilot_contacts_created_by_idx on public.restaurant_pilot_contacts(created_by);
create index if not exists restaurant_pilot_contacts_pilot_profile_idx on public.restaurant_pilot_contacts(pilot_profile_id);
create index if not exists restaurant_settings_updated_by_idx on public.restaurant_settings(updated_by);
