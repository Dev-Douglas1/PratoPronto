
create or replace function public.submit_refund_request(p_order_id uuid,p_reason text)
returns boolean language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); o public.orders;
begin
  select * into o from public.orders where id=p_order_id;
  if o.id is null or o.user_id<>uid then raise exception 'Pedido não encontrado.'; end if;
  if char_length(trim(p_reason))<5 or char_length(trim(p_reason))>500 then raise exception 'Explique o problema em até 500 caracteres.'; end if;
  insert into public.refund_requests(id,user_id,restaurant_id,status,data,updated_at)
  values(o.id,uid,o.restaurant_id,'pendente',jsonb_build_object('orderId',o.id,'userId',uid,'motivo',trim(p_reason),'status','pendente'),now())
  on conflict(id) do nothing;
  return true;
end $$;
revoke all on function public.submit_refund_request(uuid,text) from public;
grant execute on function public.submit_refund_request(uuid,text) to authenticated;

create or replace function public.decide_refund_request(p_order_id uuid,p_approve boolean,p_answer text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); o public.orders; rr public.refund_requests; actor_role text; new_status text; pay_status text;
begin
  select * into o from public.orders where id=p_order_id for update;
  if o.id is null then raise exception 'Pedido não encontrado.'; end if;
  actor_role:=private.restaurant_role(o.restaurant_id,uid);
  if actor_role not in ('owner','admin','attendant') then raise exception 'Sem permissão para responder.'; end if;
  select * into rr from public.refund_requests where id=p_order_id for update;
  if rr.id is null or rr.status<>'pendente' then raise exception 'Esta solicitação já foi analisada.'; end if;
  if char_length(trim(p_answer))<3 or char_length(trim(p_answer))>1000 then raise exception 'Escreva uma resposta válida.'; end if;
  new_status:=case when p_approve then 'cancelado_sem_cobranca' else 'recusado' end;
  update public.refund_requests set status=new_status,
    data=data||jsonb_build_object('status',new_status,'resposta',trim(p_answer),'respondidoPor',uid,'respondidoEm',now()),updated_at=now()
  where id=p_order_id;
  if p_approve then
    pay_status:=case when o.payment_status='pendente_entrega' then 'cancelado_sem_cobranca' else o.payment_status end;
    update public.orders set status='cancelado',payment_status=pay_status,
      data=jsonb_set(jsonb_set(data,'{status}','"cancelado"'::jsonb,true),'{pagamento,status}',to_jsonb(pay_status),true),updated_at=now()
    where id=p_order_id;
  end if;
  return jsonb_build_object('status',new_status);
end $$;
revoke all on function public.decide_refund_request(uuid,boolean,text) from public;
grant execute on function public.decide_refund_request(uuid,boolean,text) to authenticated;

create or replace function public.submit_order_review(p_order_id uuid,p_food int,p_delivery int,p_comment text default '')
returns boolean language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); o public.orders; prof public.profiles;
begin
  select * into o from public.orders where id=p_order_id;
  if o.id is null or o.user_id<>uid or o.status<>'entregue' then raise exception 'Este pedido ainda não pode ser avaliado.'; end if;
  if p_food not between 1 and 5 or p_delivery not between 1 and 5 then raise exception 'Escolha notas de 1 a 5.'; end if;
  if char_length(coalesce(p_comment,''))>1000 then raise exception 'Comentário muito longo.'; end if;
  select * into prof from public.profiles where id=uid;
  insert into public.reviews(id,user_id,restaurant_id,data,updated_at)
  values(o.id,uid,o.restaurant_id,jsonb_build_object('orderId',o.id,'userId',uid,'nome',prof.nome,'notaComida',p_food,'notaEntrega',p_delivery,'comentario',coalesce(p_comment,''),'createdAt',now()),now());
  return true;
end $$;
revoke all on function public.submit_order_review(uuid,int,int,text) from public;
grant execute on function public.submit_order_review(uuid,int,int,text) to authenticated;

create or replace function public.reply_order_review(p_order_id uuid,p_answer text)
returns boolean language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); rv public.reviews; actor_role text;
begin
  select * into rv from public.reviews where id=p_order_id for update;
  if rv.id is null then raise exception 'Avaliação não encontrada.'; end if;
  actor_role:=private.restaurant_role(rv.restaurant_id,uid);
  if actor_role not in ('owner','admin','attendant') then raise exception 'Sem permissão para responder.'; end if;
  if char_length(trim(p_answer))<3 or char_length(trim(p_answer))>1000 then raise exception 'Resposta inválida.'; end if;
  update public.reviews set data=data||jsonb_build_object('resposta',trim(p_answer),'respondidoPor',uid,'respondidoEm',now()),updated_at=now()
  where id=p_order_id;
  return true;
end $$;
revoke all on function public.reply_order_review(uuid,text) from public;
grant execute on function public.reply_order_review(uuid,text) to authenticated;

create or replace function public.save_pilot_profile(p_display_name text,p_vehicle_type text,p_city text,p_accepting boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin
  if not private.verified(uid) then raise exception 'Confirme seu e-mail.'; end if;
  if char_length(trim(p_display_name))<2 or char_length(trim(p_display_name))>100 then raise exception 'Nome do piloto inválido.'; end if;
  if p_vehicle_type not in ('moto','carro','bicicleta','outro') then raise exception 'Veículo inválido.'; end if;
  insert into public.pilot_profiles(profile_id,display_name,vehicle_type,city,accepting_offers,updated_at)
  values(uid,trim(p_display_name),p_vehicle_type,left(trim(p_city),100),p_accepting,now())
  on conflict(profile_id) do update set display_name=excluded.display_name,vehicle_type=excluded.vehicle_type,city=excluded.city,accepting_offers=excluded.accepting_offers,updated_at=now();
  return jsonb_build_object('profileId',uid,'displayName',trim(p_display_name),'vehicleType',p_vehicle_type,'city',trim(p_city),'acceptingOffers',p_accepting);
end $$;
revoke all on function public.save_pilot_profile(text,text,text,boolean) from public;
grant execute on function public.save_pilot_profile(text,text,text,boolean) to authenticated;

create or replace function public.create_order_delivery_offer(p_order_id uuid,p_pilot_profile_id uuid default null,p_pilot_contact_id uuid default null,p_message text default '')
returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); o public.orders; actor_role text; offer_id uuid;
begin
  select * into o from public.orders where id=p_order_id for update;
  if o.id is null then raise exception 'Pedido não encontrado.'; end if;
  actor_role:=private.restaurant_role(o.restaurant_id,uid);
  if actor_role not in ('owner','admin','attendant') then raise exception 'Sem permissão para oferecer a entrega.'; end if;
  if o.status not in ('confirmado','preparando','pronto') then raise exception 'A entrega não pode mais ser oferecida.'; end if;
  if p_pilot_profile_id is null and p_pilot_contact_id is null then raise exception 'Selecione um piloto ou contato.'; end if;
  if p_pilot_profile_id is not null and not exists(select 1 from public.pilot_profiles pp where pp.profile_id=p_pilot_profile_id and pp.accepting_offers=true) then raise exception 'Piloto indisponível.'; end if;
  if p_pilot_contact_id is not null and not exists(select 1 from public.restaurant_pilot_contacts c where c.id=p_pilot_contact_id and c.restaurante_id=o.restaurant_id and c.active=true) then raise exception 'Contato de piloto inválido.'; end if;
  insert into public.order_delivery_offers(order_id,restaurant_id,pilot_profile_id,pilot_contact_id,offered_by,message,expires_at)
  values(o.id,o.restaurant_id,p_pilot_profile_id,p_pilot_contact_id,uid,left(coalesce(p_message,''),500),now()+interval '15 minutes') returning id into offer_id;
  update public.orders set delivery_status='offered',updated_at=now() where id=o.id;
  insert into public.order_events(order_id,data) values(o.id,jsonb_build_object('status',o.status,'kind','delivery_offered','by',uid,'offerId',offer_id,'at',now()));
  return offer_id;
end $$;
revoke all on function public.create_order_delivery_offer(uuid,uuid,uuid,text) from public;
grant execute on function public.create_order_delivery_offer(uuid,uuid,uuid,text) to authenticated;

create or replace function public.respond_order_delivery_offer(p_offer_id uuid,p_accept boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); off public.order_delivery_offers; claimed uuid;
begin
  select * into off from public.order_delivery_offers where id=p_offer_id for update;
  if off.id is null or off.pilot_profile_id<>uid then raise exception 'Esta oferta não pertence a você.'; end if;
  if off.status<>'pending' then raise exception 'Esta oferta já foi respondida.'; end if;
  if off.expires_at is not null and off.expires_at<=now() then
    update public.order_delivery_offers set status='expired',responded_at=now() where id=off.id;
    raise exception 'Esta oferta expirou.';
  end if;
  if p_accept then
    update public.orders set assigned_pilot_id=uid,delivery_status='accepted',updated_at=now()
      where id=off.order_id and assigned_pilot_id is null and status in ('confirmado','preparando','pronto') returning id into claimed;
    if claimed is null then raise exception 'Outro piloto já ficou com esta entrega.'; end if;
    update public.order_delivery_offers set status='accepted',responded_at=now() where id=off.id;
    update public.order_delivery_offers set status='cancelled',responded_at=now() where order_id=off.order_id and id<>off.id and status='pending';
  else
    update public.order_delivery_offers set status='rejected',responded_at=now() where id=off.id;
  end if;
  return jsonb_build_object('status',case when p_accept then 'accepted' else 'rejected' end,'orderId',off.order_id);
end $$;
revoke all on function public.respond_order_delivery_offer(uuid,boolean) from public;
grant execute on function public.respond_order_delivery_offer(uuid,boolean) to authenticated;

create or replace function public.pilot_start_delivery(p_order_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); o public.orders;
begin
  select * into o from public.orders where id=p_order_id for update;
  if o.id is null or o.assigned_pilot_id<>uid then raise exception 'Este pedido não está atribuído a você.'; end if;
  if o.status<>'pronto' then raise exception 'O pedido precisa estar pronto.'; end if;
  update public.orders set status='saiu_entrega',delivery_status='picked_up',data=jsonb_set(data,'{status}','"saiu_entrega"'::jsonb,true),updated_at=now() where id=o.id;
  insert into public.order_events(order_id,data) values(o.id,jsonb_build_object('status','saiu_entrega','kind','pilot_started','by',uid,'at',now()));
  return jsonb_build_object('status','saiu_entrega');
end $$;
revoke all on function public.pilot_start_delivery(uuid) from public;
grant execute on function public.pilot_start_delivery(uuid) to authenticated;

create or replace function public.pilot_confirm_delivery(p_order_id uuid,p_code text,p_received boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); o public.orders; secret public.delivery_secrets; expected text; new_pay text;
begin
  select * into o from public.orders where id=p_order_id for update;
  if o.id is null or o.assigned_pilot_id<>uid then raise exception 'Este pedido não está atribuído a você.'; end if;
  if o.status<>'saiu_entrega' then raise exception 'Este pedido não está em rota.'; end if;
  select * into secret from public.delivery_secrets where order_id=o.id;
  expected:=encode(digest(o.id::text||':'||trim(p_code),'sha256'),'hex');
  if secret.order_id is null or expected<>secret.code_hash then raise exception 'Senha de entrega incorreta.'; end if;
  if o.payment_status='pendente_entrega' and not p_received then raise exception 'Confirme o recebimento do pagamento.'; end if;
  new_pay:=case when o.payment_status='pendente_entrega' then 'recebido_entrega' else o.payment_status end;
  update public.orders set status='entregue',delivery_status='delivered',payment_status=new_pay,
    data=jsonb_set(jsonb_set(data,'{status}','"entregue"'::jsonb,true),'{pagamento,status}',to_jsonb(new_pay),true),updated_at=now() where id=o.id;
  delete from public.delivery_secrets where order_id=o.id;
  insert into public.order_events(order_id,data) values(o.id,jsonb_build_object('status','entregue','kind','pilot_confirmed','by',uid,'at',now()));
  return jsonb_build_object('status','entregue');
end $$;
revoke all on function public.pilot_confirm_delivery(uuid,text,boolean) from public;
grant execute on function public.pilot_confirm_delivery(uuid,text,boolean) to authenticated;

create or replace function public.request_account_deletion()
returns boolean language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin
  if uid is null then raise exception 'Entre na conta.'; end if;
  if exists(select 1 from public.restaurant_members rm where rm.profile_id=uid and rm.role='owner' and rm.active=true) then
    raise exception 'Transfira a propriedade das empresas antes de excluir sua conta.';
  end if;
  insert into public.privacy_requests(user_id,status,data,updated_at)
  values(uid,'pendente','{}'::jsonb,now())
  on conflict(user_id) do update set status='pendente',updated_at=now();
  return true;
end $$;
revoke all on function public.request_account_deletion() from public;
grant execute on function public.request_account_deletion() to authenticated;
