
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
  existing_approved boolean:=false;
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

  select * into current_row from public.pilot_profiles where profile_id=uid for update;
  existing_approved:=current_row.profile_id is not null and current_row.approval_status='approved';

  if current_row.profile_id is not null and current_row.account_status='blocked' then
    raise exception 'Seu acesso como Piloto Parceiro está bloqueado.';
  end if;

  if existing_approved and exists(
    select 1 from public.orders o
    where o.assigned_pilot_id=uid
      and o.status not in ('entregue','cancelado')
  ) then
    raise exception 'Finalize suas entregas ativas antes de atualizar dados ou documentos do cadastro.';
  end if;

  insert into public.pilot_profiles(
    profile_id,display_name,vehicle_type,city,accepting_offers,
    vehicle_plate,motorcycle_type,vehicle_color,approval_status,updated_at
  )
  values(
    uid,trim(prof.nome),'moto',trim(prof.cidade),false,
    normalized_plate,moto_type,moto_color,'draft',now()
  )
  on conflict(profile_id) do update set
    display_name=excluded.display_name,
    vehicle_type='moto',
    city=excluded.city,
    accepting_offers=false,
    vehicle_plate=excluded.vehicle_plate,
    motorcycle_type=excluded.motorcycle_type,
    vehicle_color=excluded.vehicle_color,
    approval_status='draft',
    rejection_reason='',
    reviewed_at=null,
    reviewed_by=null,
    updated_at=now();

  return jsonb_build_object(
    'profile_id',uid,
    'display_name',trim(prof.nome),
    'vehicle_type','moto',
    'city',trim(prof.cidade),
    'accepting_offers',false,
    'vehicle_plate',normalized_plate,
    'motorcycle_type',moto_type,
    'vehicle_color',moto_color,
    'approval_status','draft',
    'account_status',coalesce(current_row.account_status,'active')
  );
exception when unique_violation then
  raise exception 'Esta placa já está vinculada a outro Piloto Parceiro.';
end
$$;
