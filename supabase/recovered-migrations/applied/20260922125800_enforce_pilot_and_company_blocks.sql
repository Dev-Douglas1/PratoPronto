
create or replace function public.list_available_pilots()
returns table(
  profile_id uuid,
  display_name text,
  vehicle_type text,
  city text,
  accepting_offers boolean,
  motorcycle_type text,
  vehicle_color text
)
language sql
stable
security definer
set search_path=''
as $$
  select pp.profile_id,pp.display_name,pp.vehicle_type,pp.city,
         pp.accepting_offers,pp.motorcycle_type,pp.vehicle_color
  from public.pilot_profiles pp
  where pp.accepting_offers=true
    and pp.approval_status='approved'
    and pp.account_status='active'
  order by pp.display_name
  limit 100
$$;
revoke all on function public.list_available_pilots() from public;
grant execute on function public.list_available_pilots() to authenticated;

create or replace function public.set_pilot_availability(p_accepting boolean)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare uid uuid:=auth.uid(); pp public.pilot_profiles;
begin
  perform private.enforce_rate_limit('pilot.availability',30,60);
  select * into pp from public.pilot_profiles where profile_id=uid for update;
  if pp.profile_id is null then raise exception 'Cadastro de piloto não encontrado.'; end if;
  if pp.approval_status<>'approved' then raise exception 'Seu cadastro precisa estar aprovado para receber ofertas.'; end if;
  if pp.account_status<>'active' then raise exception 'Seu acesso como Piloto Parceiro está suspenso ou bloqueado.'; end if;

  update public.pilot_profiles
  set accepting_offers=coalesce(p_accepting,false),updated_at=now()
  where profile_id=uid;

  return jsonb_build_object('accepting_offers',coalesce(p_accepting,false));
end
$$;
revoke all on function public.set_pilot_availability(boolean) from public;
grant execute on function public.set_pilot_availability(boolean) to authenticated;

create or replace function public.create_order_delivery_offer(
  p_order_id uuid,
  p_pilot_profile_id uuid default null,
  p_pilot_contact_id uuid default null,
  p_message text default ''
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare uid uuid:=auth.uid(); o public.orders; actor_role text; offer_id uuid;
begin
  perform private.enforce_rate_limit('delivery.offer',30,60);
  select * into o from public.orders where id=p_order_id for update;
  if o.id is null then raise exception 'Pedido não encontrado.'; end if;
  actor_role:=private.restaurant_role(o.restaurant_id,uid);
  if actor_role not in ('owner','admin','attendant') then raise exception 'Sem permissão para oferecer a entrega.'; end if;
  if o.status not in ('confirmado','preparando','pronto') then raise exception 'A entrega não pode mais ser oferecida.'; end if;
  if p_pilot_profile_id is null and p_pilot_contact_id is null then raise exception 'Selecione um piloto ou contato.'; end if;

  if p_pilot_profile_id is not null and not private.pilot_available(p_pilot_profile_id) then
    raise exception 'Piloto indisponível, bloqueado ou ainda não aprovado.';
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

create or replace function public.respond_order_delivery_offer(p_offer_id uuid,p_accept boolean)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare uid uuid:=auth.uid(); off public.order_delivery_offers; claimed uuid;
begin
  perform private.enforce_rate_limit('delivery.offer_response',60,60);
  select * into off from public.order_delivery_offers where id=p_offer_id for update;
  if off.id is null or off.pilot_profile_id<>uid then raise exception 'Esta oferta não pertence a você.'; end if;
  if off.status<>'pending' then raise exception 'Esta oferta já foi respondida.'; end if;
  if not private.pilot_available(uid) then
    raise exception 'Seu cadastro de piloto não está aprovado, está indisponível ou foi bloqueado.';
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

  return jsonb_build_object(
    'status',case when p_accept then 'accepted' else 'rejected' end,
    'orderId',off.order_id
  );
end
$$;

create or replace function public.pilot_start_delivery(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare uid uuid:=auth.uid(); o public.orders;
begin
  perform private.enforce_rate_limit('delivery.start',20,60);
  if not private.pilot_operational(uid) then
    raise exception 'Seu cadastro de piloto não está aprovado ou seu acesso está bloqueado.';
  end if;

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

create or replace function public.pilot_confirm_delivery(
  p_order_id uuid,
  p_code text,
  p_received boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare uid uuid:=auth.uid(); o public.orders; secret public.delivery_secrets; expected text; new_pay text;
begin
  perform private.enforce_rate_limit('delivery.confirm',20,60);
  if not private.pilot_operational(uid) then
    raise exception 'Seu cadastro de piloto não está aprovado ou seu acesso está bloqueado.';
  end if;

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

create or replace function public.save_pilot_profile(
  p_vehicle_plate text,
  p_motorcycle_type text,
  p_vehicle_color text,
  p_accepting boolean
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  uid uuid:=auth.uid();
  prof public.profiles;
  current_row public.pilot_profiles;
  normalized_plate text:=upper(regexp_replace(coalesce(p_vehicle_plate,''),'[^A-Za-z0-9]','','g'));
  moto_type text:=trim(coalesce(p_motorcycle_type,''));
  moto_color text:=trim(coalesce(p_vehicle_color,''));
  next_status text:='draft';
  operational boolean:=true;
begin
  perform private.enforce_rate_limit('pilot.profile',10,600);
  if not private.verified(uid) then raise exception 'Confirme seu e-mail antes de se cadastrar como piloto.'; end if;
  select * into prof from public.profiles where id=uid;
  if prof.id is null then raise exception 'Complete seu perfil antes de se cadastrar como piloto.'; end if;
  if char_length(trim(coalesce(prof.nome,'')))<2 then raise exception 'Complete seu nome no perfil.'; end if;
  if char_length(trim(coalesce(prof.telefone,'')))<10 then raise exception 'Complete seu telefone no perfil.'; end if;
  if char_length(trim(coalesce(prof.cidade,'')))<2 then raise exception 'Complete sua cidade no perfil.'; end if;
  if normalized_plate !~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$' then raise exception 'Informe uma placa válida, como ABC1D23.'; end if;
  if char_length(moto_type)<2 or char_length(moto_type)>60 then raise exception 'Informe o tipo ou modelo da moto.'; end if;
  if char_length(moto_color)<2 or char_length(moto_color)>40 then raise exception 'Informe a cor da moto.'; end if;

  select * into current_row from public.pilot_profiles where profile_id=uid;
  if current_row.profile_id is not null then
    operational:=current_row.account_status='active';
    if current_row.vehicle_plate=normalized_plate
       and current_row.motorcycle_type=moto_type
       and current_row.vehicle_color=moto_color
       and current_row.approval_status='approved'
    then next_status:='approved';
    elsif current_row.submitted_at is not null then
      next_status:='pending';
    end if;
  end if;

  insert into public.pilot_profiles(
    profile_id,display_name,vehicle_type,city,accepting_offers,
    vehicle_plate,motorcycle_type,vehicle_color,approval_status,updated_at
  )
  values(
    uid,trim(prof.nome),'moto',trim(prof.cidade),
    case when next_status='approved' and operational then coalesce(p_accepting,true) else false end,
    normalized_plate,moto_type,moto_color,next_status,now()
  )
  on conflict(profile_id) do update set
    display_name=excluded.display_name,
    vehicle_type='moto',
    city=excluded.city,
    accepting_offers=case
      when public.pilot_profiles.account_status='active' then excluded.accepting_offers
      else false
    end,
    vehicle_plate=excluded.vehicle_plate,
    motorcycle_type=excluded.motorcycle_type,
    vehicle_color=excluded.vehicle_color,
    approval_status=excluded.approval_status,
    rejection_reason=case when excluded.approval_status='approved' then public.pilot_profiles.rejection_reason else '' end,
    reviewed_at=case when excluded.approval_status='approved' then public.pilot_profiles.reviewed_at else null end,
    reviewed_by=case when excluded.approval_status='approved' then public.pilot_profiles.reviewed_by else null end,
    updated_at=now();

  return jsonb_build_object(
    'profile_id',uid,'display_name',trim(prof.nome),'vehicle_type','moto','city',trim(prof.cidade),
    'accepting_offers',case when next_status='approved' and operational then coalesce(p_accepting,true) else false end,
    'vehicle_plate',normalized_plate,'motorcycle_type',moto_type,'vehicle_color',moto_color,
    'approval_status',next_status,
    'account_status',coalesce(current_row.account_status,'active')
  );
exception when unique_violation then
  raise exception 'Esta placa já está vinculada a outro Piloto Parceiro.';
end
$$;

create or replace function public.review_pilot_application(
  p_profile_id uuid,
  p_approve boolean,
  p_reason text default ''
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  uid uuid:=auth.uid();
  pp public.pilot_profiles;
  reason text:=trim(coalesce(p_reason,''));
begin
  perform private.enforce_rate_limit('pilot.review',30,60);
  if not public.is_platform_admin() then raise exception 'Acesso exclusivo da administração da plataforma.'; end if;
  select * into pp from public.pilot_profiles where profile_id=p_profile_id for update;
  if pp.profile_id is null or pp.submitted_at is null then raise exception 'Cadastro de piloto não encontrado.'; end if;
  if not p_approve and char_length(reason)<3 then raise exception 'Informe o motivo da reprovação.'; end if;

  update public.pilot_profiles set
    approval_status=case when p_approve then 'approved' else 'rejected' end,
    accepting_offers=case when p_approve and account_status='active' then true else false end,
    rejection_reason=case when p_approve then '' else left(reason,500) end,
    reviewed_at=now(),
    reviewed_by=uid,
    updated_at=now()
  where profile_id=p_profile_id;

  return jsonb_build_object(
    'profile_id',p_profile_id,
    'status',case when p_approve then 'approved' else 'rejected' end,
    'account_status',pp.account_status
  );
end
$$;

drop function if exists public.list_pilot_applications(text);
create function public.list_pilot_applications(p_status text default 'pending')
returns table(
  profile_id uuid,
  display_name text,
  email text,
  telefone text,
  city text,
  vehicle_plate text,
  motorcycle_type text,
  vehicle_color text,
  cnh_category text,
  cnh_expiry date,
  profile_photo_path text,
  motorcycle_photo_path text,
  cnh_front_path text,
  cnh_back_path text,
  approval_status text,
  rejection_reason text,
  account_status text,
  blocked_reason text,
  submitted_at timestamptz
)
language plpgsql
security definer
set search_path=''
as $$
begin
  if not public.is_platform_admin() then raise exception 'Acesso exclusivo da administração da plataforma.'; end if;
  return query
    select pp.profile_id,pp.display_name,p.email,p.telefone,pp.city,
           pp.vehicle_plate,pp.motorcycle_type,pp.vehicle_color,
           pp.cnh_category,pp.cnh_expiry,
           pp.profile_photo_path,pp.motorcycle_photo_path,pp.cnh_front_path,pp.cnh_back_path,
           pp.approval_status,pp.rejection_reason,pp.account_status,pp.blocked_reason,pp.submitted_at
    from public.pilot_profiles pp
    join public.profiles p on p.id=pp.profile_id
    where (p_status is null or pp.approval_status=p_status)
      and pp.submitted_at is not null
    order by pp.submitted_at asc;
end
$$;
revoke all on function public.list_pilot_applications(text) from public;
grant execute on function public.list_pilot_applications(text) to authenticated;
