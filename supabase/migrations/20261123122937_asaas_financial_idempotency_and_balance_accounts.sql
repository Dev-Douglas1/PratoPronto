-- Prevent repeated payment webhooks from extending subscription periods twice.
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
  if s.last_payment_id=p_provider_payment_id and s.last_payment_status='RECEIVED' then
    return jsonb_build_object('status',s.status,'duplicate',true);
  end if;
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
        (jid,1,'asaas_balance',s.restaurant_id,p_amount_cents,0,'Mensalidade PratoPronto recebida na conta Asaas'),
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
        (jid,1,'asaas_balance',p.restaurant_id,sp.amount_cents,0,'Comissão do Split Asaas liquidada na carteira da plataforma'),
        (jid,2,'asaas_split_receivable',p.restaurant_id,0,sp.amount_cents,'Baixa do recebível do Split Asaas');
    end if;
  end if;
  return jsonb_build_object('status','done','duplicate',false);
end;
$function$;

revoke all on function public.edge_apply_subscription_payment(text,text,bigint,text,timestamptz) from public,anon,authenticated;
grant execute on function public.edge_apply_subscription_payment(text,text,bigint,text,timestamptz) to service_role;
revoke all on function public.edge_mark_asaas_split_done(text) from public,anon,authenticated;
grant execute on function public.edge_mark_asaas_split_done(text) to service_role;
