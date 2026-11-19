create or replace function public.valid_cnpj(p_cnpj text)
returns boolean language plpgsql immutable set search_path=''
as $$
declare d text:=regexp_replace(coalesce(p_cnpj,''),'\\D','','g'); s integer; r integer; v integer; i integer; w integer;
begin
 if length(d)<>14 or d ~ '^(.)\\1{13}$' then return false; end if;
 s:=0; w:=5;
 for i in 1..12 loop s:=s+substring(d,i,1)::int*w; w:=w-1; if w=1 then w:=9; end if; end loop;
 r:=s%11; v:=case when r<2 then 0 else 11-r end;
 if v<>substring(d,13,1)::int then return false; end if;
 s:=0; w:=6;
 for i in 1..13 loop s:=s+substring(d,i,1)::int*w; w:=w-1; if w=1 then w:=9; end if; end loop;
 r:=s%11; v:=case when r<2 then 0 else 11-r end;
 return v=substring(d,14,1)::int;
end $$;

create table if not exists public.company_registration_documents (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references public.company_registration_requests(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 document_type text not null check(document_type in ('cnpj_card','identity','proof_of_address','authorization')),
 storage_path text not null unique,
 mime_type text not null check(mime_type in ('application/pdf','image/jpeg','image/png','image/webp')),
 file_size bigint not null check(file_size between 1 and 5242880),
 created_at timestamptz not null default now(),
 unique(request_id,document_type)
);
alter table public.company_registration_documents enable row level security;
revoke all on public.company_registration_documents from public,anon,authenticated;
create or replace function public.register_company_document(p_request_id uuid,p_type text,p_path text,p_mime text,p_size bigint)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare uid uuid:=auth.uid();
begin
 if uid is null then raise exception 'Entre na sua conta.' using errcode='42501'; end if;
 if p_type not in ('cnpj_card','identity','proof_of_address','authorization') then raise exception 'Tipo de documento inválido.' using errcode='22023'; end if;
 if p_mime not in ('application/pdf','image/jpeg','image/png','image/webp') or p_size not between 1 and 5242880 then raise exception 'Arquivo inválido. Use PDF, JPG, PNG ou WEBP de até 5 MB.' using errcode='22023'; end if;
 if p_path not like uid::text||'/'||p_request_id::text||'/%' then raise exception 'Caminho de arquivo inválido.' using errcode='42501'; end if;
 if not exists(select 1 from public.company_registration_requests where id=p_request_id and user_id=uid and status='pending') then raise exception 'Solicitação não encontrada ou já analisada.' using errcode='42501'; end if;
 insert into public.company_registration_documents(request_id,user_id,document_type,storage_path,mime_type,file_size)
 values(p_request_id,uid,p_type,p_path,p_mime,p_size)
 on conflict(request_id,document_type) do update set storage_path=excluded.storage_path,mime_type=excluded.mime_type,file_size=excluded.file_size,created_at=now();
 return jsonb_build_object('saved',true,'type',p_type);
end $$;

create or replace function public.list_company_registration_documents(p_request_id uuid)
returns table(document_type text,storage_path text,mime_type text,file_size bigint)
language plpgsql security definer set search_path=''
as $$
declare uid uuid:=auth.uid();
begin
 if not public.is_platform_admin() and not exists(select 1 from public.company_registration_requests where id=p_request_id and user_id=uid) then
  raise exception 'Acesso não autorizado.' using errcode='42501';
 end if;
 return query select d.document_type,d.storage_path,d.mime_type,d.file_size from public.company_registration_documents d where d.request_id=p_request_id;
end $$;

create or replace function public.submit_company_registration(p_cnpj text,p_legal_name text,p_trade_name text,p_contact_phone text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare uid uuid:=auth.uid(); digits text:=regexp_replace(coalesce(p_cnpj,''),'\\D','','g'); request_id uuid;
begin
 if uid is null or not private.verified(uid) then raise exception 'Confirme seu e-mail ou telefone antes de solicitar cadastro empresarial.' using errcode='42501'; end if;
 perform private.enforce_rate_limit('company.registration_request',3,86400);
 if not public.valid_cnpj(digits) then raise exception 'CNPJ inválido. Confira os 14 números e os dígitos verificadores.' using errcode='22023'; end if;
 if length(trim(coalesce(p_legal_name,''))) not between 2 and 160 or length(trim(coalesce(p_trade_name,''))) not between 2 and 100 then raise exception 'Confira a razão social e o nome fantasia.' using errcode='22023'; end if;
 if length(regexp_replace(coalesce(p_contact_phone,''),'\\D','','g')) not between 10 and 11 then raise exception 'Informe um telefone com DDD.' using errcode='22023'; end if;
 if exists(select 1 from public.restaurantes r where r.cnpj=digits) or exists(select 1 from public.company_registration_requests q where q.cnpj=digits and q.status in ('pending','approved')) then raise exception 'Este CNPJ já possui cadastro ou solicitação em análise.' using errcode='23505'; end if;
 insert into public.company_registration_requests(user_id,cnpj,legal_name,trade_name,contact_phone) values(uid,digits,trim(p_legal_name),trim(p_trade_name),regexp_replace(p_contact_phone,'\\D','','g')) returning id into request_id;
 return jsonb_build_object('requestId',request_id,'status','pending');
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('company-registration-documents','company-registration-documents',false,5242880,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists company_docs_upload_owner on storage.objects;
create policy company_docs_upload_owner on storage.objects for insert to authenticated
with check (bucket_id='company-registration-documents' and (storage.foldername(name))[1]=auth.uid()::text
 and exists(select 1 from public.company_registration_requests q where q.id::text=(storage.foldername(name))[2] and q.user_id=auth.uid() and q.status='pending'));
drop policy if exists company_docs_read_owner on storage.objects;
create policy company_docs_read_owner on storage.objects for select to authenticated
using (bucket_id='company-registration-documents' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_platform_admin()));
drop policy if exists company_docs_update_owner on storage.objects;
create policy company_docs_update_owner on storage.objects for update to authenticated
using (bucket_id='company-registration-documents' and (storage.foldername(name))[1]=auth.uid()::text)
with check (bucket_id='company-registration-documents' and (storage.foldername(name))[1]=auth.uid()::text);

revoke all on function public.register_company_document(uuid,text,text,text,bigint) from public,anon;
revoke all on function public.list_company_registration_documents(uuid) from public,anon;
grant execute on function public.register_company_document(uuid,text,text,text,bigint) to authenticated;
grant execute on function public.list_company_registration_documents(uuid) to authenticated;
grant execute on function public.valid_cnpj(text) to authenticated;
