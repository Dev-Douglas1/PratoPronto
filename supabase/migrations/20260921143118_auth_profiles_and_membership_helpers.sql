
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles(
    id,nome,email,telefone,endereco,numero,bairro,complemento,cep,cidade,uf,
    aceitar_marketing,privacy_policy_version,terms_version,consent_timestamp
  ) values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome',''),
    coalesce(new.email,''),
    coalesce(new.raw_user_meta_data->>'telefone',''),
    coalesce(new.raw_user_meta_data->>'endereco',''),
    coalesce(new.raw_user_meta_data->>'numero',''),
    coalesce(new.raw_user_meta_data->>'bairro',''),
    coalesce(new.raw_user_meta_data->>'complemento',''),
    coalesce(new.raw_user_meta_data->>'cep',''),
    coalesce(new.raw_user_meta_data->>'cidade',''),
    upper(coalesce(new.raw_user_meta_data->>'uf','')),
    coalesce((new.raw_user_meta_data->>'aceitar_marketing')::boolean,false),
    new.raw_user_meta_data->>'privacy_policy_version',
    new.raw_user_meta_data->>'terms_version',
    coalesce((new.raw_user_meta_data->>'consent_timestamp')::timestamptz,now())
  )
  on conflict(id) do nothing;
  return new;
end
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.my_restaurant_role(p_restaurant_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select rm.role
  from public.restaurant_members rm
  where rm.restaurante_id=p_restaurant_id
    and rm.profile_id=auth.uid()
    and rm.active=true
  limit 1
$$;

create or replace function public.is_my_restaurant_member(p_restaurant_id uuid, p_roles text[] default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1 from public.restaurant_members rm
    where rm.restaurante_id=p_restaurant_id
      and rm.profile_id=auth.uid()
      and rm.active=true
      and (p_roles is null or rm.role=any(p_roles))
  )
$$;

revoke all on function public.my_restaurant_role(uuid) from public;
revoke all on function public.is_my_restaurant_member(uuid,text[]) from public;
grant execute on function public.my_restaurant_role(uuid) to authenticated;
grant execute on function public.is_my_restaurant_member(uuid,text[]) to authenticated;
