
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
  expected_profile text:=prefix||'profile';
  expected_motorcycle text:=prefix||'motorcycle';
  expected_front text:=prefix||'cnh-front';
  expected_back text:=prefix||'cnh-back';
begin
  perform private.enforce_rate_limit('pilot.submit',5,3600);
  if not private.verified(uid) then raise exception 'Confirme seu e-mail antes de enviar a documentação.'; end if;

  select * into pp from public.pilot_profiles where profile_id=uid for update;
  if pp.profile_id is null then raise exception 'Cadastre os dados da moto antes de enviar a documentação.'; end if;
  if pp.account_status='blocked' then raise exception 'Seu acesso como Piloto Parceiro está bloqueado.'; end if;
  if p_cnh_category not in ('A','AB') then raise exception 'A categoria da CNH deve ser A ou AB.'; end if;
  if p_cnh_expiry is null or p_cnh_expiry<=current_date then raise exception 'A CNH precisa estar dentro da validade.'; end if;

  if p_profile_photo_path<>expected_profile
     or p_motorcycle_photo_path<>expected_motorcycle
     or p_cnh_front_path<>expected_front
     or p_cnh_back_path<>expected_back
  then raise exception 'Arquivos de documentação inválidos.'; end if;

  if not exists(select 1 from storage.objects where bucket_id='pilot-documents' and name=expected_profile) or
     not exists(select 1 from storage.objects where bucket_id='pilot-documents' and name=expected_motorcycle) or
     not exists(select 1 from storage.objects where bucket_id='pilot-documents' and name=expected_front) or
     not exists(select 1 from storage.objects where bucket_id='pilot-documents' and name=expected_back)
  then raise exception 'Envie todos os documentos antes de finalizar o cadastro.'; end if;

  update public.pilot_profiles set
    cnh_category=p_cnh_category,
    cnh_expiry=p_cnh_expiry,
    profile_photo_path=expected_profile,
    motorcycle_photo_path=expected_motorcycle,
    cnh_front_path=expected_front,
    cnh_back_path=expected_back,
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
