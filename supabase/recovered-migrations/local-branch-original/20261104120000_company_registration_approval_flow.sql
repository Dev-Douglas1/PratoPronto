-- Company registration is a request first; only platform admins create the restaurant.
alter table public.restaurantes add column if not exists cnpj text;
create unique index if not exists restaurantes_cnpj_unique on public.restaurantes(cnpj) where cnpj is not null;

create table if not exists public.company_registration_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cnpj text not null unique check (cnpj ~ '^[0-9]{14}$'),
  legal_name text not null,
  trade_name text not null,
  contact_phone text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  review_note text not null default '',
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  restaurant_id uuid references public.restaurantes(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists company_registration_user_idx on public.company_registration_requests(user_id, created_at desc);
alter table public.company_registration_requests enable row level security;
revoke all on public.company_registration_requests from public, anon, authenticated;

create or replace function public.submit_company_registration(p_cnpj text,p_legal_name text,p_trade_name text,p_contact_phone text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare uid uuid:=auth.uid(); digits text:=regexp_replace(coalesce(p_cnpj,''),'\\D','','g'); request_id uuid;
begin
 if uid is null or not private.verified(uid) then raise exception 'Confirme seu e-mail ou telefone antes de solicitar cadastro empresarial.' using errcode='42501'; end if;
 perform private.enforce_rate_limit('company.registration_request',3,86400);
 if length(digits)<>14 then raise exception 'Informe um CNPJ com 14 números.' using errcode='22023'; end if;
 if length(trim(coalesce(p_legal_name,''))) not between 2 and 160 or length(trim(coalesce(p_trade_name,''))) not between 2 and 100 then raise exception 'Confira a razão social e o nome fantasia.' using errcode='22023'; end if;
 if length(regexp_replace(coalesce(p_contact_phone,''),'\\D','','g')) not between 10 and 11 then raise exception 'Informe um telefone com DDD.' using errcode='22023'; end if;
 if exists(select 1 from public.restaurantes r where r.cnpj=digits) or exists(select 1 from public.company_registration_requests q where q.cnpj=digits and q.status in ('pending','approved')) then raise exception 'Este CNPJ já possui cadastro ou solicitação em análise.' using errcode='23505'; end if;
 insert into public.company_registration_requests(user_id,cnpj,legal_name,trade_name,contact_phone) values(uid,digits,trim(p_legal_name),trim(p_trade_name),regexp_replace(p_contact_phone,'\\D','','g')) returning id into request_id;
 return jsonb_build_object('requestId',request_id,'status','pending');
end $$;

create or replace function public.my_company_registration_request()
returns table(id uuid,cnpj text,legal_name text,trade_name text,contact_phone text,status text,review_note text,created_at timestamptz)
language sql stable security invoker set search_path=''
as $$ select q.id,q.cnpj,q.legal_name,q.trade_name,q.contact_phone,q.status,q.review_note,q.created_at from public.company_registration_requests q where q.user_id=(select auth.uid()) order by q.created_at desc limit 1 $$;

create or replace function public.list_company_registration_requests()
returns table(id uuid,user_id uuid,cnpj text,legal_name text,trade_name text,contact_phone text,status text,created_at timestamptz)
language plpgsql stable security definer set search_path=''
as $$
begin
 if not public.is_platform_admin() then raise exception 'Acesso restrito à administração da plataforma.' using errcode='42501'; end if;
 return query select q.id,q.user_id,q.cnpj,q.legal_name,q.trade_name,q.contact_phone,q.status,q.created_at from public.company_registration_requests q where q.status='pending' order by q.created_at;
end $$;

create or replace function public.review_company_registration(p_request_id uuid,p_approve boolean,p_note text default '')
returns jsonb language plpgsql security definer set search_path=''
as $$
declare q public.company_registration_requests%rowtype; new_slug text; rid uuid;
begin
 if not public.is_platform_admin() then raise exception 'Acesso restrito à administração da plataforma.' using errcode='42501'; end if;
 select * into q from public.company_registration_requests where id=p_request_id for update;
 if not found or q.status<>'pending' then raise exception 'Solicitação não encontrada ou já analisada.' using errcode='22023'; end if;
 if p_approve then
  if exists(select 1 from public.restaurantes where cnpj=q.cnpj) then raise exception 'Já existe uma loja com este CNPJ.' using errcode='23505'; end if;
  new_slug:=trim(both '-' from regexp_replace(lower(q.trade_name),'[^a-z0-9]+','-','g'));
  new_slug:=left(coalesce(nullif(new_slug,''),'empresa'),50)||'-'||left(replace(q.id::text,'-',''),8);
  insert into public.restaurantes(nome,slug,ativo,cnpj) values(q.trade_name,new_slug,false,q.cnpj) returning id into rid;
  insert into public.restaurant_members(restaurante_id,profile_id,role,active) values(rid,q.user_id,'owner',true);
  insert into public.restaurant_settings(restaurante_id,data,updated_by) values(rid,jsonb_build_object('name',q.trade_name,'acceptingOrders',false,'methods',jsonb_build_array('maquina_entrega'),'timezone','America/Sao_Paulo','estimateMinutes',45,'retentionDays',90,'hours','[]'::jsonb,'zones','[]'::jsonb,'address','{}'::jsonb),q.user_id);
  update public.company_registration_requests set status='approved',review_note=trim(coalesce(p_note,'')),reviewed_by=auth.uid(),reviewed_at=now(),restaurant_id=rid,updated_at=now() where id=q.id;
  return jsonb_build_object('status','approved','companyId',new_slug,'restaurantId',rid);
 end if;
 if length(trim(coalesce(p_note,'')))<3 then raise exception 'Informe o motivo da rejeição.' using errcode='22023'; end if;
 update public.company_registration_requests set status='rejected',review_note=trim(p_note),reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=q.id;
 return jsonb_build_object('status','rejected');
end $$;

revoke all on function public.submit_company_registration(text,text,text,text) from public,anon;
revoke all on function public.my_company_registration_request() from public,anon;
revoke all on function public.list_company_registration_requests() from public,anon,authenticated;
revoke all on function public.review_company_registration(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.submit_company_registration(text,text,text,text) to authenticated;
grant execute on function public.my_company_registration_request() to authenticated;
grant execute on function public.list_company_registration_requests() to authenticated;
grant execute on function public.review_company_registration(uuid,boolean,text) to authenticated;
