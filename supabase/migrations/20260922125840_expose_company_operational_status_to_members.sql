
create or replace function private.restaurant_membership_exists(
  p_restaurant_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1 from public.restaurant_members rm
    where rm.restaurante_id=p_restaurant_id
      and rm.profile_id=p_user_id
      and rm.active=true
  )
$$;
revoke all on function private.restaurant_membership_exists(uuid,uuid) from public,anon,authenticated;

drop policy if exists "restaurants public read" on public.restaurantes;
create policy "restaurants public read"
on public.restaurantes
for select
to anon,authenticated
using(
  (ativo=true and account_status='active')
  or private.restaurant_membership_exists(id,(select auth.uid()))
  or public.is_platform_admin()
);

drop function if exists public.my_restaurants();
create function public.my_restaurants()
returns table(
  company_id text,
  restaurant_id uuid,
  name text,
  role text,
  permissions jsonb,
  account_status text,
  blocked_reason text
)
language sql
stable
set search_path='public'
as $$
  select r.slug,r.id,r.nome,rm.role,
    case rm.role
      when 'owner' then '["company:manage","team:manage","catalog:manage","orders:read","orders:advance","orders:print","reviews:reply","refunds:manage","pilots:assign","audit:read"]'::jsonb
      when 'admin' then '["company:manage","team:manage","catalog:manage","orders:read","orders:advance","orders:print","reviews:reply","refunds:manage","pilots:assign","audit:read"]'::jsonb
      when 'attendant' then '["orders:read","orders:advance","orders:print","reviews:reply","refunds:manage","pilots:assign"]'::jsonb
      when 'kitchen' then '["orders:read","orders:advance","orders:print"]'::jsonb
      else '[]'::jsonb
    end,
    r.account_status,
    r.blocked_reason
  from public.restaurant_members rm
  join public.restaurantes r on r.id=rm.restaurante_id
  where rm.profile_id=(select auth.uid())
    and rm.active=true
  order by r.nome
$$;
revoke all on function public.my_restaurants() from public;
grant execute on function public.my_restaurants() to authenticated;
