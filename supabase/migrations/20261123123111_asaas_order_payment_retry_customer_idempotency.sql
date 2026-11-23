-- Preserve the subaccount customer ID when a definitive provider rejection is retried.
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
        'commissionCents',p.platform_commission_cents,'restaurantId',p.restaurant_id,'userId',o.user_id,
        'providerCustomerId',p.provider_customer_id,'status','pending');
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

revoke all on function public.edge_prepare_order_payment(uuid,text) from public,anon,authenticated;
grant execute on function public.edge_prepare_order_payment(uuid,text) to service_role;
