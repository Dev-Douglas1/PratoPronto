-- Retry only after a definitive provider rejection; preserve ambiguous network attempts.
CREATE OR REPLACE FUNCTION public.edge_fail_order_payment(p_payment_id uuid, p_error text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Acesso restrito ao backend financeiro.' using errcode='42501'; end if;
  update private.payments set status='failed',
    metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('lastProviderError',left(coalesce(p_error,''),500)),
    updated_at=now()
  where id=p_payment_id and provider='asaas' and provider_payment_id is null and status in ('pending','awaiting_payment');
  return found;
end;
$function$;

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

CREATE OR REPLACE FUNCTION private.subscription_is_entitled(p_restaurant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.restaurant_subscriptions s
    join public.subscription_plans p on p.id=s.plan_id
    where s.restaurant_id=p_restaurant_id
      and p.is_active=true
      and (s.status in ('active','trialing','past_due') or (s.status='canceled' and s.current_period_end > now()))
      and (s.current_period_end is null or s.current_period_end > now())
  );
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

revoke all on function public.edge_fail_order_payment(uuid,text) from public,anon,authenticated;
grant execute on function public.edge_fail_order_payment(uuid,text) to service_role;
revoke all on function public.edge_prepare_order_payment(uuid,text) from public,anon,authenticated;
grant execute on function public.edge_prepare_order_payment(uuid,text) to service_role;
