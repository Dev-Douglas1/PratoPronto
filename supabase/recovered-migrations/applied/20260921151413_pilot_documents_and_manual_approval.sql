
create table if not exists public.platform_admins (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1
    from public.platform_admins a
    where a.profile_id = auth.uid()
      and a.active = true
  )
$$;
revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to authenticated;

alter table public.pilot_profiles
  add column if not exists cnh_category text not null default '',
  add column if not exists cnh_expiry date,
  add column if not exists profile_photo_path text not null default '',
  add column if not exists motorcycle_photo_path text not null default '',
  add column if not exists cnh_front_path text not null default '',
  add column if not exists cnh_back_path text not null default '',
  add column if not exists approval_status text not null default 'draft',
  add column if not exists rejection_reason text not null default '',
  add column if not exists submitted_at timestamptz,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists documents_consent_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname='pilot_profiles_approval_status_check'
  ) then
    alter table public.pilot_profiles
      add constraint pilot_profiles_approval_status_check
      check (approval_status in ('draft','pending','approved','rejected'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname='pilot_profiles_cnh_category_check'
  ) then
    alter table public.pilot_profiles
      add constraint pilot_profiles_cnh_category_check
      check (cnh_category in ('','A','AB'));
  end if;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values(
  'pilot-documents',
  'pilot-documents',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp','application/pdf']
)
on conflict(id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "pilot docs own insert" on storage.objects;
create policy "pilot docs own insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id='pilot-documents'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "pilot docs own read" on storage.objects;
create policy "pilot docs own read"
on storage.objects
for select
to authenticated
using (
  bucket_id='pilot-documents'
  and (
    (storage.foldername(name))[1] = (select auth.uid()::text)
    or public.is_platform_admin()
  )
);

drop policy if exists "pilot docs own delete" on storage.objects;
create policy "pilot docs own delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id='pilot-documents'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create or replace function public.get_my_pilot_profile()
returns public.pilot_profiles
language sql
stable
security definer
set search_path = ''
as $$
  select pp.*
  from public.pilot_profiles pp
  where pp.profile_id=auth.uid()
  limit 1
$$;
revoke all on function public.get_my_pilot_profile() from public;
grant execute on function public.get_my_pilot_profile() to authenticated;

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
  current_row public.pilot_profiles;
  normalized_plate text := upper(regexp_replace(coalesce(p_vehicle_plate,''),'[^A-Za-z0-9]','','g'));
  moto_type text := trim(coalesce(p_motorcycle_type,''));
  moto_color text := trim(coalesce(p_vehicle_color,''));
  next_status text := 'draft';
begin
  if not private.verified(uid) then raise exception 'Confirme seu e-mail antes de se cadastrar como piloto.'; end if;
  select * into prof from public.profiles where id=uid;
  if prof.id is null then raise exception 'Complete seu perfil antes de se cadastrar como piloto.'; end if;
  if char_length(trim(coalesce(prof.nome,''))) < 2 then raise exception 'Complete seu nome no perfil.'; end if;
  if char_length(trim(coalesce(prof.telefone,''))) < 10 then raise exception 'Complete seu telefone no perfil.'; end if;
  if char_length(trim(coalesce(prof.cidade,''))) < 2 then raise exception 'Complete sua cidade no perfil.'; end if;
  if normalized_plate !~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$' then raise exception 'Informe uma placa válida, como ABC1D23.'; end if;
  if char_length(moto_type) < 2 or char_length(moto_type) > 60 then raise exception 'Informe o tipo ou modelo da moto.'; end if;
  if char_length(moto_color) < 2 or char_length(moto_color) > 40 then raise exception 'Informe a cor da moto.'; end if;

  select * into current_row from public.pilot_profiles where profile_id=uid;
  if current_row.profile_id is not null
     and current_row.vehicle_plate=normalized_plate
     and current_row.motorcycle_type=moto_type
     and current_row.vehicle_color=moto_color
     and current_row.approval_status='approved'
  then next_status := 'approved';
  elsif current_row.profile_id is not null and current_row.submitted_at is not null
  then next_status := 'pending';
  end if;

  insert into public.pilot_profiles(
    profile_id,display_name,vehicle_type,city,accepting_offers,
    vehicle_plate,motorcycle_type,vehicle_color,approval_status,updated_at
  )
  values(
    uid,trim(prof.nome),'moto',trim(prof.cidade),
    case when next_status='approved' then coalesce(p_accepting,true) else false end,
    normalized_plate,moto_type,moto_color,next_status,now()
  )
  on conflict(profile_id) do update set
    display_name=excluded.display_name,
    vehicle_type='moto',
    city=excluded.city,
    accepting_offers=excluded.accepting_offers,
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
    'accepting_offers',case when next_status='approved' then coalesce(p_accepting,true) else false end,
    'vehicle_plate',normalized_plate,'motorcycle_type',moto_type,'vehicle_color',moto_color,
    'approval_status',next_status
  );
exception when unique_violation then
  raise exception 'Esta placa já está vinculada a outro Piloto Parceiro.';
end
$$;
revoke all on function public.save_pilot_profile(text,text,text,boolean) from public;
grant execute on function public.save_pilot_profile(text,text,text,boolean) to authenticated;

create or replace function public.submit_pilot_application(
  p_cnh_category text,
  p_cnh_expiry date,
  p_profile_photo_path text,
  p_motorcycle_photo_path text,
  p_cnh_front_path text,
  p_cnh_back_path text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  pp public.pilot_profiles;
  prefix text := uid::text || '/';
begin
  if not private.verified(uid) then raise exception 'Confirme seu e-mail antes de enviar a documentação.'; end if;
  select * into pp from public.pilot_profiles where profile_id=uid for update;
  if pp.profile_id is null then raise exception 'Cadastre os dados da moto antes de enviar a documentação.'; end if;
  if p_cnh_category not in ('A','AB') then raise exception 'A categoria da CNH deve ser A ou AB.'; end if;
  if p_cnh_expiry is null or p_cnh_expiry <= current_date then raise exception 'A CNH precisa estar dentro da validade.'; end if;
  if p_profile_photo_path not like prefix || '%' or
     p_motorcycle_photo_path not like prefix || '%' or
     p_cnh_front_path not like prefix || '%' or
     p_cnh_back_path not like prefix || '%'
  then raise exception 'Arquivos de documentação inválidos.'; end if;

  if not exists(select 1 from storage.objects where bucket_id='pilot-documents' and name=p_profile_photo_path) or
     not exists(select 1 from storage.objects where bucket_id='pilot-documents' and name=p_motorcycle_photo_path) or
     not exists(select 1 from storage.objects where bucket_id='pilot-documents' and name=p_cnh_front_path) or
     not exists(select 1 from storage.objects where bucket_id='pilot-documents' and name=p_cnh_back_path)
  then raise exception 'Envie todos os documentos antes de finalizar o cadastro.'; end if;

  update public.pilot_profiles set
    cnh_category=p_cnh_category,
    cnh_expiry=p_cnh_expiry,
    profile_photo_path=p_profile_photo_path,
    motorcycle_photo_path=p_motorcycle_photo_path,
    cnh_front_path=p_cnh_front_path,
    cnh_back_path=p_cnh_back_path,
    approval_status='pending',
    accepting_offers=false,
    rejection_reason='',
    submitted_at=now(),
    reviewed_at=null,
    reviewed_by=null,
    documents_consent_at=now(),
    updated_at=now()
  where profile_id=uid;

  return jsonb_build_object('status','pending','submitted_at',now());
end
$$;
revoke all on function public.submit_pilot_application(text,date,text,text,text,text) from public;
grant execute on function public.submit_pilot_application(text,date,text,text,text,text) to authenticated;

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
  select pp.profile_id,pp.display_name,pp.vehicle_type,pp.city,
         pp.accepting_offers,pp.motorcycle_type,pp.vehicle_color
  from public.pilot_profiles pp
  where pp.accepting_offers=true
    and pp.approval_status='approved'
  order by pp.display_name
  limit 100
$$;
revoke all on function public.list_available_pilots() from public;
grant execute on function public.list_available_pilots() to authenticated;

create or replace function public.list_pilot_applications(p_status text default 'pending')
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
  submitted_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then raise exception 'Acesso exclusivo da administração da plataforma.'; end if;
  return query
    select pp.profile_id,pp.display_name,p.email,p.telefone,pp.city,
           pp.vehicle_plate,pp.motorcycle_type,pp.vehicle_color,
           pp.cnh_category,pp.cnh_expiry,
           pp.profile_photo_path,pp.motorcycle_photo_path,pp.cnh_front_path,pp.cnh_back_path,
           pp.approval_status,pp.rejection_reason,pp.submitted_at
    from public.pilot_profiles pp
    join public.profiles p on p.id=pp.profile_id
    where (p_status is null or pp.approval_status=p_status)
      and pp.submitted_at is not null
    order by pp.submitted_at asc;
end
$$;
revoke all on function public.list_pilot_applications(text) from public;
grant execute on function public.list_pilot_applications(text) to authenticated;

create or replace function public.review_pilot_application(
  p_profile_id uuid,
  p_approve boolean,
  p_reason text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  pp public.pilot_profiles;
  reason text := trim(coalesce(p_reason,''));
begin
  if not public.is_platform_admin() then raise exception 'Acesso exclusivo da administração da plataforma.'; end if;
  select * into pp from public.pilot_profiles where profile_id=p_profile_id for update;
  if pp.profile_id is null or pp.submitted_at is null then raise exception 'Cadastro de piloto não encontrado.'; end if;
  if not p_approve and char_length(reason)<3 then raise exception 'Informe o motivo da reprovação.'; end if;

  update public.pilot_profiles set
    approval_status=case when p_approve then 'approved' else 'rejected' end,
    accepting_offers=case when p_approve then true else false end,
    rejection_reason=case when p_approve then '' else left(reason,500) end,
    reviewed_at=now(),
    reviewed_by=uid,
    updated_at=now()
  where profile_id=p_profile_id;

  return jsonb_build_object(
    'profile_id',p_profile_id,
    'status',case when p_approve then 'approved' else 'rejected' end
  );
end
$$;
revoke all on function public.review_pilot_application(uuid,boolean,text) from public;
grant execute on function public.review_pilot_application(uuid,boolean,text) to authenticated;
