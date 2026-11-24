-- Asaas Pix checkout, provider webhook RPCs, and order state transitions.
alter table private.payments add column if not exists provider_customer_id text;
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
  if not p_accept_terms then raise exception 'Leia os termos e a política antes de confirmar.'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>50 then raise exception 'Carrinho inválido.'; end if;
  if p_method not in ('maquina_entrega','pix') then raise exception 'Forma de pagamento indisponível. No momento, use Pix ou maquininha na entrega.'; end if;
  if p_method='pix' and not exists (
    select 1 from private.payment_gateway_accounts a
    where a.restaurant_id=rid and a.provider='asaas' and a.environment='production'
      and a.onboarding_status='active' and a.vault_secret_id is not null
  ) then raise exception 'Pix online ainda não está habilitado para este restaurante.'; end if;

  select rs.data into settings from public.restaurant_settings rs where rs.restaurante_id=rid;
  if settings is null or not coalesce((settings->>'acceptingOrders')::boolean,false) then raise exception 'A empresa não está recebendo pedidos agora.'; end if;
  if p_method='maquina_entrega' and not (coalesce(settings->'methods','[]'::jsonb) ? p_method) then
    raise exception 'Forma de pagamento indisponível.';
  end if;

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
end $function$;

CREATE OR REPLACE FUNCTION public.checkout_order(p_quote_id uuid, p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  uid uuid:=auth.uid(); q public.quotes; existing public.orders; oid uuid:=gen_random_uuid();
  order_data jsonb; payment_method text; next_status text; next_payment_status text;
begin
  perform private.enforce_rate_limit('orders.checkout',10,60);
  if not private.verified(uid) then raise exception 'Entre novamente e confirme seu e-mail.'; end if;
  select * into existing from public.orders o where o.request_id=p_request_id limit 1;
  if existing.id is not null then
    if existing.user_id<>uid or existing.quote_id<>p_quote_id then raise exception 'Esta tentativa já pertence a outro pedido.'; end if;
    return jsonb_build_object('orderId',existing.id,'checkoutUrl',null,'status',existing.status,
      'paymentMethod',existing.payment_method,
      'checkoutState',case when existing.payment_method='pix' and existing.payment_status<>'paid' then 'awaiting_payment' else 'none' end);
  end if;
  select * into q from public.quotes where id=p_quote_id for update;
  if q.id is null or q.user_id<>uid then raise exception 'Resumo de compra inválido.'; end if;
  if q.expires_at<=now() then raise exception 'O resumo expirou. Confira os valores novamente.'; end if;
  payment_method:=q.data->>'method';
  if payment_method not in ('maquina_entrega','pix') then raise exception 'Forma de pagamento indisponível.'; end if;
  if payment_method='pix' and not exists (
    select 1 from private.payment_gateway_accounts a
    where a.restaurant_id=q.restaurant_id and a.provider='asaas' and a.environment='production'
      and a.onboarding_status='active' and a.vault_secret_id is not null
  ) then raise exception 'Pix online ainda não está habilitado para este restaurante.'; end if;
  next_status:=case when payment_method='pix' then 'aguardando_pagamento' else 'confirmado' end;
  next_payment_status:=case when payment_method='pix' then 'pending' else 'pendente_entrega' end;
  order_data:=jsonb_build_object(
    'companyId',q.data->>'companyId','userId',uid,'cliente',q.data->'cliente','entrega',q.data->'entrega',
    'itens',q.data->'itens','subtotal',(q.data->>'subtotal')::numeric,'taxaEntrega',(q.data->>'taxaEntrega')::numeric,
    'total',(q.data->>'total')::numeric,'estimateMinutes',(q.data->>'estimateMinutes')::int,'observacao',q.data->>'note',
    'pagamento',jsonb_build_object('metodo',payment_method,
      'modalidade',case when payment_method='pix' then 'pix' else 'debito_credito' end,
      'provedor',case when payment_method='pix' then 'asaas' else 'entrega' end,
      'ambiente','producao','status',next_payment_status,'referencia',''),
    'status',next_status,'deliveryVerificationRequired',false,'assignedCourier',''
  );
  insert into public.orders(id,user_id,restaurant_id,items,delivery_address,total_cents,payment_method,payment_status,status,data,quote_id,request_id,delivery_status,delivery_verification_required)
  values(oid,uid,q.restaurant_id,q.data->'itens',q.data->'entrega',round(((q.data->>'total')::numeric)*100)::int,
    payment_method,next_payment_status,next_status,order_data,p_quote_id,p_request_id,'unassigned',false);
  insert into public.order_events(order_id,data) values(oid,jsonb_build_object('status',next_status,'kind','created','by',uid,'at',now()));
  return jsonb_build_object('orderId',oid,'checkoutUrl',null,'status',next_status,
    'paymentMethod',payment_method,
    'checkoutState',case when payment_method='pix' then 'awaiting_payment' else 'none' end);
end $function$;

CREATE OR REPLACE FUNCTION public.advance_order(p_order_id uuid, p_next text, p_received boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare uid uuid:=auth.uid(); o public.orders; actor_role text; expected text; pay_status text;
begin
  perform private.enforce_rate_limit('orders.advance',60,60);
  select * into o from public.orders where id=p_order_id for update;
  if o.id is null then raise exception 'Pedido não encontrado.'; end if;
  if o.payment_method='pix' and o.payment_status<>'paid' then
    raise exception 'O pedido só pode entrar em preparação após a confirmação do Pix.';
  end if;
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
end $function$;

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
  select data into s from public.restaurant_settings where restaurante_id=rid;
  s:=coalesce(s,'{}'::jsonb);
  return jsonb_build_object(
    'companyId',r.slug,'restaurantId',r.id,'name',coalesce(s->>'name',r.nome),
    'phone',coalesce(s->>'phone',r.telefone,''),'address',coalesce(s->'address','{}'::jsonb),
    'hours',coalesce(s->'hours','[]'::jsonb),'zones',coalesce(s->'zones','[]'::jsonb),
    'timezone',coalesce(s->>'timezone','America/Sao_Paulo'),
    'estimateMinutes',coalesce((s->>'estimateMinutes')::int,45),
    'methods',(select coalesce(jsonb_agg(method),'[]'::jsonb) from (
      select 'maquina_entrega'::text as method
      where coalesce(s->'methods','[]'::jsonb) ? 'maquina_entrega'
      union all
      select 'pix'::text
      where exists (
        select 1 from private.payment_gateway_accounts a
        where a.restaurant_id=rid and a.provider='asaas' and a.environment='production'
          and a.onboarding_status='active' and a.vault_secret_id is not null
      )
    ) enabled_methods),
    'open',r.ativo and coalesce((s->>'acceptingOrders')::boolean,false),
    'configured',s<>'{}'::jsonb,'environment','production'
  );
end $function$;

CREATE OR REPLACE FUNCTION public.edge_prepare_order_payment(p_order_id uuid, p_environment text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare o public.orders; p private.payments; pid uuid; subtotal bigint; fee bigint; commission bigint; inserted boolean:=false;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Acesso restrito ao backend financeiro.' using errcode='42501'; end if;
  if p_environment not in ('sandbox','production') then raise exception 'Ambiente de pagamento inválido.'; end if;
  select * into o from public.orders where id=p_order_id for update;
  if o.id is null then raise exception 'Pedido não encontrado.'; end if;
  if o.payment_method<>'pix' or o.status<>'aguardando_pagamento' or o.payment_status<>'pending' then
    raise exception 'Pedido não está aguardando pagamento Pix.';
  end if;
  subtotal:=round((o.data->>'subtotal')::numeric*100)::bigint;
  fee:=greatest(0,o.total_cents-subtotal);
  if subtotal<=0 or subtotal>o.total_cents then raise exception 'Base de cálculo do pedido inválida.'; end if;
  commission:=round(subtotal*500/10000.0)::bigint;
  insert into private.payments(
    restaurant_id,order_id,purpose,provider,environment,idempotency_key,method,status,
    gross_amount_cents,items_subtotal_cents,delivery_fee_cents,commission_rate_bps,
    commission_base_cents,platform_commission_cents,gateway_fee_payer
  ) values (
    o.restaurant_id,o.id,'order','asaas',p_environment,'asaas-order:'||o.id::text,
    'pix','pending',o.total_cents,subtotal,fee,500,subtotal,commission,'restaurant'
  ) on conflict(idempotency_key) do nothing returning id into pid;
  inserted:=pid is not null;
  if not inserted then
    select * into p from private.payments where idempotency_key='asaas-order:'||o.id::text for update;
    if p.provider_payment_id is null and p.status='failed' then
      update private.payments set status='pending',metadata=coalesce(metadata,'{}'::jsonb)-'lastProviderError',updated_at=now()
      where id=p.id;
      return jsonb_build_object('paymentId',p.id,'created',true,'inProgress',false,
        'amountCents',p.gross_amount_cents,'subtotalCents',p.items_subtotal_cents,
        'commissionCents',p.platform_commission_cents,'restaurantId',p.restaurant_id,'userId',o.user_id,'status','pending');
    end if;
    if p.provider_payment_id is null then
      return jsonb_build_object('paymentId',p.id,'created',false,'inProgress',true,'status',p.status);
    end if;
    return jsonb_build_object('paymentId',p.id,'created',false,'inProgress',false,
      'providerPaymentId',p.provider_payment_id,'providerCustomerId',p.provider_customer_id,'status',p.status,
      'metadata',p.metadata);
  end if;
  return jsonb_build_object('paymentId',pid,'created',true,'inProgress',false,
    'amountCents',o.total_cents,'subtotalCents',subtotal,'commissionCents',commission,
    'restaurantId',o.restaurant_id,'userId',o.user_id,'status','pending');
end;
$function$;

CREATE OR REPLACE FUNCTION public.edge_set_order_payment_customer(p_payment_id uuid, p_customer_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Acesso restrito ao backend financeiro.' using errcode='42501'; end if;
  update private.payments set provider_customer_id=p_customer_id,updated_at=now()
  where id=p_payment_id and provider='asaas';
  return found;
end;
$function$;

CREATE OR REPLACE FUNCTION public.edge_set_order_payment_provider(p_payment_id uuid, p_provider_payment_id text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Acesso restrito ao backend financeiro.' using errcode='42501'; end if;
  update private.payments set provider_payment_id=p_provider_payment_id,status='awaiting_payment',
    metadata=coalesce(metadata,'{}'::jsonb)||coalesce(p_metadata,'{}'::jsonb),updated_at=now()
  where id=p_payment_id and provider='asaas' and provider_payment_id is null;
  return found;
end;
$function$;

CREATE OR REPLACE FUNCTION public.edge_lookup_asaas_payment(p_provider_payment_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p private.payments;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Acesso restrito ao backend financeiro.' using errcode='42501'; end if;
  select * into p from private.payments where provider='asaas' and provider_payment_id=p_provider_payment_id limit 1;
  if p.id is null then return null; end if;
  return jsonb_build_object('paymentId',p.id,'orderId',p.order_id,'restaurantId',p.restaurant_id,
    'purpose',p.purpose,'environment',p.environment,'grossAmountCents',p.gross_amount_cents,
    'commissionCents',p.platform_commission_cents,'providerCustomerId',p.provider_customer_id,
    'status',p.status,'externalSubscriptionId',p.provider_subscription_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.edge_mark_order_paid(p_provider_payment_id text, p_amount_cents bigint, p_gateway_fee_cents bigint DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p private.payments; o public.orders; jid uuid;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Acesso restrito ao backend financeiro.' using errcode='42501'; end if;
  select * into p from private.payments where provider='asaas' and provider_payment_id=p_provider_payment_id for update;
  if p.id is null or p.order_id is null then raise exception 'Pagamento de pedido não encontrado.'; end if;
  if p_amount_cents<>p.gross_amount_cents then raise exception 'Valor confirmado diverge do pedido.'; end if;
  if p.status='paid' then return jsonb_build_object('status','paid','duplicate',true); end if;
  select * into o from public.orders where id=p.order_id for update;
  if o.id is null or o.payment_method<>'pix' then raise exception 'Pedido incompatível com pagamento Pix.'; end if;

  update private.payments set status='paid',paid_at=now(),gateway_fee_cents=greatest(0,p_gateway_fee_cents),
    restaurant_net_cents=greatest(0,gross_amount_cents-platform_commission_cents-greatest(0,p_gateway_fee_cents)),
    updated_at=now() where id=p.id;

  update public.orders set payment_status='paid',
    status=case when status='aguardando_pagamento' then 'confirmado' else status end,
    data=jsonb_set(jsonb_set(data,'{pagamento,status}','"paid"'::jsonb,true),
      '{pagamento,referencia}',to_jsonb(p_provider_payment_id),true),
    updated_at=now()
  where id=o.id;

  insert into public.order_events(order_id,data)
  values(o.id,jsonb_build_object('status','confirmado','kind','payment_received','provider','asaas','at',now()));

  if p.platform_commission_cents>0 then
    insert into private.financial_journals(event_type,source_type,source_id,idempotency_key,metadata)
    values('online_order_paid','payment',p.id::text,'online-order-commission:'||p.id::text,
      jsonb_build_object('orderId',o.id,'providerPaymentId',p_provider_payment_id,'commissionBaseCents',p.commission_base_cents))
    on conflict(idempotency_key) do nothing returning id into jid;
    if jid is not null then
      insert into private.financial_ledger(journal_id,line_no,account_code,restaurant_id,debit_cents,credit_cents,description)
      values
        (jid,1,'asaas_split_receivable',o.restaurant_id,p.platform_commission_cents,0,'Comissão de 5% aguardando liquidação do Split Asaas'),
        (jid,2,'platform_commission_revenue',o.restaurant_id,0,p.platform_commission_cents,'Receita de comissão do pedido Pix');
    end if;
    insert into private.payment_splits(payment_id,restaurant_id,recipient_type,provider,provider_recipient_id,
      amount_cents,status,processing_fee_responsibility)
    values(p.id,o.restaurant_id,'platform','asaas',p.metadata->>'platformWalletId',
      p.platform_commission_cents,'awaiting_credit','restaurant')
    on conflict(payment_id,recipient_type) do nothing;
  end if;
  return jsonb_build_object('status','paid','duplicate',false);
end;
$function$;

CREATE OR REPLACE FUNCTION public.edge_record_asaas_webhook(p_event_id text, p_event_type text, p_environment text, p_payload jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare existing_status text;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Acesso restrito ao backend financeiro.' using errcode='42501'; end if;
  select processing_status into existing_status from private.webhook_events
  where provider='asaas' and environment=p_environment and external_event_id=p_event_id for update;
  if found and existing_status in ('processed','ignored') then return false; end if;
  if found then
    update private.webhook_events set processing_status='processing',attempts=attempts+1,
      signature_verified=true,last_error=null,payload_redacted=coalesce(p_payload,'{}'::jsonb)
    where provider='asaas' and environment=p_environment and external_event_id=p_event_id;
    return true;
  end if;
  insert into private.webhook_events(provider,environment,external_event_id,event_type,signature_verified,processing_status,attempts,payload_redacted)
  values('asaas',p_environment,p_event_id,p_event_type,true,'processing',1,coalesce(p_payload,'{}'::jsonb));
  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.edge_finish_asaas_webhook(p_event_id text, p_environment text, p_status text, p_error text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Acesso restrito ao backend financeiro.' using errcode='42501'; end if;
  if p_status not in ('processed','ignored','failed') then raise exception 'Status de webhook inválido.'; end if;
  update private.webhook_events set processing_status=p_status,processed_at=case when p_status='processed' then now() else processed_at end,
    last_error=left(coalesce(p_error,''),1000)
  where provider='asaas' and environment=p_environment and external_event_id=p_event_id;
  return found;
end;
$function$;

CREATE OR REPLACE FUNCTION public.edge_apply_subscription_payment(p_provider_subscription_id text, p_provider_payment_id text, p_amount_cents bigint, p_payment_status text, p_paid_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare s public.restaurant_subscriptions; plan_row public.subscription_plans; plan_price integer; jid uuid;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Acesso restrito ao backend financeiro.' using errcode='42501'; end if;
  select * into s from public.restaurant_subscriptions
  where external_provider='asaas' and external_subscription_id=p_provider_subscription_id for update;
  if s.id is null then raise exception 'Assinatura PratoPronto não encontrada.'; end if;
  select * into plan_row from public.subscription_plans where code='profissional' and is_active=true;
  if plan_row.id is null then raise exception 'Plano Profissional não está ativo.'; end if;
  plan_price:=plan_row.monthly_price_cents;
  if p_payment_status='RECEIVED' then
    if p_amount_cents<>plan_price then raise exception 'Valor da mensalidade diverge do plano.'; end if;
    update public.restaurant_subscriptions set plan_id=plan_row.id,status='active',
      current_period_start=coalesce(current_period_end,p_paid_at,now()),
      current_period_end=greatest(coalesce(current_period_end,p_paid_at,now()),coalesce(p_paid_at,now()))+interval '1 month',
      next_due_date=(greatest(coalesce(current_period_end,p_paid_at,now()),coalesce(p_paid_at,now()))+interval '1 month')::date,
      last_payment_id=p_provider_payment_id,last_payment_status=p_payment_status,payment_failed_at=null,updated_at=now()
    where id=s.id;
    insert into private.financial_journals(event_type,source_type,source_id,idempotency_key,metadata)
    values('subscription_paid','subscription',s.id::text,'asaas-subscription-payment:'||p_provider_payment_id,
      jsonb_build_object('restaurantId',s.restaurant_id,'providerPaymentId',p_provider_payment_id,'amountCents',p_amount_cents))
    on conflict(idempotency_key) do nothing returning id into jid;
    if jid is not null then
      insert into private.financial_ledger(journal_id,line_no,account_code,restaurant_id,debit_cents,credit_cents,description)
      values
        (jid,1,'platform_cash',s.restaurant_id,p_amount_cents,0,'Mensalidade PratoPronto recebida via Asaas'),
        (jid,2,'subscription_revenue',s.restaurant_id,0,p_amount_cents,'Receita da mensalidade PratoPronto');
    end if;
    return jsonb_build_object('status','active','planCode',plan_row.code);
  elsif p_payment_status='OVERDUE' then
    update public.restaurant_subscriptions set status='past_due',last_payment_id=p_provider_payment_id,
      last_payment_status=p_payment_status,payment_failed_at=now(),updated_at=now() where id=s.id;
    return jsonb_build_object('status','past_due');
  elsif p_payment_status in ('REFUNDED','CHARGEBACK_REQUESTED','CHARGEBACK_DISPUTE') then
    update public.restaurant_subscriptions set status='past_due',last_payment_id=p_provider_payment_id,
      last_payment_status=p_payment_status,payment_failed_at=now(),updated_at=now() where id=s.id;
    return jsonb_build_object('status','past_due');
  end if;
  return jsonb_build_object('status',s.status,'ignored',true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.edge_mark_asaas_split_done(p_provider_payment_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p private.payments; sp private.payment_splits; jid uuid;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Acesso restrito ao backend financeiro.' using errcode='42501'; end if;
  select * into p from private.payments where provider='asaas' and provider_payment_id=p_provider_payment_id for update;
  if p.id is null then raise exception 'Pagamento não encontrado.'; end if;
  select * into sp from private.payment_splits where payment_id=p.id and recipient_type='platform' for update;
  if sp.id is null then return jsonb_build_object('status','not_applicable'); end if;
  if sp.status='done' then return jsonb_build_object('status','done','duplicate',true); end if;
  update private.payment_splits set status='done',settled_at=now(),updated_at=now() where id=sp.id;
  if sp.amount_cents>0 then
    insert into private.financial_journals(event_type,source_type,source_id,idempotency_key,metadata)
    values('online_split_settled','payment',p.id::text,'asaas-split-settled:'||p.id::text,
      jsonb_build_object('providerPaymentId',p_provider_payment_id,'splitId',sp.id))
    on conflict(idempotency_key) do nothing returning id into jid;
    if jid is not null then
      insert into private.financial_ledger(journal_id,line_no,account_code,restaurant_id,debit_cents,credit_cents,description)
      values
        (jid,1,'platform_cash',p.restaurant_id,sp.amount_cents,0,'Comissão do Split Asaas liquidada'),
        (jid,2,'asaas_split_receivable',p.restaurant_id,0,sp.amount_cents,'Baixa do recebível do Split Asaas');
    end if;
  end if;
  return jsonb_build_object('status','done','duplicate',false);
end;
$function$;

alter table private.financial_journals drop constraint if exists financial_journals_event_type_check;
alter table private.financial_journals add constraint financial_journals_event_type_check
check (event_type in (
  'online_order_paid','online_split_settled','offline_order_commission_due',
  'subscription_paid','payment_refunded','chargeback_opened','chargeback_won',
  'chargeback_lost','gateway_fee_recorded','manual_adjustment'
));
revoke all on function public.edge_prepare_order_payment(uuid,text) from public,anon,authenticated;
revoke all on function public.edge_set_order_payment_customer(uuid,text) from public,anon,authenticated;
revoke all on function public.edge_set_order_payment_provider(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.edge_lookup_asaas_payment(text) from public,anon,authenticated;
revoke all on function public.edge_mark_order_paid(text,bigint,bigint) from public,anon,authenticated;
revoke all on function public.edge_record_asaas_webhook(text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.edge_finish_asaas_webhook(text,text,text,text) from public,anon,authenticated;
revoke all on function public.edge_apply_subscription_payment(text,text,bigint,text,timestamptz) from public,anon,authenticated;
revoke all on function public.edge_mark_asaas_split_done(text) from public,anon,authenticated;
grant execute on function public.edge_prepare_order_payment(uuid,text) to service_role;
grant execute on function public.edge_set_order_payment_customer(uuid,text) to service_role;
grant execute on function public.edge_set_order_payment_provider(uuid,text,jsonb) to service_role;
grant execute on function public.edge_lookup_asaas_payment(text) to service_role;
grant execute on function public.edge_mark_order_paid(text,bigint,bigint) to service_role;
grant execute on function public.edge_record_asaas_webhook(text,text,text,jsonb) to service_role;
grant execute on function public.edge_finish_asaas_webhook(text,text,text,text) to service_role;
grant execute on function public.edge_apply_subscription_payment(text,text,bigint,text,timestamptz) to service_role;
grant execute on function public.edge_mark_asaas_split_done(text) to service_role;
