-- Keep public storefront and checkout aligned with the public restaurant visibility policy.
-- Suspended, blocked or inactive restaurants must not expose a storefront or accept new quotes.

CREATE OR REPLACE FUNCTION public.get_storefront(p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare rid uuid; r public.restaurantes; s jsonb;
begin
  rid:=private.restaurant_id_from_slug(p_slug);
  if rid is null then raise exception 'Empresa não encontrada.'; end if;
  select * into r from public.restaurantes where id=rid;
  if not r.ativo or r.account_status <> 'active' then
    raise exception 'Empresa não está disponível.';
  end if;
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
end $function$
;

CREATE OR REPLACE FUNCTION public.quote_order(p_restaurant_slug text, p_items jsonb, p_method text, p_note text DEFAULT ''::text, p_accept_terms boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  uid uuid:=auth.uid(); rid uuid:=private.restaurant_id_from_slug(p_restaurant_slug);
  settings jsonb; prof public.profiles; item jsonb; prod public.products; qty int; opts jsonb;
  unit_cents int; subtotal_cents int:=0; fee_cents int:=0; min_cents int:=0; free_above int;
  zone jsonb; quoted_items jsonb:='[]'::jsonb; details text; qid uuid:=gen_random_uuid();
  expires timestamptz:=now()+interval '5 minutes'; discount int; ex text;
begin
  perform private.enforce_rate_limit('orders.quote',30,60);
  if not private.verified(uid) then raise exception 'Entre na conta e confirme seu e-mail.'; end if;
  if rid is null then raise exception 'Empresa não encontrada.'; end if;
  if not exists (
    select 1 from public.restaurantes r
    where r.id = rid and r.ativo = true and r.account_status = 'active'
  ) then
    raise exception 'Empresa não está disponível para pedidos.';
  end if;
  if not p_accept_terms then raise exception 'Leia os termos e a política antes de confirmar.'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>50 then raise exception 'Carrinho inválido.'; end if;
  if p_method<>'maquina_entrega' then raise exception 'Pagamento online ainda não foi ativado no Supabase. Escolha maquininha na entrega.'; end if;

  select rs.data into settings from public.restaurant_settings rs where rs.restaurante_id=rid;
  if settings is null or not coalesce((settings->>'acceptingOrders')::boolean,false) then raise exception 'A empresa não está recebendo pedidos agora.'; end if;
  if not (coalesce(settings->'methods','[]'::jsonb) ? p_method) then raise exception 'Forma de pagamento indisponível.'; end if;

  select * into prof from public.profiles p where p.id=uid;
  if prof.id is null then raise exception 'Complete seu perfil antes de pedir.'; end if;
  if trim(prof.endereco)='' or trim(prof.numero)='' or trim(prof.bairro)='' then raise exception 'Complete seu endereço antes de pedir.'; end if;

  for item in select * from jsonb_array_elements(p_items)
  loop
    qty:=coalesce((item->>'quantidade')::int,0);
    if qty<1 or qty>50 then raise exception 'Quantidade inválida.'; end if;

    select * into prod from public.products p
    where p.restaurant_id=rid and p.slug=item->>'id' and p.active=true limit 1;
    if prod.id is null then raise exception 'Um produto não está mais disponível.'; end if;

    unit_cents:=prod.price_cents;
    opts:=coalesce(item->'opcoes','{}'::jsonb);
    details:='';

    if coalesce((prod.config->>'personalizavel')::boolean,false) then
      unit_cents:=unit_cents+coalesce((prod.config->'sizes'->>coalesce(opts->>'tamanho','grande'))::int,0);
      unit_cents:=unit_cents+coalesce((prod.config->'crusts'->>coalesce(opts->>'borda','tradicional'))::int,0);
      if jsonb_typeof(coalesce(opts->'extras','[]'::jsonb))='array' then
        for ex in select * from jsonb_array_elements_text(coalesce(opts->'extras','[]'::jsonb))
        loop
          if not (prod.config->'extras' ? ex) then raise exception 'Adicional inválido.'; end if;
          unit_cents:=unit_cents+coalesce((prod.config->'extras'->>ex)::int,0);
        end loop;
      end if;
      details:=concat_ws(' · ',coalesce(opts->>'tamanho','grande'),coalesce(opts->>'borda','tradicional'),
        nullif(array_to_string(array(select jsonb_array_elements_text(coalesce(opts->'extras','[]'::jsonb))),', '),''));
    end if;

    if prod.promotion is not null and coalesce((prod.promotion->>'ativa')::boolean,false) then
      discount:=greatest(0,least(90,coalesce((prod.promotion->>'percentual')::int,0)));
      unit_cents:=round(unit_cents*(100-discount)/100.0)::int;
    else discount:=0; end if;

    if unit_cents<1 then raise exception 'Preço inválido.'; end if;
    subtotal_cents:=subtotal_cents+unit_cents*qty;
    quoted_items:=quoted_items||jsonb_build_array(jsonb_build_object(
      'id',prod.slug,'nome',prod.name,'quantidade',qty,'precoUnitario',unit_cents/100.0,
      'detalhes',details,'opcoes',opts,'promocao',case when discount>0 then prod.promotion else null end
    ));
  end loop;

  select z into zone from jsonb_array_elements(coalesce(settings->'zones','[]'::jsonb)) z
  where private.normalize_search(z->>'bairro')=private.normalize_search(prof.bairro) limit 1;
  if zone is null then raise exception 'O endereço está fora da área de entrega desta empresa.'; end if;
  fee_cents:=coalesce((zone->>'feeCents')::int,round(coalesce((zone->>'fee')::numeric,0)*100)::int,0);
  min_cents:=coalesce((zone->>'minCents')::int,round(coalesce((zone->>'min')::numeric,0)*100)::int,0);
  free_above:=coalesce(nullif(zone->>'freeAboveCents','')::int,round(nullif(zone->>'freeAbove','')::numeric*100)::int);
  if subtotal_cents<min_cents then raise exception 'O pedido não atingiu o mínimo para este bairro.'; end if;
  if free_above is not null and subtotal_cents>=free_above then fee_cents:=0; end if;

  insert into public.quotes(id,user_id,restaurant_id,data,revision,expires_at)
  values(qid,uid,rid,jsonb_build_object(
    'companyId',p_restaurant_slug,'restaurantId',rid,'itemsInput',p_items,'itens',quoted_items,
    'subtotal',subtotal_cents/100.0,'taxaEntrega',fee_cents/100.0,'total',(subtotal_cents+fee_cents)/100.0,
    'estimateMinutes',coalesce((settings->>'estimateMinutes')::int,45),'method',p_method,'note',left(coalesce(p_note,''),500),
    'cliente',jsonb_build_object('nome',prof.nome,'email',prof.email,'telefone',prof.telefone),
    'entrega',jsonb_build_object('endereco',prof.endereco,'numero',prof.numero,'bairro',prof.bairro,'complemento',prof.complemento,'cep',prof.cep,'cidade',prof.cidade,'uf',prof.uf)
  ),gen_random_uuid(),expires);

  return jsonb_build_object('quoteId',qid,'itens',quoted_items,'subtotal',subtotal_cents/100.0,'taxaEntrega',fee_cents/100.0,
    'total',(subtotal_cents+fee_cents)/100.0,'estimateMinutes',coalesce((settings->>'estimateMinutes')::int,45),
    'expiresAt',expires,'environment','production');
end $function$
;
