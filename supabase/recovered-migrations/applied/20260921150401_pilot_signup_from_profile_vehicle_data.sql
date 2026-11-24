
alter table public.pilot_profiles
  add column if not exists vehicle_plate text not null default '',
  add column if not exists motorcycle_type text not null default '',
  add column if not exists vehicle_color text not null default '';

create unique index if not exists pilot_profiles_vehicle_plate_unique
  on public.pilot_profiles (upper(vehicle_plate))
  where vehicle_plate <> '';

create or replace function public.get_my_pilot_profile()
returns public.pilot_profiles
language sql
stable
security definer
set search_path = ''
as $$
  select pp.*
  from public.pilot_profiles pp
  where pp.profile_id = auth.uid()
  limit 1
$$;

revoke all on function public.get_my_pilot_profile() from public;
grant execute on function public.get_my_pilot_profile() to authenticated;

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
set search_path = ''
as $$
  select pp.profile_id, pp.display_name, pp.vehicle_type, pp.city,
         pp.accepting_offers, pp.motorcycle_type, pp.vehicle_color
  from public.pilot_profiles pp
  where pp.accepting_offers = true
  order by pp.display_name
  limit 100
$$;

revoke all on function public.list_available_pilots() from public;
grant execute on function public.list_available_pilots() to authenticated;

drop function if exists public.save_pilot_profile(text,text,text,boolean);

create or replace function public.save_pilot_profile(
  p_vehicle_plate text,
  p_motorcycle_type text,
  p_vehicle_color text,
  p_accepting boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  prof public.profiles;
  normalized_plate text := upper(regexp_replace(coalesce(p_vehicle_plate,''),'[^A-Za-z0-9]','','g'));
  moto_type text := trim(coalesce(p_motorcycle_type,''));
  moto_color text := trim(coalesce(p_vehicle_color,''));
begin
  if not private.verified(uid) then raise exception 'Confirme seu e-mail antes de se cadastrar como piloto.'; end if;

  select * into prof from public.profiles where id=uid;
  if prof.id is null then raise exception 'Complete seu perfil antes de se cadastrar como piloto.'; end if;
  if char_length(trim(coalesce(prof.nome,''))) < 2 then raise exception 'Complete seu nome no perfil.'; end if;
  if char_length(trim(coalesce(prof.telefone,''))) < 10 then raise exception 'Complete seu telefone no perfil.'; end if;
  if char_length(trim(coalesce(prof.cidade,''))) < 2 then raise exception 'Complete sua cidade no perfil.'; end if;

  if normalized_plate !~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$' then
    raise exception 'Informe uma placa válida, como ABC1D23.';
  end if;
  if char_length(moto_type) < 2 or char_length(moto_type) > 60 then
    raise exception 'Informe o tipo ou modelo da moto.';
  end if;
  if char_length(moto_color) < 2 or char_length(moto_color) > 40 then
    raise exception 'Informe a cor da moto.';
  end if;

  insert into public.pilot_profiles(
    profile_id,display_name,vehicle_type,city,accepting_offers,
    vehicle_plate,motorcycle_type,vehicle_color,updated_at
  )
  values(
    uid,trim(prof.nome),'moto',trim(prof.cidade),coalesce(p_accepting,true),
    normalized_plate,moto_type,moto_color,now()
  )
  on conflict(profile_id) do update set
    display_name=excluded.display_name,
    vehicle_type='moto',
    city=excluded.city,
    accepting_offers=excluded.accepting_offers,
    vehicle_plate=excluded.vehicle_plate,
    motorcycle_type=excluded.motorcycle_type,
    vehicle_color=excluded.vehicle_color,
    updated_at=now();

  return jsonb_build_object(
    'profile_id',uid,
    'display_name',trim(prof.nome),
    'vehicle_type','moto',
    'city',trim(prof.cidade),
    'accepting_offers',coalesce(p_accepting,true),
    'vehicle_plate',normalized_plate,
    'motorcycle_type',moto_type,
    'vehicle_color',moto_color
  );
exception
  when unique_violation then
    raise exception 'Esta placa já está vinculada a outro Piloto Parceiro.';
end
$$;

revoke all on function public.save_pilot_profile(text,text,text,boolean) from public;
grant execute on function public.save_pilot_profile(text,text,text,boolean) to authenticated;

-- Evita expor placa por SELECT direto para todas as contas autenticadas.
revoke select on public.pilot_profiles from authenticated;
