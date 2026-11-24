
create or replace function public.create_order_delivery_offer(
  p_order_id uuid,
  p_pilot_profile_id uuid default null,
  p_pilot_contact_id uuid default null,
  p_message text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid:=auth.uid(); o public.orders; actor_role text; offer_id uuid;
begin
  select * into o from public.orders where id=p_order_id for update;
  if o.id is null then raise exception 'Pedido não encontrado.'; end if;
  actor_role:=private.restaurant_role(o.restaurant_id,uid);
  if actor_role not in ('owner','admin','attendant') then raise exception 'Sem permissão para oferecer a entrega.'; end if;
  if o.status not in ('confirmado','preparando','pronto') then raise exception 'A entrega não pode mais ser oferecida.'; end if;
  if p_pilot_profile_id is null and p_pilot_contact_id is null then raise exception 'Selecione um piloto ou contato.'; end if;

  if p_pilot_profile_id is not null and not exists(
    select 1 from public.pilot_profiles pp
    where pp.profile_id=p_pilot_profile_id
      and pp.accepting_offers=true
      and pp.approval_status='approved'
  ) then
    raise exception 'Piloto indisponível ou ainda não aprovado.';
  end if;

  if p_pilot_contact_id is not null and not exists(
    select 1 from public.restaurant_pilot_contacts c
    where c.id=p_pilot_contact_id and c.restaurante_id=o.restaurant_id and c.active=true
  ) then
    raise exception 'Contato de piloto inválido.';
  end if;

  insert into public.order_delivery_offers(order_id,restaurant_id,pilot_profile_id,pilot_contact_id,offered_by,message,expires_at)
  values(o.id,o.restaurant_id,p_pilot_profile_id,p_pilot_contact_id,uid,left(coalesce(p_message,''),500),now()+interval '15 minutes')
  returning id into offer_id;

  update public.orders set delivery_status='offered',updated_at=now() where id=o.id;
  insert into public.order_events(order_id,data)
  values(o.id,jsonb_build_object('status',o.status,'kind','delivery_offered','by',uid,'offerId',offer_id,'at',now()));
  return offer_id;
end
$$;

create or replace function public.respond_order_delivery_offer(p_offer_id uuid, p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid:=auth.uid(); off public.order_delivery_offers; claimed uuid;
begin
  select * into off from public.order_delivery_offers where id=p_offer_id for update;
  if off.id is null or off.pilot_profile_id<>uid then raise exception 'Esta oferta não pertence a você.'; end if;
  if off.status<>'pending' then raise exception 'Esta oferta já foi respondida.'; end if;
  if not exists(
    select 1 from public.pilot_profiles pp
    where pp.profile_id=uid and pp.approval_status='approved' and pp.accepting_offers=true
  ) then
    raise exception 'Seu cadastro de piloto não está aprovado ou está indisponível.';
  end if;
  if off.expires_at is not null and off.expires_at<=now() then
    update public.order_delivery_offers set status='expired',responded_at=now() where id=off.id;
    raise exception 'Esta oferta expirou.';
  end if;

  if p_accept then
    update public.orders set assigned_pilot_id=uid,delivery_status='accepted',updated_at=now()
      where id=off.order_id and assigned_pilot_id is null and status in ('confirmado','preparando','pronto')
      returning id into claimed;
    if claimed is null then raise exception 'Outro piloto já ficou com esta entrega.'; end if;
    update public.order_delivery_offers set status='accepted',responded_at=now() where id=off.id;
    update public.order_delivery_offers set status='cancelled',responded_at=now()
      where order_id=off.order_id and id<>off.id and status='pending';
  else
    update public.order_delivery_offers set status='rejected',responded_at=now() where id=off.id;
  end if;
  return jsonb_build_object('status',case when p_accept then 'accepted' else 'rejected' end,'orderId',off.order_id);
end
$$;

create or replace function public.pilot_start_delivery(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid:=auth.uid(); o public.orders;
begin
  if not exists(
    select 1 from public.pilot_profiles pp
    where pp.profile_id=uid and pp.approval_status='approved'
  ) then raise exception 'Seu cadastro de piloto não está aprovado.'; end if;

  select * into o from public.orders where id=p_order_id for update;
  if o.id is null or o.assigned_pilot_id<>uid then raise exception 'Este pedido não está atribuído a você.'; end if;
  if o.status<>'pronto' then raise exception 'O pedido precisa estar pronto.'; end if;

  update public.orders set status='saiu_entrega',delivery_status='picked_up',
    data=jsonb_set(data,'{status}','"saiu_entrega"'::jsonb,true),updated_at=now()
  where id=o.id;
  insert into public.order_events(order_id,data)
  values(o.id,jsonb_build_object('status','saiu_entrega','kind','pilot_started','by',uid,'at',now()));
  return jsonb_build_object('status','saiu_entrega');
end
$$;

create or replace function public.pilot_confirm_delivery(p_order_id uuid, p_code text, p_received boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid:=auth.uid(); o public.orders; secret public.delivery_secrets; expected text; new_pay text;
begin
  if not exists(
    select 1 from public.pilot_profiles pp
    where pp.profile_id=uid and pp.approval_status='approved'
  ) then raise exception 'Seu cadastro de piloto não está aprovado.'; end if;

  select * into o from public.orders where id=p_order_id for update;
  if o.id is null or o.assigned_pilot_id<>uid then raise exception 'Este pedido não está atribuído a você.'; end if;
  if o.status<>'saiu_entrega' then raise exception 'Este pedido não está em rota.'; end if;

  select * into secret from public.delivery_secrets where order_id=o.id;
  expected:=encode(digest(o.id::text||':'||trim(p_code),'sha256'),'hex');
  if secret.order_id is null or expected<>secret.code_hash then raise exception 'Senha de entrega incorreta.'; end if;
  if o.payment_status='pendente_entrega' and not p_received then raise exception 'Confirme o recebimento do pagamento.'; end if;

  new_pay:=case when o.payment_status='pendente_entrega' then 'recebido_entrega' else o.payment_status end;
  update public.orders set status='entregue',delivery_status='delivered',payment_status=new_pay,
    data=jsonb_set(jsonb_set(data,'{status}','"entregue"'::jsonb,true),'{pagamento,status}',to_jsonb(new_pay),true),
    updated_at=now()
  where id=o.id;
  delete from public.delivery_secrets where order_id=o.id;
  insert into public.order_events(order_id,data)
  values(o.id,jsonb_build_object('status','entregue','kind','pilot_confirmed','by',uid,'at',now()));
  return jsonb_build_object('status','entregue');
end
$$;
