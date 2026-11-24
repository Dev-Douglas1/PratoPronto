-- Hosted Asaas credit-card checkout and idempotent order cancellation/refunds.
-- Card data is entered only on the Asaas invoice page; PratoPronto never receives or stores PAN/CVV.
DO $migration$
DECLARE v text; original text;
BEGIN
  SELECT pg_get_functiondef('public.quote_order(text,jsonb,text,text,boolean)'::regprocedure) INTO v;
  original := v;
  v := replace(v, $old$p_method not in ('maquina_entrega','pix')$old$, $new$p_method not in ('maquina_entrega','pix','credit_card')$new$);
  v := replace(v, $old$if p_method='pix' and not exists ($old$, $new$if p_method in ('pix','credit_card') and not exists ($new$);
  v := replace(v, 'Pix online ainda não está habilitado para este restaurante.', 'Pagamento online ainda não está habilitado para este restaurante.');
  IF v = original OR position('if p_method in (''pix'',''credit_card'')' in v)=0 THEN RAISE EXCEPTION 'Não foi possível atualizar quote_order para cartão online.'; END IF;
  EXECUTE v;

  SELECT pg_get_functiondef('public.checkout_order(uuid,uuid)'::regprocedure) INTO v;
  original := v;
  v := replace(v, $old$existing.payment_method='pix' and existing.payment_status<>'paid'$old$, $new$existing.payment_method in ('pix','credit_card') and existing.payment_status<>'paid'$new$);
  v := replace(v, $old$payment_method not in ('maquina_entrega','pix')$old$, $new$payment_method not in ('maquina_entrega','pix','credit_card')$new$);
  v := replace(v, $old$if payment_method='pix' and not exists ($old$, $new$if payment_method in ('pix','credit_card') and not exists ($new$);
  v := replace(v, $old$next_status:=case when payment_method='pix' then 'aguardando_pagamento' else 'confirmado' end;$old$, $new$next_status:=case when payment_method in ('pix','credit_card') then 'aguardando_pagamento' else 'confirmado' end;$new$);
  v := replace(v, $old$next_payment_status:=case when payment_method='pix' then 'pending' else 'pendente_entrega' end;$old$, $new$next_payment_status:=case when payment_method in ('pix','credit_card') then 'pending' else 'pendente_entrega' end;$new$);
  v := replace(v, $old$'modalidade',case when payment_method='pix' then 'pix' else 'debito_credito' end,$old$, $new$'modalidade',case when payment_method='pix' then 'pix' when payment_method='credit_card' then 'cartao_credito' else 'debito_credito' end,$new$);
  v := replace(v, $old$'provedor',case when payment_method='pix' then 'asaas' else 'entrega' end,$old$, $new$'provedor',case when payment_method in ('pix','credit_card') then 'asaas' else 'entrega' end,$new$);
  v := replace(v, $old$case when payment_method='pix' then 'awaiting_payment' else 'none' end$old$, $new$case when payment_method in ('pix','credit_card') then 'awaiting_payment' else 'none' end$new$);
  IF v = original OR position('credit_card' in v)=0 OR position('payment_method in (''pix'',''credit_card'')' in v)=0 THEN RAISE EXCEPTION 'Não foi possível atualizar checkout_order para cartão online.'; END IF;
  EXECUTE v;

  SELECT pg_get_functiondef('public.get_storefront(text)'::regprocedure) INTO v;
  original := v;
  v := replace(v,
    $old$      select 'pix'::text
      where exists (
        select 1 from private.payment_gateway_accounts a
        where a.restaurant_id=rid and a.provider='asaas' and a.environment='production'
          and a.onboarding_status='active' and a.vault_secret_id is not null
      )$old$,
    $new$      select 'pix'::text
      where exists (
        select 1 from private.payment_gateway_accounts a
        where a.restaurant_id=rid and a.provider='asaas' and a.environment='production'
          and a.onboarding_status='active' and a.vault_secret_id is not null
      )
      union all
      select 'credit_card'::text
      where exists (
        select 1 from private.payment_gateway_accounts a
        where a.restaurant_id=rid and a.provider='asaas' and a.environment='production'
          and a.onboarding_status='active' and a.vault_secret_id is not null
      )$new$);
  IF v = original OR position('credit_card' in v)=0 THEN RAISE EXCEPTION 'Não foi possível habilitar cartão no storefront.'; END IF;
  EXECUTE v;

  SELECT pg_get_functiondef('public.edge_prepare_order_payment(uuid,text)'::regprocedure) INTO v;
  original := v;
  v := replace(v, $old$o.payment_method<>'pix' or o.status<>'aguardando_pagamento' or o.payment_status<>'pending'$old$, $new$o.payment_method not in ('pix','credit_card') or o.status<>'aguardando_pagamento' or o.payment_status<>'pending'$new$);
  v := replace(v, 'Pedido não está aguardando pagamento Pix.', 'Pedido não está aguardando pagamento online.');
  v := replace(v, $old$    'pix','pending',o.total_cents,subtotal,fee,500,subtotal,commission,'restaurant'$old$, $new$    case when o.payment_method='credit_card' then 'credit_card' else 'pix' end,'pending',o.total_cents,subtotal,fee,500,subtotal,commission,'restaurant'$new$);
  IF v = original OR position('credit_card' in v)=0 THEN RAISE EXCEPTION 'Não foi possível atualizar edge_prepare_order_payment.'; END IF;
  EXECUTE v;

  SELECT pg_get_functiondef('public.edge_mark_order_paid(text,bigint,bigint)'::regprocedure) INTO v;
  original := v;
  v := replace(v, $old$o.id is null or o.payment_method<>'pix'$old$, $new$o.id is null or o.payment_method not in ('pix','credit_card')$new$);
  v := replace(v, 'Pedido incompatível com pagamento Pix.', 'Pedido incompatível com pagamento online.');
  v := replace(v, 'Receita de comissão do pedido Pix', 'Receita de comissão do pedido online');
  IF v = original OR position('credit_card' in v)=0 THEN RAISE EXCEPTION 'Não foi possível atualizar edge_mark_order_paid.'; END IF;
  EXECUTE v;

  SELECT pg_get_functiondef('public.edge_lookup_asaas_payment(text)'::regprocedure) INTO v;
  original := v;
  v := replace(v, $old$'purpose',p.purpose,'environment',p.environment$old$, $new$'purpose',p.purpose,'method',p.method,'environment',p.environment$new$);
  IF v = original OR position('''method'',p.method' in v)=0 THEN RAISE EXCEPTION 'Não foi possível incluir o método no lookup financeiro.'; END IF;
  EXECUTE v;

  SELECT pg_get_functiondef('public.decide_refund_request(uuid,boolean,text)'::regprocedure) INTO v;
  original := v;
  v := replace(v, $old$new_status:=case when p_approve then 'cancelado_sem_cobranca' else 'recusado' end;$old$,
    $new$new_status:=case
    when not p_approve then 'recusado'
    when o.payment_method in ('pix','credit_card') and o.payment_status='paid' then 'aprovado_aguardando_estorno'
    when o.payment_method in ('pix','credit_card') and o.payment_status in ('pending','awaiting_payment') then 'aprovado_aguardando_cancelamento'
    when o.payment_method='maquina_entrega' and o.payment_status='recebido_entrega' then 'reembolso_manual_pendente'
    else 'cancelado_sem_cobranca'
  end;$new$);
  v := replace(v, $old$return jsonb_build_object('status',new_status);$old$,
    $new$return jsonb_build_object(
    'status',new_status,
    'requiresGatewayAction',new_status in ('aprovado_aguardando_estorno','aprovado_aguardando_cancelamento'),
    'requiresGatewayRefund',new_status='aprovado_aguardando_estorno'
  );$new$);
  v := replace(v, $old$pay_status:=case when o.payment_status='pendente_entrega' then 'cancelado_sem_cobranca' else o.payment_status end;$old$,
    $new$pay_status:=case
      when new_status='aprovado_aguardando_estorno' then 'estorno_em_processamento'
      when new_status='aprovado_aguardando_cancelamento' then 'cancelamento_em_processamento'
      when o.payment_status='pendente_entrega' then 'cancelado_sem_cobranca'
      else o.payment_status
    end;$new$);
  IF v = original OR position('aprovado_aguardando_estorno' in v)=0 OR position('requiresGatewayAction' in v)=0 OR position('pay_status:=case' in v)=0 THEN RAISE EXCEPTION 'Não foi possível atualizar decide_refund_request.'; END IF;
  EXECUTE v;
END
$migration$;

CREATE OR REPLACE FUNCTION public.edge_prepare_asaas_refund(p_order_id uuid,p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE rr public.refund_requests; p private.payments; o public.orders; action text; actor_role text;
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'Acesso restrito ao backend financeiro.' USING errcode='42501';
  END IF;
  SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
  actor_role:=private.restaurant_role(o.restaurant_id,p_actor_id);
  IF actor_role NOT IN ('owner','admin','attendant') THEN RAISE EXCEPTION 'Sem permissão para reprocessar o estorno.'; END IF;
  SELECT * INTO rr FROM public.refund_requests WHERE id=p_order_id FOR UPDATE;
  IF rr.id IS NULL OR rr.status NOT IN (
    'aprovado_aguardando_estorno','aprovado_aguardando_cancelamento',
    'estorno_em_processamento','cancelamento_em_processamento','falha_estorno','falha_cancelamento'
  ) THEN RAISE EXCEPTION 'Solicitação não está aprovada para ação financeira.'; END IF;
  SELECT * INTO p FROM private.payments WHERE order_id=p_order_id AND purpose='order' AND provider='asaas'
    ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF p.id IS NULL THEN
    IF rr.status='aprovado_aguardando_cancelamento' THEN
      UPDATE public.orders SET payment_status='cancelado_sem_cobranca',
        data=jsonb_set(coalesce(data,'{}'::jsonb),'{pagamento,status}','"cancelado_sem_cobranca"'::jsonb,true),
        updated_at=now() WHERE id=p_order_id;
      UPDATE public.refund_requests SET status='cancelado_sem_cobranca',
        data=coalesce(data,'{}'::jsonb)||jsonb_build_object('status','cancelado_sem_cobranca','estornoEm',now()),updated_at=now()
      WHERE id=p_order_id;
      RETURN jsonb_build_object('noPayment',true,'status','cancelado_sem_cobranca');
    END IF;
    RAISE EXCEPTION 'Pagamento Asaas não encontrado para o pedido.';
  END IF;
  IF p.status='refunded' THEN
    UPDATE public.refund_requests SET status='reembolsado',
      data=coalesce(data,'{}'::jsonb)||jsonb_build_object('status','reembolsado','estornoEm',coalesce(p.refunded_at,now())),updated_at=now()
    WHERE id=p_order_id;
    RETURN jsonb_build_object('alreadyRefunded',true,'status','reembolsado');
  END IF;
  IF p.provider_payment_id IS NULL THEN RETURN jsonb_build_object('inProgress',true,'status','aguardando_referencia'); END IF;
  IF p.metadata->>'refundStatus' IN ('initiated','processing') THEN
    RETURN jsonb_build_object('inProgress',true,'providerPaymentId',p.provider_payment_id,
      'restaurantId',p.restaurant_id,'environment',p.environment,'action',p.metadata->>'refundAction');
  END IF;
  IF p.status IN ('failed','cancelled') THEN
    UPDATE public.orders SET payment_status='cancelado_sem_cobranca',
      data=jsonb_set(coalesce(data,'{}'::jsonb),'{pagamento,status}','"cancelado_sem_cobranca"'::jsonb,true),
      updated_at=now() WHERE id=p_order_id;
    UPDATE public.refund_requests SET status='cancelado_sem_cobranca',
      data=coalesce(data,'{}'::jsonb)||jsonb_build_object('status','cancelado_sem_cobranca','estornoEm',now()),updated_at=now()
    WHERE id=p_order_id;
    RETURN jsonb_build_object('noPayment',true,'status','cancelado_sem_cobranca');
  END IF;
  IF p.status IN ('paid','partially_refunded') THEN action:='refund';
  ELSIF p.status IN ('pending','awaiting_payment','authorized') THEN action:='cancel';
  ELSE RAISE EXCEPTION 'Status do pagamento não permite cancelamento ou estorno automático.'; END IF;
  UPDATE private.payments SET metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
    'refundStatus','initiated','refundAction',action,'refundStartedAt',now()
  ),updated_at=now() WHERE id=p.id;
  RETURN jsonb_build_object('paymentId',p.id,'providerPaymentId',p.provider_payment_id,
    'restaurantId',p.restaurant_id,'environment',p.environment,'action',action,
    'amountCents',p.gross_amount_cents,'reason',coalesce(rr.data->>'motivo','Solicitação de cancelamento do cliente'),
    'inProgress',false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.edge_finalize_asaas_refund(
  p_order_id uuid,p_provider_status text,p_provider_reference text DEFAULT NULL,p_error text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE p private.payments; sp private.payment_splits; jid uuid; credit_account text; request_status text;
BEGIN
  IF coalesce(auth.jwt()->>'role','') <> 'service_role' THEN
    RAISE EXCEPTION 'Acesso restrito ao backend financeiro.' USING errcode='42501';
  END IF;
  IF p_provider_status NOT IN ('refunded','processing','failed','cancelled') THEN RAISE EXCEPTION 'Status de estorno inválido.'; END IF;
  SELECT * INTO p FROM private.payments WHERE order_id=p_order_id AND purpose='order' AND provider='asaas'
    ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Pagamento não encontrado.'; END IF;

  IF p_provider_status='refunded' THEN
    IF p.status='refunded' THEN RETURN jsonb_build_object('status','reembolsado','duplicate',true); END IF;
    UPDATE private.payments SET status='refunded',refunded_at=now(),
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('refundStatus','refunded',
        'refundProviderReference',p_provider_reference,'refundCompletedAt',now()),updated_at=now()
    WHERE id=p.id;
    UPDATE public.orders SET payment_status='refunded',
      data=jsonb_set(jsonb_set(coalesce(data,'{}'::jsonb),'{pagamento,status}','"refunded"'::jsonb,true),
        '{pagamento,estornadoEm}',to_jsonb(now()),true),updated_at=now()
    WHERE id=p_order_id;
    UPDATE public.refund_requests SET status='reembolsado',
      data=coalesce(data,'{}'::jsonb)||jsonb_build_object('status','reembolsado','estornoEm',now(),'referenciaEstorno',p_provider_reference),
      updated_at=now() WHERE id=p_order_id;
    SELECT * INTO sp FROM private.payment_splits WHERE payment_id=p.id AND recipient_type='platform' FOR UPDATE;
    IF p.platform_commission_cents>0 AND sp.id IS NOT NULL THEN
      credit_account:=CASE WHEN sp.status='done' THEN 'platform_cash' ELSE 'asaas_split_receivable' END;
      INSERT INTO private.financial_journals(event_type,source_type,source_id,idempotency_key,metadata)
      VALUES('payment_refunded','payment',p.id::text,'asaas-refund:'||p.id::text,
        jsonb_build_object('orderId',p_order_id,'providerPaymentId',p.provider_payment_id,'amountCents',p.gross_amount_cents))
      ON CONFLICT(idempotency_key) DO NOTHING RETURNING id INTO jid;
      IF jid IS NOT NULL THEN
        INSERT INTO private.financial_ledger(journal_id,line_no,account_code,restaurant_id,debit_cents,credit_cents,description)
        VALUES
          (jid,1,'platform_commission_revenue',p.restaurant_id,p.platform_commission_cents,0,'Estorno da comissão do pedido'),
          (jid,2,credit_account,p.restaurant_id,0,p.platform_commission_cents,'Reversão da comissão após estorno Asaas');
      END IF;
      UPDATE private.payment_splits SET status='reversed',reversed_at=now(),updated_at=now() WHERE id=sp.id AND status IN ('pending','awaiting_credit','done');
    END IF;
    INSERT INTO public.order_events(order_id,data)
    VALUES(p_order_id,jsonb_build_object('status','cancelado','kind','payment_refunded','provider','asaas','at',now()));
    RETURN jsonb_build_object('status','reembolsado','duplicate',false);
  ELSIF p_provider_status='processing' THEN
    request_status:=CASE WHEN p.metadata->>'refundAction'='cancel' THEN 'cancelamento_em_processamento' ELSE 'estorno_em_processamento' END;
    UPDATE private.payments SET metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'refundStatus','processing','refundProviderReference',p_provider_reference),updated_at=now() WHERE id=p.id;
    UPDATE public.refund_requests SET status=request_status,
      data=coalesce(data,'{}'::jsonb)||jsonb_build_object('status',request_status,'estornoAtualizadoEm',now()),updated_at=now()
    WHERE id=p_order_id;
    UPDATE public.orders SET payment_status=request_status,
      data=jsonb_set(coalesce(data,'{}'::jsonb),'{pagamento,status}',to_jsonb(request_status),true),updated_at=now()
    WHERE id=p_order_id;
    RETURN jsonb_build_object('status',request_status);
  ELSIF p_provider_status='failed' THEN
    request_status:=CASE WHEN p.metadata->>'refundAction'='cancel' THEN 'falha_cancelamento' ELSE 'falha_estorno' END;
    UPDATE private.payments SET metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'refundStatus','failed','refundError',left(coalesce(p_error,'Falha no provedor.'),500)),updated_at=now()
    WHERE id=p.id;
    UPDATE public.refund_requests SET status=request_status,
      data=coalesce(data,'{}'::jsonb)||jsonb_build_object('status',request_status,'erroEstorno',left(coalesce(p_error,''),500)),updated_at=now()
    WHERE id=p_order_id;
    UPDATE public.orders SET payment_status=request_status,
      data=jsonb_set(coalesce(data,'{}'::jsonb),'{pagamento,status}',to_jsonb(request_status),true),updated_at=now()
    WHERE id=p_order_id;
    RETURN jsonb_build_object('status',request_status);
  ELSE
    UPDATE private.payments SET status='cancelled',
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('refundStatus','cancelled','refundProviderReference',p_provider_reference),
      updated_at=now() WHERE id=p.id;
    UPDATE public.orders SET payment_status='cancelado_sem_cobranca',
      data=jsonb_set(coalesce(data,'{}'::jsonb),'{pagamento,status}','"cancelado_sem_cobranca"'::jsonb,true),
      updated_at=now() WHERE id=p_order_id;
    UPDATE public.refund_requests SET status='cancelado_sem_cobranca',
      data=coalesce(data,'{}'::jsonb)||jsonb_build_object('status','cancelado_sem_cobranca','cancelamentoEm',now()),updated_at=now()
    WHERE id=p_order_id;
    RETURN jsonb_build_object('status','cancelado_sem_cobranca');
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.confirm_manual_refund(p_order_id uuid,p_proof text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO ''
AS $function$
DECLARE uid uuid:=auth.uid(); o public.orders; rr public.refund_requests; actor_role text;
BEGIN
  PERFORM private.enforce_rate_limit('orders.refund_manual_confirm',20,60);
  SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
  actor_role:=private.restaurant_role(o.restaurant_id,uid);
  IF actor_role NOT IN ('owner','admin','attendant') THEN RAISE EXCEPTION 'Sem permissão para registrar a devolução.'; END IF;
  SELECT * INTO rr FROM public.refund_requests WHERE id=p_order_id FOR UPDATE;
  IF rr.id IS NULL OR rr.status<>'reembolso_manual_pendente' THEN
    RAISE EXCEPTION 'Esta solicitação não aguarda comprovante de devolução manual.';
  END IF;
  IF char_length(trim(coalesce(p_proof,'')))<3 OR char_length(trim(p_proof))>500 THEN
    RAISE EXCEPTION 'Informe uma referência válida do comprovante.';
  END IF;
  UPDATE public.refund_requests SET status='reembolsado_manual',
    data=coalesce(data,'{}'::jsonb)||jsonb_build_object('status','reembolsado_manual','comprovante',trim(p_proof),'devolvidoPor',uid,'devolvidoEm',now()),
    updated_at=now() WHERE id=p_order_id;
  UPDATE public.orders SET payment_status='reembolsado_manual',
    data=jsonb_set(coalesce(data,'{}'::jsonb),'{pagamento,status}','"reembolsado_manual"'::jsonb,true),
    updated_at=now() WHERE id=p_order_id;
  RETURN jsonb_build_object('status','reembolsado_manual');
END;
$function$;

REVOKE ALL ON FUNCTION public.edge_prepare_asaas_refund(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.edge_finalize_asaas_refund(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.edge_prepare_asaas_refund(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.edge_finalize_asaas_refund(uuid,text,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.confirm_manual_refund(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.confirm_manual_refund(uuid,text) TO authenticated,service_role;
