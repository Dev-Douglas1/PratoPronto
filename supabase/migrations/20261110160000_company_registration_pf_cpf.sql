-- Support both legal entities (PJ/CNPJ) and individual sellers (PF/CPF).
-- Existing PJ requests remain valid and keep their original CNPJ values.

create or replace function private.valid_cpf(p_value text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $function$
declare
  digits text := regexp_replace(coalesce(p_value, ''), '[^0-9]', '', 'g');
  total integer;
  check_digit integer;
  i integer;
begin
  if length(digits) <> 11 or digits = repeat(substring(digits from 1 for 1), 11) then
    return false;
  end if;

  total := 0;
  for i in 1..9 loop
    total := total + substring(digits from i for 1)::integer * (11 - i);
  end loop;
  check_digit := (total * 10) % 11;
  if check_digit = 10 then check_digit := 0; end if;
  if check_digit <> substring(digits from 10 for 1)::integer then
    return false;
  end if;

  total := 0;
  for i in 1..10 loop
    total := total + substring(digits from i for 1)::integer * (12 - i);
  end loop;
  check_digit := (total * 10) % 11;
  if check_digit = 10 then check_digit := 0; end if;
  return check_digit = substring(digits from 11 for 1)::integer;
end
$function$;

revoke all on function private.valid_cpf(text) from public, anon, authenticated;

alter table public.company_registration_requests
  add column if not exists person_type text not null default 'pj',
  add column if not exists cpf text;

alter table public.company_registration_requests
  alter column cnpj drop not null;

alter table public.company_registration_requests
  drop constraint if exists company_registration_cnpj_format,
  drop constraint if exists company_registration_requests_cnpj_check;

alter table public.company_registration_requests
  add constraint company_registration_person_document_check
  check (
    (person_type = 'pj' and cnpj is not null and cnpj ~ '^[0-9]{14}$' and cpf is null)
    or
    (person_type = 'pf' and cpf is not null and private.valid_cpf(cpf) and cnpj is null)
  );

create unique index if not exists company_registration_cpf_active_unique
  on public.company_registration_requests(cpf)
  where cpf is not null and status in ('pending', 'approved');

alter table public.restaurantes add column if not exists cpf text;
create unique index if not exists restaurantes_cpf_unique
  on public.restaurantes(cpf) where cpf is not null;

alter table public.restaurantes
  drop constraint if exists restaurantes_cpf_format;
alter table public.restaurantes
  add constraint restaurantes_cpf_format
  check (cpf is null or private.valid_cpf(cpf));

alter table public.company_registration_documents
  drop constraint if exists company_registration_documents_document_type_check;

alter table public.company_registration_documents
  add constraint company_registration_documents_document_type_check
  check (document_type in ('cnpj_card','cpf_card','identity','proof_of_address','authorization'));

create or replace function public.submit_company_registration_v2(
  p_person_type text,
  p_cnpj text,
  p_cpf text,
  p_legal_name text,
  p_trade_name text,
  p_contact_phone text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  uid uuid := auth.uid();
  cnpj_digits text := regexp_replace(coalesce(p_cnpj, ''), '[^0-9]', '', 'g');
  cpf_digits text := regexp_replace(coalesce(p_cpf, ''), '[^0-9]', '', 'g');
  phone_digits text := regexp_replace(coalesce(p_contact_phone, ''), '[^0-9]', '', 'g');
  request_id uuid;
  kind text := lower(trim(coalesce(p_person_type, '')));
begin
  if uid is null or not private.verified(uid) then
    raise exception 'Confirme seu e-mail ou telefone antes de solicitar cadastro empresarial.' using errcode = '42501';
  end if;

  perform private.enforce_rate_limit('company.registration_request', 3, 86400);

  if kind = 'pj' then
    if not public.valid_cnpj(cnpj_digits) or cpf_digits <> '' then
      raise exception 'Informe um CNPJ válido com 14 números.' using errcode = '22023';
    end if;
    if exists (select 1 from public.restaurantes r where r.cnpj = cnpj_digits)
       or exists (select 1 from public.company_registration_requests q where q.cnpj = cnpj_digits and q.status in ('pending','approved')) then
      raise exception 'Este CNPJ já possui cadastro ou solicitação em análise.' using errcode = '23505';
    end if;
  elsif kind = 'pf' then
    if not private.valid_cpf(cpf_digits) or cnpj_digits <> '' then
      raise exception 'Informe um CPF válido com 11 números.' using errcode = '22023';
    end if;
    if exists (select 1 from public.restaurantes r where r.cpf = cpf_digits)
       or exists (select 1 from public.company_registration_requests q where q.cpf = cpf_digits and q.status in ('pending','approved')) then
      raise exception 'Este CPF já possui cadastro ou solicitação em análise.' using errcode = '23505';
    end if;
  else
    raise exception 'Selecione pessoa física (PF) ou pessoa jurídica (PJ).' using errcode = '22023';
  end if;

  if length(trim(coalesce(p_legal_name, ''))) not between 2 and 160
     or length(trim(coalesce(p_trade_name, ''))) not between 2 and 100 then
    raise exception 'Confira o nome do responsável/razão social e o nome da loja.' using errcode = '22023';
  end if;
  if length(phone_digits) not between 10 and 11 then
    raise exception 'Informe um telefone com DDD.' using errcode = '22023';
  end if;

  insert into public.company_registration_requests(
    user_id, person_type, cnpj, cpf, legal_name, trade_name, contact_phone
  ) values (
    uid, kind,
    case when kind = 'pj' then cnpj_digits else null end,
    case when kind = 'pf' then cpf_digits else null end,
    trim(p_legal_name), trim(p_trade_name), phone_digits
  )
  returning id into request_id;

  return jsonb_build_object('requestId', request_id, 'status', 'pending', 'personType', kind);
end
$function$;

create or replace function public.my_company_registration_request_v2()
returns table(
  id uuid, person_type text, cnpj text, cpf text, legal_name text,
  trade_name text, contact_phone text, status text, review_note text, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if auth.uid() is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  return query
    select q.id, q.person_type, q.cnpj, q.cpf, q.legal_name, q.trade_name,
           q.contact_phone, q.status, q.review_note, q.created_at
    from public.company_registration_requests q
    where q.user_id = auth.uid()
    order by q.created_at desc
    limit 1;
end
$function$;

create or replace function public.list_company_registration_requests_v2()
returns table(
  id uuid, user_id uuid, person_type text, cnpj text, cpf text,
  legal_name text, trade_name text, contact_phone text, status text, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not public.is_platform_admin() then
    raise exception 'Acesso restrito à administração da plataforma.' using errcode = '42501';
  end if;
  return query
    select q.id, q.user_id, q.person_type, q.cnpj, q.cpf, q.legal_name,
           q.trade_name, q.contact_phone, q.status, q.created_at
    from public.company_registration_requests q
    where q.status = 'pending'
    order by q.created_at;
end
$function$;

create or replace function public.register_company_document(
  p_request_id uuid, p_type text, p_path text, p_mime text, p_size bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  uid uuid := auth.uid();
  request_kind text;
  required_id_type text;
begin
  if uid is null then
    raise exception 'Entre na sua conta.' using errcode = '42501';
  end if;
  if p_type not in ('cnpj_card','cpf_card','identity','proof_of_address','authorization') then
    raise exception 'Tipo de documento inválido.' using errcode = '22023';
  end if;
  if p_mime not in ('application/pdf','image/jpeg','image/png','image/webp')
     or p_size not between 1 and 5242880 then
    raise exception 'Arquivo inválido. Use PDF, JPG, PNG ou WEBP de até 5 MB.' using errcode = '22023';
  end if;
  if p_path not like uid::text || '/' || p_request_id::text || '/%' then
    raise exception 'Caminho de arquivo inválido.' using errcode = '42501';
  end if;

  select q.person_type into request_kind
  from public.company_registration_requests q
  where q.id = p_request_id and q.user_id = uid and q.status = 'pending'
  for update;
  if not found then
    raise exception 'Solicitação não encontrada ou já analisada.' using errcode = '42501';
  end if;

  required_id_type := case when request_kind = 'pj' then 'cnpj_card' else 'cpf_card' end;
  if p_type in ('cnpj_card','cpf_card') and p_type <> required_id_type then
    raise exception 'O documento enviado não corresponde ao tipo de cadastro.' using errcode = '22023';
  end if;

  insert into public.company_registration_documents(
    request_id,user_id,document_type,storage_path,mime_type,file_size
  ) values (p_request_id,uid,p_type,p_path,p_mime,p_size)
  on conflict(request_id,document_type) do update
    set storage_path=excluded.storage_path,mime_type=excluded.mime_type,
        file_size=excluded.file_size,created_at=now();

  return jsonb_build_object('saved',true,'type',p_type);
end
$function$;

create or replace function public.review_company_registration(
  p_request_id uuid, p_approve boolean, p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  q public.company_registration_requests%rowtype;
  new_slug text;
  rid uuid;
  id_document_type text;
begin
  if not public.is_platform_admin() then
    raise exception 'Acesso restrito à administração da plataforma.' using errcode = '42501';
  end if;

  select * into q
  from public.company_registration_requests
  where id = p_request_id
  for update;

  if not found or q.status <> 'pending' then
    raise exception 'Solicitação não encontrada ou já analisada.' using errcode = '22023';
  end if;

  if p_approve then
    id_document_type := case when q.person_type = 'pj' then 'cnpj_card' else 'cpf_card' end;

    if not exists (select 1 from public.company_registration_documents where request_id=q.id and document_type=id_document_type)
       or not exists (select 1 from public.company_registration_documents where request_id=q.id and document_type='identity')
       or not exists (select 1 from public.company_registration_documents where request_id=q.id and document_type='proof_of_address') then
      raise exception 'A solicitação precisa conter documento fiscal, identidade do responsável e comprovante de endereço.' using errcode = '22023';
    end if;

    if (q.person_type = 'pj' and exists(select 1 from public.restaurantes where cnpj=q.cnpj))
       or (q.person_type = 'pf' and exists(select 1 from public.restaurantes where cpf=q.cpf)) then
      raise exception 'Já existe uma loja cadastrada com este documento.' using errcode = '23505';
    end if;

    new_slug := trim(both '-' from regexp_replace(lower(q.trade_name),'[^a-z0-9]+','-','g'));
    new_slug := left(coalesce(nullif(new_slug,''),'empresa'),50) || '-' || left(replace(q.id::text,'-',''),8);

    insert into public.restaurantes(nome,slug,ativo,cnpj,cpf)
    values(q.trade_name,new_slug,false,q.cnpj,q.cpf)
    returning id into rid;

    insert into public.restaurant_members(restaurante_id,profile_id,role,active)
    values(rid,q.user_id,'owner',true);

    insert into public.restaurant_settings(restaurante_id,data,updated_by)
    values(rid,jsonb_build_object(
      'name',q.trade_name,'acceptingOrders',false,
      'methods',jsonb_build_array('maquina_entrega'),
      'timezone','America/Sao_Paulo','estimateMinutes',45,'retentionDays',90,
      'hours','[]'::jsonb,'zones','[]'::jsonb,'address','{}'::jsonb
    ),q.user_id);

    update public.company_registration_requests
    set status='approved',review_note=trim(coalesce(p_note,'')),
        reviewed_by=auth.uid(),reviewed_at=now(),restaurant_id=rid,updated_at=now()
    where id=q.id;

    return jsonb_build_object('status','approved','companyId',new_slug,'restaurantId',rid);
  end if;

  if length(trim(coalesce(p_note,''))) < 3 then
    raise exception 'Informe o motivo da rejeição.' using errcode = '22023';
  end if;

  update public.company_registration_requests
  set status='rejected',review_note=trim(p_note),
      reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
  where id=q.id;

  return jsonb_build_object('status','rejected');
end
$function$;

revoke all on function public.submit_company_registration_v2(text,text,text,text,text,text) from public, anon;
revoke all on function public.my_company_registration_request_v2() from public, anon;
revoke all on function public.list_company_registration_requests_v2() from public, anon, authenticated;
revoke all on function public.register_company_document(uuid,text,text,text,bigint) from public, anon;
revoke all on function public.review_company_registration(uuid,boolean,text) from public, anon, authenticated;

grant execute on function public.submit_company_registration_v2(text,text,text,text,text,text) to authenticated;
grant execute on function public.my_company_registration_request_v2() to authenticated;
grant execute on function public.list_company_registration_requests_v2() to authenticated;
grant execute on function public.register_company_document(uuid,text,text,text,bigint) to authenticated;
grant execute on function public.review_company_registration(uuid,boolean,text) to authenticated;
