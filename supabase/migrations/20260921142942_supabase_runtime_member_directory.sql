
create or replace function public.list_restaurant_members(p_restaurant_slug text)
returns table(id uuid,profile_id uuid,email text,role text,active boolean)
language sql stable security definer set search_path='' as $$
  select rm.id,rm.profile_id,coalesce(u.email,''),rm.role,rm.active
  from public.restaurant_members rm
  join auth.users u on u.id=rm.profile_id
  where rm.restaurante_id=private.restaurant_id_from_slug(p_restaurant_slug)
    and rm.active=true
    and private.restaurant_member(rm.restaurante_id,array['owner','admin'],auth.uid())
  order by case rm.role when 'owner' then 0 when 'admin' then 1 when 'attendant' then 2 else 3 end,u.email
$$;
revoke all on function public.list_restaurant_members(text) from public;
grant execute on function public.list_restaurant_members(text) to authenticated;

do $$
begin
  begin alter publication supabase_realtime add table public.restaurantes; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.delivery_secrets; exception when duplicate_object then null; end;
end $$;
