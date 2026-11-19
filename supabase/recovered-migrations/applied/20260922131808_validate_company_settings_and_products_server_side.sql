
create or replace function public.save_restaurant_settings(
  p_restaurant_slug text,
  p_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  uid uuid:=auth.uid();
  rid uuid:=private.restaurant_id_from_slug(p_restaurant_slug);
  name_value text;
  estimate integer;
  retention integer;
  zones jsonb;
  zone jsonb;
  hours jsonb;
  day_slots jsonb;
  slot jsonb;
  start_min integer;
  end_min integer;
begin
  perform private.enforce_rate_limit('company.settings',30,600);

  if private.restaurant_role(rid,uid) not in ('owner','admin') then
    raise exception 'Sem permissão para alterar a empresa.';
  end if;
  if jsonb_typeof(p_data)<>'object' then raise exception 'Configuração inválida.'; end if;

  name_value:=trim(coalesce(p_data->>'name',''));
  if char_length(name_value)<2 or char_length(name_value)>100 then
    raise exception 'Informe um nome de empresa com 2 a 100 caracteres.';
  end if;

  estimate:=coalesce((p_data->>'estimateMinutes')::integer,45);
  retention:=coalesce((p_data->>'retentionDays')::integer,90);
  if estimate<10 or estimate>240 then raise exception 'Previsão de entrega inválida.'; end if;
  if retention<30 or retention>3650 then raise exception 'Retenção operacional inválida.'; end if;

  if char_length(coalesce(p_data->>'phone',''))>40 then raise exception 'Telefone da empresa muito longo.'; end if;
  if char_length(coalesce(p_data->>'privacyEmail',''))>254 then raise exception 'E-mail de privacidade inválido.'; end if;
  if char_length(coalesce(p_data->>'legalName',''))>160 then raise exception 'Nome do responsável muito longo.'; end if;
  if char_length(coalesce(p_data->>'document',''))>40 then raise exception 'Documento muito longo.'; end if;

  zones:=coalesce(p_data->'zones','[]'::jsonb);
  if jsonb_typeof(zones)<>'array' or jsonb_array_length(zones)>100 then raise exception 'Áreas de entrega inválidas.'; end if;
  for zone in select value from jsonb_array_elements(zones)
  loop
    if char_length(trim(coalesce(zone->>'bairro','')))<2 or char_length(trim(coalesce(zone->>'bairro','')))>100 then
      raise exception 'Bairro inválido na área de entrega.';
    end if;
    if coalesce((zone->>'feeCents')::integer,0)<0 or coalesce((zone->>'feeCents')::integer,0)>100000 then
      raise exception 'Taxa de entrega inválida.';
    end if;
    if coalesce((zone->>'minCents')::integer,0)<0 or coalesce((zone->>'minCents')::integer,0)>1000000 then
      raise exception 'Pedido mínimo inválido.';
    end if;
    if zone ? 'freeAboveCents' and zone->>'freeAboveCents' is not null
       and ((zone->>'freeAboveCents')::integer<0 or (zone->>'freeAboveCents')::integer>1000000) then
      raise exception 'Limite de frete grátis inválido.';
    end if;
  end loop;

  hours:=coalesce(p_data->'hours','[]'::jsonb);
  if jsonb_typeof(hours)<>'array' or jsonb_array_length(hours)<>7 then
    raise exception 'Informe os horários dos sete dias da semana.';
  end if;
  for day_slots in select value from jsonb_array_elements(hours)
  loop
    if jsonb_typeof(day_slots)<>'array' or jsonb_array_length(day_slots)>3 then
      raise exception 'Horários de atendimento inválidos.';
    end if;
    for slot in select value from jsonb_array_elements(day_slots)
    loop
      start_min:=coalesce((slot->>'start')::integer,-1);
      end_min:=coalesce((slot->>'end')::integer,-1);
      if start_min<0 or start_min>1439 or end_min<1 or end_min>1440 or end_min<=start_min then
        raise exception 'Intervalo de atendimento inválido.';
      end if;
    end loop;
  end loop;

  p_data:=jsonb_set(p_data,'{methods}','["maquina_entrega"]'::jsonb,true);
  p_data:=jsonb_set(p_data,'{estimateMinutes}',to_jsonb(estimate),true);
  p_data:=jsonb_set(p_data,'{retentionDays}',to_jsonb(retention),true);

  insert into public.restaurant_settings(restaurante_id,data,updated_by,updated_at)
  values(rid,p_data,uid,now())
  on conflict(restaurante_id)
  do update set data=excluded.data,updated_by=uid,updated_at=now();

  update public.restaurantes
  set nome=name_value,
      telefone=left(coalesce(p_data->>'phone',''),40),
      endereco=left(coalesce(p_data->'address'->>'endereco',''),180),
      ativo=coalesce((p_data->>'acceptingOrders')::boolean,false),
      updated_at=now()
  where id=rid;

  return public.get_storefront(p_restaurant_slug);
end
$$;

create or replace function public.save_restaurant_product(
  p_restaurant_slug text,
  p_product_slug text,
  p_name text,
  p_description text,
  p_category text,
  p_price_cents integer,
  p_image_url text,
  p_active boolean,
  p_config jsonb default '{}'::jsonb,
  p_promotion jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  uid uuid:=auth.uid();
  rid uuid:=private.restaurant_id_from_slug(p_restaurant_slug);
  pid uuid;
  cfg jsonb:=coalesce(p_config,'{}'::jsonb);
  promo jsonb:=p_promotion;
  image_value text:=trim(coalesce(p_image_url,''));
  pct integer;
  start_ms bigint;
  end_ms bigint;
begin
  perform private.enforce_rate_limit('company.product',120,600);

  if private.restaurant_role(rid,uid) not in ('owner','admin') then
    raise exception 'Sem permissão para alterar o cardápio.';
  end if;
  if p_product_slug !~ '^[a-z0-9][a-z0-9-]{0,79}$' then raise exception 'Identificador do produto inválido.'; end if;
  if char_length(trim(p_name))<2 or char_length(trim(p_name))>100 then raise exception 'Nome do produto inválido.'; end if;
  if char_length(coalesce(p_description,''))>300 then raise exception 'Descrição muito longa.'; end if;
  if char_length(coalesce(p_category,''))<2 or char_length(coalesce(p_category,''))>40 then raise exception 'Categoria inválida.'; end if;
  if p_price_cents<1 or p_price_cents>200000 then raise exception 'Preço inválido.'; end if;
  if char_length(image_value)>500 then raise exception 'Endereço da imagem muito longo.'; end if;
  if image_value<>'' and image_value not like '/%' and image_value not like 'https://%' then
    raise exception 'Use imagem HTTPS ou caminho interno.';
  end if;
  if jsonb_typeof(cfg)<>'object' then raise exception 'Configuração do produto inválida.'; end if;

  if coalesce((cfg->>'personalizavel')::boolean,false) then
    if not (cfg ? 'sizes') then
      cfg:=jsonb_set(cfg,'{sizes}','{"pequena":-1200,"media":-600,"grande":0}'::jsonb,true);
    end if;
    if not (cfg ? 'crusts') then
      cfg:=jsonb_set(cfg,'{crusts}','{"tradicional":0,"catupiry":700,"cheddar":700}'::jsonb,true);
    end if;
    if not (cfg ? 'extras') then
      cfg:=jsonb_set(cfg,'{extras}','{"bacon":500,"cebola":200,"azeitona":300}'::jsonb,true);
    end if;
  else
    cfg:=jsonb_build_object('personalizavel',false);
  end if;

  if promo is not null then
    if jsonb_typeof(promo)<>'object' then raise exception 'Promoção inválida.'; end if;
    pct:=coalesce((promo->>'percentual')::integer,0);
    start_ms:=coalesce((promo->>'inicio')::bigint,0);
    end_ms:=coalesce((promo->>'fim')::bigint,0);
    if char_length(trim(coalesce(promo->>'titulo','')))<3 or char_length(trim(coalesce(promo->>'titulo','')))>60 then raise exception 'Título da promoção inválido.'; end if;
    if pct<1 or pct>90 then raise exception 'Desconto inválido.'; end if;
    if start_ms<=0 or end_ms<=start_ms or end_ms-start_ms>7776000000 then raise exception 'Validade da promoção inválida.'; end if;
    if jsonb_typeof(promo->'ativa')<>'boolean' then raise exception 'Status da promoção inválido.'; end if;
  end if;

  insert into public.products(
    restaurant_id,name,description,category,price_cents,image_url,active,slug,config,promotion,updated_at
  )
  values(
    rid,trim(p_name),trim(coalesce(p_description,'')),trim(coalesce(p_category,'Outros')),p_price_cents,
    nullif(image_value,''),coalesce(p_active,true),p_product_slug,cfg,promo,now()
  )
  on conflict(restaurant_id,slug) where slug is not null
  do update set
    name=excluded.name,
    description=excluded.description,
    category=excluded.category,
    price_cents=excluded.price_cents,
    image_url=excluded.image_url,
    active=excluded.active,
    config=excluded.config,
    promotion=excluded.promotion,
    updated_at=now()
  returning id into pid;

  return pid;
end
$$;
