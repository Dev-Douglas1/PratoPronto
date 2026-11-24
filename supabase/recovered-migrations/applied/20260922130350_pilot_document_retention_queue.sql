
create table if not exists public.pilot_document_cleanup_queue (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.pilot_profiles(profile_id) on delete cascade,
  paths text[] not null default '{}',
  reason text not null check(reason in ('superseded','rejected','blocked','account_deleted')),
  due_at timestamptz not null,
  status text not null default 'pending' check(status in ('pending','done','skipped','failed')),
  attempts integer not null default 0,
  last_error text not null default '',
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
alter table public.pilot_document_cleanup_queue enable row level security;

revoke all on public.pilot_document_cleanup_queue from anon,authenticated;
grant select on public.pilot_document_cleanup_queue to authenticated;

drop policy if exists "platform admins read pilot cleanup queue" on public.pilot_document_cleanup_queue;
create policy "platform admins read pilot cleanup queue"
on public.pilot_document_cleanup_queue
for select
to authenticated
using(public.is_platform_admin());

create index if not exists pilot_cleanup_due_idx
  on public.pilot_document_cleanup_queue(status,due_at);
create index if not exists pilot_cleanup_profile_idx
  on public.pilot_document_cleanup_queue(profile_id,created_at desc);

create or replace function private.queue_pilot_documents(
  p_profile_id uuid,
  p_paths text[],
  p_reason text,
  p_due_at timestamptz
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare clean_paths text[];
begin
  if p_reason not in ('superseded','rejected','blocked','account_deleted') then
    raise exception 'Motivo de retenção inválido.';
  end if;

  select coalesce(array_agg(distinct p) filter(where p is not null and p<>''),'{}'::text[])
  into clean_paths
  from unnest(coalesce(p_paths,'{}'::text[])) p;

  if cardinality(clean_paths)=0 then return; end if;

  insert into public.pilot_document_cleanup_queue(profile_id,paths,reason,due_at)
  values(p_profile_id,clean_paths,p_reason,p_due_at);
end
$$;
revoke all on function private.queue_pilot_documents(uuid,text[],text,timestamptz) from public,anon,authenticated;

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
set search_path=''
as $$
declare
  uid uuid:=auth.uid();
  pp public.pilot_profiles;
  prefix text:=uid::text||'/';
  old_paths text[];
  new_paths text[];
begin
  perform private.enforce_rate_limit('pilot.submit',5,3600);
  if not private.verified(uid) then raise exception 'Confirme seu e-mail antes de enviar a documentação.'; end if;

  select * into pp from public.pilot_profiles where profile_id=uid for update;
  if pp.profile_id is null then raise exception 'Cadastre os dados da moto antes de enviar a documentação.'; end if;
  if pp.account_status='blocked' then raise exception 'Seu acesso como Piloto Parceiro está bloqueado.'; end if;
  if p_cnh_category not in ('A','AB') then raise exception 'A categoria da CNH deve ser A ou AB.'; end if;
  if p_cnh_expiry is null or p_cnh_expiry<=current_date then raise exception 'A CNH precisa estar dentro da validade.'; end if;

  if p_profile_photo_path not like prefix||'%' or
     p_motorcycle_photo_path not like prefix||'%' or
     p_cnh_front_path not like prefix||'%' or
     p_cnh_back_path not like prefix||'%'
  then raise exception 'Arquivos de documentação inválidos.'; end if;

  if not exists(select 1 from storage.objects where bucket_id='pilot-documents' and name=p_profile_photo_path) or
     not exists(select 1 from storage.objects where bucket_id='pilot-documents' and name=p_motorcycle_photo_path) or
     not exists(select 1 from storage.objects where bucket_id='pilot-documents' and name=p_cnh_front_path) or
     not exists(select 1 from storage.objects where bucket_id='pilot-documents' and name=p_cnh_back_path)
  then raise exception 'Envie todos os documentos antes de finalizar o cadastro.'; end if;

  old_paths:=array_remove(array[
    pp.profile_photo_path,pp.motorcycle_photo_path,pp.cnh_front_path,pp.cnh_back_path
  ],'');
  new_paths:=array[
    p_profile_photo_path,p_motorcycle_photo_path,p_cnh_front_path,p_cnh_back_path
  ];

  if cardinality(old_paths)>0 and old_paths is distinct from new_paths then
    perform private.queue_pilot_documents(uid,old_paths,'superseded',now()+interval '7 days');
  end if;

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

  if not p_approve then
    perform private.queue_pilot_documents(
      p_profile_id,
      array_remove(array[pp.profile_photo_path,pp.motorcycle_photo_path,pp.cnh_front_path,pp.cnh_back_path],''),
      'rejected',
      now()+interval '30 days'
    );
  end if;

  return jsonb_build_object(
    'profile_id',p_profile_id,
    'status',case when p_approve then 'approved' else 'rejected' end,
    'account_status',pp.account_status
  );
end
$$;

create or replace function public.set_pilot_account_status(
  p_profile_id uuid,
  p_status text,
  p_reason text default ''
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare uid uuid:=auth.uid(); reason text:=trim(coalesce(p_reason,'')); pp public.pilot_profiles;
begin
  perform private.enforce_rate_limit('platform.pilot_status',30,60);
  if not public.is_platform_admin() then raise exception 'Acesso exclusivo da administração da plataforma.'; end if;
  if p_status not in ('active','suspended','blocked') then raise exception 'Status inválido.'; end if;
  if p_status<>'active' and char_length(reason)<3 then raise exception 'Informe o motivo do bloqueio ou suspensão.'; end if;

  select * into pp from public.pilot_profiles where profile_id=p_profile_id for update;
  if pp.profile_id is null then raise exception 'Piloto não encontrado.'; end if;

  update public.pilot_profiles
  set account_status=p_status,
      accepting_offers=case when p_status='active' and approval_status='approved' then accepting_offers else false end,
      blocked_reason=case when p_status='active' then '' else left(reason,500) end,
      blocked_at=case when p_status='active' then null else now() end,
      blocked_by=case when p_status='active' then null else uid end,
      updated_at=now()
  where profile_id=p_profile_id;

  if p_status='blocked' then
    perform private.queue_pilot_documents(
      p_profile_id,
      array_remove(array[pp.profile_photo_path,pp.motorcycle_photo_path,pp.cnh_front_path,pp.cnh_back_path],''),
      'blocked',
      now()+interval '90 days'
    );
  end if;

  return jsonb_build_object('profileId',p_profile_id,'status',p_status);
end
$$;
