
create or replace function public.company_catalog_list(p_restaurant_id uuid)
returns setof public.products
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.restaurant_members rm
    where rm.restaurante_id=p_restaurant_id and rm.profile_id=auth.uid()
      and rm.active=true and rm.role in ('owner','admin')
  ) then raise exception 'Sem permissão para gerenciar este cardápio.'; end if;
  return query select * from public.products p where p.restaurant_id=p_restaurant_id order by p.active desc,p.name;
end $$;

create or replace function public.company_catalog_save(
  p_restaurant_id uuid, p_product_id uuid default null, p_name text default '',
  p_description text default '', p_category text default 'Outros',
  p_price_cents integer default 0, p_image_url text default null, p_active boolean default true
) returns public.products
language plpgsql
security definer
set search_path = ''
as $$
declare v public.products;
begin
  if auth.uid() is null or not exists (
    select 1 from public.restaurant_members rm
    where rm.restaurante_id=p_restaurant_id and rm.profile_id=auth.uid()
      and rm.active=true and rm.role in ('owner','admin')
  ) then raise exception 'Sem permissão para gerenciar este cardápio.'; end if;
  if length(trim(p_name)) < 2 then raise exception 'Informe o nome do produto.'; end if;
  if p_price_cents < 0 then raise exception 'Preço inválido.'; end if;

  if p_product_id is null then
    insert into public.products(restaurant_id,name,description,category,price_cents,image_url,active,slug)
    values(p_restaurant_id,trim(p_name),trim(coalesce(p_description,'')),trim(coalesce(nullif(p_category,''),'Outros')),
      p_price_cents,nullif(trim(coalesce(p_image_url,'')),''),coalesce(p_active,true),
      lower(regexp_replace(trim(p_name),'[^a-zA-Z0-9]+','-','g'))||'-'||substr(gen_random_uuid()::text,1,8))
    returning * into v;
  else
    update public.products set name=trim(p_name),description=trim(coalesce(p_description,'')),
      category=trim(coalesce(nullif(p_category,''),'Outros')),price_cents=p_price_cents,
      image_url=nullif(trim(coalesce(p_image_url,'')),''),active=coalesce(p_active,true),updated_at=now()
    where id=p_product_id and restaurant_id=p_restaurant_id returning * into v;
    if v.id is null then raise exception 'Produto não encontrado nesta empresa.'; end if;
  end if;
  return v;
end $$;

create or replace function public.company_catalog_set_active(p_restaurant_id uuid,p_product_id uuid,p_active boolean)
returns public.products
language plpgsql security definer set search_path=''
as $$
declare v public.products;
begin
  if auth.uid() is null or not exists (
    select 1 from public.restaurant_members rm where rm.restaurante_id=p_restaurant_id
      and rm.profile_id=auth.uid() and rm.active=true and rm.role in ('owner','admin')
  ) then raise exception 'Sem permissão para gerenciar este cardápio.'; end if;
  update public.products set active=p_active,updated_at=now()
  where id=p_product_id and restaurant_id=p_restaurant_id returning * into v;
  if v.id is null then raise exception 'Produto não encontrado nesta empresa.'; end if;
  return v;
end $$;

revoke all on function public.company_catalog_list(uuid) from public, anon;
revoke all on function public.company_catalog_save(uuid,uuid,text,text,text,integer,text,boolean) from public, anon;
revoke all on function public.company_catalog_set_active(uuid,uuid,boolean) from public, anon;
grant execute on function public.company_catalog_list(uuid) to authenticated;
grant execute on function public.company_catalog_save(uuid,uuid,text,text,text,integer,text,boolean) to authenticated;
grant execute on function public.company_catalog_set_active(uuid,uuid,boolean) to authenticated;
