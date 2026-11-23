begin;

create or replace function private.record_offline_order_commission()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subtotal_cents bigint;
  v_delivery_cents bigint;
  v_commission_cents bigint;
  v_payment_id uuid;
  v_journal_id uuid;
begin
  if new.payment_method <> 'maquina_entrega'
     or new.payment_status <> 'recebido_entrega'
     or old.payment_status is not distinct from new.payment_status then
    return new;
  end if;

  v_subtotal_cents := round(coalesce(nullif(new.data->>'subtotal','')::numeric,
    (new.total_cents - coalesce(nullif(new.data->>'taxaEntrega','')::numeric,0)*100)/100) * 100)::bigint;
  v_delivery_cents := greatest(0, new.total_cents - v_subtotal_cents);

  if v_subtotal_cents <= 0 or v_subtotal_cents > new.total_cents then
    raise exception 'Não foi possível calcular a base de comissão do pedido %.', new.id;
  end if;

  v_commission_cents := round(v_subtotal_cents * 500 / 10000.0)::bigint;

  insert into private.payments(
    restaurant_id,order_id,purpose,provider,environment,idempotency_key,method,status,
    gross_amount_cents,items_subtotal_cents,delivery_fee_cents,commission_rate_bps,
    commission_base_cents,platform_commission_cents,gateway_fee_payer,restaurant_net_cents,paid_at
  ) values (
    new.restaurant_id,new.id,'order',null,'internal','offline-order:'||new.id::text,
    'card_on_delivery','paid',new.total_cents,v_subtotal_cents,v_delivery_cents,500,
    v_subtotal_cents,v_commission_cents,'restaurant',
    greatest(0,new.total_cents-v_commission_cents),now()
  )
  on conflict (idempotency_key) do nothing
  returning id into v_payment_id;

  if v_payment_id is null then
    return new;
  end if;

  if v_commission_cents > 0 then
    insert into private.financial_journals(
      event_type,source_type,source_id,idempotency_key,metadata
    ) values (
      'offline_order_commission_due','order',new.id::text,
      'offline-commission:'||new.id::text,
      jsonb_build_object('paymentId',v_payment_id,'restaurantId',new.restaurant_id,'commissionBaseCents',v_subtotal_cents,'commissionRateBps',500)
    )
    on conflict (idempotency_key) do nothing
    returning id into v_journal_id;

    if v_journal_id is null then
      raise exception 'Já existe lançamento financeiro para o pedido %, mas não existe pagamento idempotente correspondente.',new.id;
    end if;

    insert into private.financial_ledger(
      journal_id,line_no,account_code,restaurant_id,debit_cents,credit_cents,description
    ) values
      (v_journal_id,1,'restaurant_commission_receivable',new.restaurant_id,v_commission_cents,0,'Comissão de 5% recebida na entrega — a repassar ao PratoPronto'),
      (v_journal_id,2,'platform_commission_revenue',new.restaurant_id,0,v_commission_cents,'Receita de comissão de pedido pago na entrega');
  end if;

  return new;
end;
$$;

drop trigger if exists orders_record_offline_commission on public.orders;
create trigger orders_record_offline_commission
after update of payment_status on public.orders
for each row execute function private.record_offline_order_commission();

revoke all on function private.record_offline_order_commission() from public, anon, authenticated;

commit;