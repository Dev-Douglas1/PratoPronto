
create or replace function public.get_storefront(p_slug text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare rid uuid; r public.restaurantes; s jsonb;
begin
  rid:=private.restaurant_id_from_slug(p_slug);
  if rid is null then raise exception 'Empresa não encontrada.'; end if;
  select * into r from public.restaurantes where id=rid;
  select data into s from public.restaurant_settings where restaurante_id=rid;
  s:=coalesce(s,'{}'::jsonb);
  return jsonb_build_object(
    'companyId',r.slug,'restaurantId',r.id,'name',coalesce(s->>'name',r.nome),
    'phone',coalesce(s->>'phone',r.telefone,''),'address',coalesce(s->'address','{}'::jsonb),
    'hours',coalesce(s->'hours','[]'::jsonb),'zones',coalesce(s->'zones','[]'::jsonb),
    'timezone',coalesce(s->>'timezone','America/Sao_Paulo'),
    'estimateMinutes',coalesce((s->>'estimateMinutes')::int,45),
    'methods',(select coalesce(jsonb_agg(value),'[]'::jsonb)
      from jsonb_array_elements_text(coalesce(s->'methods','[]'::jsonb)) x(value)
      where value='maquina_entrega'),
    'open',r.ativo and coalesce((s->>'acceptingOrders')::boolean,false),
    'configured',s<>'{}'::jsonb,'environment','production'
  );
end $$;
grant execute on function public.get_storefront(text) to anon,authenticated;

create or replace function public.my_restaurants()
returns table(company_id text,restaurant_id uuid,name text,role text,permissions jsonb)
language sql stable security invoker set search_path=public as $$
  select r.slug,r.id,r.nome,rm.role,
    case rm.role
      when 'owner' then '["company:manage","team:manage","catalog:manage","orders:read","orders:advance","orders:print","reviews:reply","refunds:manage","pilots:assign"]'::jsonb
      when 'admin' then '["company:manage","team:manage","catalog:manage","orders:read","orders:advance","orders:print","reviews:reply","refunds:manage","pilots:assign"]'::jsonb
      when 'attendant' then '["orders:read","orders:advance","orders:print","reviews:reply","refunds:manage","pilots:assign"]'::jsonb
      when 'kitchen' then '["orders:read","orders:advance","orders:print"]'::jsonb
      else '[]'::jsonb end
  from public.restaurant_members rm join public.restaurantes r on r.id=rm.restaurante_id
  where rm.profile_id=(select auth.uid()) and rm.active=true order by r.nome
$$;
grant execute on function public.my_restaurants() to authenticated;

create or replace function public.create_restaurant(p_slug text,p_name text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); rid uuid; slug_value text:=lower(trim(p_slug)); name_value text:=trim(p_name);
begin
  if not private.verified(uid) then raise exception 'Confirme seu e-mail para continuar.'; end if;
  if slug_value !~ '^[a-z0-9][a-z0-9_-]{1,63}$' then raise exception 'Identificador da empresa inválido.'; end if;
  if char_length(name_value)<2 or char_length(name_value)>100 then raise exception 'Nome da empresa inválido.'; end if;
  if exists(select 1 from public.restaurantes r where r.slug=slug_value) then raise exception 'Já existe uma empresa com este identificador.'; end if;
  insert into public.restaurantes(nome,slug,ativo) values(name_value,slug_value,false) returning id into rid;
  insert into public.restaurant_members(restaurante_id,profile_id,role,active) values(rid,uid,'owner',true);
  insert into public.restaurant_settings(restaurante_id,data,updated_by) values(
    rid,jsonb_build_object('name',name_value,'acceptingOrders',false,'methods',jsonb_build_array('maquina_entrega'),
    'timezone','America/Sao_Paulo','estimateMinutes',45,'retentionDays',90,'hours','[]'::jsonb,'zones','[]'::jsonb,'address','{}'::jsonb),uid);
  return jsonb_build_object('companyId',slug_value,'restaurantId',rid,'name',name_value,'role','owner');
end $$;
revoke all on function public.create_restaurant(text,text) from public;
grant execute on function public.create_restaurant(text,text) to authenticated;

create or replace function public.add_restaurant_member(p_restaurant_slug text,p_email text,p_role text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); rid uuid:=private.restaurant_id_from_slug(p_restaurant_slug); target_uid uuid;
  actor_role text; email_value text:=lower(trim(p_email)); role_value text:=lower(trim(p_role));
begin
  if rid is null then raise exception 'Empresa não encontrada.'; end if;
  actor_role:=private.restaurant_role(rid,uid);
  if actor_role not in ('owner','admin') then raise exception 'Sem permissão para gerenciar a equipe.'; end if;
  if role_value not in ('admin','attendant','kitchen') then raise exception 'Função inválida.'; end if;
  select u.id into target_uid from auth.users u where lower(u.email)=email_value and u.email_confirmed_at is not null and u.deleted_at is null limit 1;
  if target_uid is null then raise exception 'Esse e-mail precisa ter uma conta verificada no PratoPronto.'; end if;
  insert into public.restaurant_members(restaurante_id,profile_id,role,active)
  values(rid,target_uid,role_value,true)
  on conflict(restaurante_id,profile_id) do update set role=excluded.role,active=true,updated_at=now();
  return jsonb_build_object('userId',target_uid,'email',email_value,'role',role_value);
end $$;
revoke all on function public.add_restaurant_member(text,text,text) from public;
grant execute on function public.add_restaurant_member(text,text,text) to authenticated;

create or replace function public.remove_restaurant_member(p_restaurant_slug text,p_profile_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); rid uuid:=private.restaurant_id_from_slug(p_restaurant_slug); actor_role text; target_role text;
begin
  actor_role:=private.restaurant_role(rid,uid);
  if actor_role not in ('owner','admin') then raise exception 'Sem permissão para gerenciar a equipe.'; end if;
  select rm.role into target_role from public.restaurant_members rm where rm.restaurante_id=rid and rm.profile_id=p_profile_id and rm.active=true;
  if target_role is null then raise exception 'Membro não encontrado.'; end if;
  if target_role='owner' then raise exception 'O proprietário precisa transferir a empresa antes de sair.'; end if;
  update public.restaurant_members set active=false,updated_at=now() where restaurante_id=rid and profile_id=p_profile_id;
  return true;
end $$;
revoke all on function public.remove_restaurant_member(text,uuid) from public;
grant execute on function public.remove_restaurant_member(text,uuid) to authenticated;

create or replace function public.save_restaurant_settings(p_restaurant_slug text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); rid uuid:=private.restaurant_id_from_slug(p_restaurant_slug); name_value text;
begin
  if not private.restaurant_member(rid,array['owner','admin'],uid) then raise exception 'Sem permissão para alterar a empresa.'; end if;
  name_value:=trim(coalesce(p_data->>'name',''));
  if char_length(name_value)<2 or char_length(name_value)>100 then raise exception 'Informe o nome da empresa.'; end if;
  if jsonb_array_length(coalesce(p_data->'methods','[]'::jsonb))=0 then raise exception 'Selecione pelo menos uma forma de pagamento.'; end if;
  -- Nesta fase sem Firebase, somente pagamento na entrega fica ativo.
  p_data:=jsonb_set(p_data,'{methods}','["maquina_entrega"]'::jsonb,true);
  insert into public.restaurant_settings(restaurante_id,data,updated_by,updated_at)
  values(rid,p_data,uid,now())
  on conflict(restaurante_id) do update set data=excluded.data,updated_by=uid,updated_at=now();
  update public.restaurantes set nome=name_value,telefone=left(coalesce(p_data->>'phone',''),40),
    endereco=coalesce(p_data->'address'->>'endereco',''),
    ativo=coalesce((p_data->>'acceptingOrders')::boolean,false),updated_at=now() where id=rid;
  return public.get_storefront(p_restaurant_slug);
end $$;
revoke all on function public.save_restaurant_settings(text,jsonb) from public;
grant execute on function public.save_restaurant_settings(text,jsonb) to authenticated;

create or replace function public.save_restaurant_product(
  p_restaurant_slug text,p_product_slug text,p_name text,p_description text,p_category text,
  p_price_cents int,p_image_url text,p_active boolean,p_config jsonb default '{}'::jsonb,p_promotion jsonb default null
)
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); rid uuid:=private.restaurant_id_from_slug(p_restaurant_slug); pid uuid;
begin
  if not private.restaurant_member(rid,array['owner','admin'],uid) then raise exception 'Sem permissão para alterar o cardápio.'; end if;
  if p_product_slug !~ '^[a-z0-9][a-z0-9-]{0,79}$' then raise exception 'Identificador do produto inválido.'; end if;
  if char_length(trim(p_name))<2 or char_length(trim(p_name))>100 then raise exception 'Nome do produto inválido.'; end if;
  if p_price_cents<1 or p_price_cents>200000 then raise exception 'Preço inválido.'; end if;
  insert into public.products(restaurant_id,name,description,category,price_cents,image_url,active,slug,config,promotion,updated_at)
  values(rid,trim(p_name),left(coalesce(p_description,''),300),left(coalesce(p_category,'Outros'),40),p_price_cents,
    nullif(trim(coalesce(p_image_url,'')),''),coalesce(p_active,true),p_product_slug,coalesce(p_config,'{}'::jsonb),p_promotion,now())
  on conflict(restaurant_id,slug) where slug is not null
  do update set name=excluded.name,description=excluded.description,category=excluded.category,price_cents=excluded.price_cents,
    image_url=excluded.image_url,active=excluded.active,config=excluded.config,promotion=excluded.promotion,updated_at=now()
  returning id into pid;
  return pid;
end $$;
revoke all on function public.save_restaurant_product(text,text,text,text,text,int,text,boolean,jsonb,jsonb) from public;
grant execute on function public.save_restaurant_product(text,text,text,text,text,int,text,boolean,jsonb,jsonb) to authenticated;
