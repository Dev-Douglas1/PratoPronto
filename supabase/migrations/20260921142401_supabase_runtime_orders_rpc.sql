
create or replace function public.quote_order(
  p_restaurant_slug text,p_items jsonb,p_method text,p_note text default '',p_accept_terms boolean default false
)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  uid uuid:=auth.uid(); rid uuid:=private.restaurant_id_from_slug(p_restaurant_slug);
  settings jsonb; prof public.profiles; item jsonb; prod public.products; qty int; opts jsonb;
  unit_cents int; subtotal_cents int:=0; fee_cents int:=0; min_cents int:=0; free_above int;
  zone jsonb; quoted_items jsonb:='[]'::jsonb; details text; qid uuid:=gen_random_uuid();
  expires timestamptz:=now()+interval '5 minutes'; discount int; ex text;
begin
  if not private.verified(uid) then raise exception 'Entre na conta e confirme seu e-mail.'; end if;
  if rid is null then raise exception 'Empresa não encontrada.'; end if;
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
end $$;
revoke all on function public.quote_order(text,jsonb,text,text,boolean) from public;
grant execute on function public.quote_order(text,jsonb,text,text,boolean) to authenticated;

create or replace function public.checkout_order(p_quote_id uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  uid uuid:=auth.uid(); q public.quotes; existing public.orders; oid uuid:=gen_random_uuid();
  bytes bytea; delivery_code text; order_data jsonb;
begin
  if not private.verified(uid) then raise exception 'Entre novamente e confirme seu e-mail.'; end if;
  select * into existing from public.orders o where o.request_id=p_request_id limit 1;
  if existing.id is not null then
    if existing.user_id<>uid or existing.quote_id<>p_quote_id then raise exception 'Esta tentativa já pertence a outro pedido.'; end if;
    return jsonb_build_object('orderId',existing.id,'checkoutUrl',null,'status',existing.status,'checkoutState','none');
  end if;
  select * into q from public.quotes where id=p_quote_id for update;
  if q.id is null or q.user_id<>uid then raise exception 'Resumo de compra inválido.'; end if;
  if q.expires_at<=now() then raise exception 'O resumo expirou. Confira os valores novamente.'; end if;
  if q.data->>'method'<>'maquina_entrega' then raise exception 'Forma de pagamento indisponível.'; end if;

  bytes:=gen_random_bytes(2);
  delivery_code:=lpad((((get_byte(bytes,0)*256+get_byte(bytes,1))%10000))::text,4,'0');
  order_data:=jsonb_build_object(
    'companyId',q.data->>'companyId','userId',uid,'cliente',q.data->'cliente','entrega',q.data->'entrega',
    'itens',q.data->'itens','subtotal',(q.data->>'subtotal')::numeric,'taxaEntrega',(q.data->>'taxaEntrega')::numeric,
    'total',(q.data->>'total')::numeric,'estimateMinutes',(q.data->>'estimateMinutes')::int,'observacao',q.data->>'note',
    'pagamento',jsonb_build_object('metodo','maquina_entrega','modalidade','debito_credito','ambiente','producao','status','pendente_entrega','referencia',''),
    'status','confirmado','deliveryVerificationRequired',true,'assignedCourier',''
  );
  insert into public.orders(id,user_id,restaurant_id,items,delivery_address,total_cents,payment_method,payment_status,status,data,quote_id,request_id,delivery_status,delivery_verification_required)
  values(oid,uid,q.restaurant_id,q.data->'itens',q.data->'entrega',round(((q.data->>'total')::numeric)*100)::int,
    'maquina_entrega','pendente_entrega','confirmado',order_data,p_quote_id,p_request_id,'unassigned',true);
  insert into public.delivery_secrets(order_id,user_id,code,code_hash)
  values(oid,uid,delivery_code,encode(digest(oid::text||':'||delivery_code,'sha256'),'hex'));
  insert into public.order_events(order_id,data) values(oid,jsonb_build_object('status','confirmado','kind','created','by',uid,'at',now()));
  return jsonb_build_object('orderId',oid,'checkoutUrl',null,'status','confirmado','checkoutState','none');
end $$;
revoke all on function public.checkout_order(uuid,uuid) from public;
grant execute on function public.checkout_order(uuid,uuid) to authenticated;

create or replace function public.advance_order(p_order_id uuid,p_next text,p_received boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); o public.orders; actor_role text; expected text; pay_status text;
begin
  select * into o from public.orders where id=p_order_id for update;
  if o.id is null then raise exception 'Pedido não encontrado.'; end if;
  actor_role:=private.restaurant_role(o.restaurant_id,uid);
  if actor_role not in ('owner','admin','attendant','kitchen') then raise exception 'Sem permissão para alterar este pedido.'; end if;
  expected:=case o.status when 'confirmado' then 'preparando' when 'preparando' then 'pronto' when 'pronto' then 'saiu_entrega' when 'saiu_entrega' then 'entregue' else null end;
  if expected is distinct from p_next then raise exception 'O pedido mudou de etapa. Atualize a tela.'; end if;
  if o.delivery_verification_required and p_next in ('saiu_entrega','entregue') then raise exception 'A entrega protegida deve ser iniciada e concluída pelo Piloto Parceiro.'; end if;
  if actor_role='kitchen' and p_next not in ('preparando','pronto') then raise exception 'A cozinha não pode alterar esta etapa.'; end if;
  pay_status:=o.payment_status;
  if p_next='entregue' and pay_status='pendente_entrega' then
    if not p_received then raise exception 'Confirme o recebimento na entrega.'; end if;
    pay_status:='recebido_entrega';
  end if;
  update public.orders set status=p_next,payment_status=pay_status,
    data=jsonb_set(jsonb_set(data,'{status}',to_jsonb(p_next),true),'{pagamento,status}',to_jsonb(pay_status),true),updated_at=now()
  where id=o.id;
  insert into public.order_events(order_id,data) values(o.id,jsonb_build_object('status',p_next,'kind','company_advance','by',uid,'at',now()));
  return jsonb_build_object('status',p_next);
end $$;
revoke all on function public.advance_order(uuid,text,boolean) from public;
grant execute on function public.advance_order(uuid,text,boolean) to authenticated;
