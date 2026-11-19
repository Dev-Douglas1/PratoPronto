create or replace function public.review_company_registration(p_request_id uuid,p_approve boolean,p_note text default '')
returns jsonb language plpgsql security definer set search_path=''
as $$
declare q public.company_registration_requests%rowtype; new_slug text; rid uuid;
begin
 if not public.is_platform_admin() then raise exception 'Acesso restrito à administração da plataforma.' using errcode='42501'; end if;
 select * into q from public.company_registration_requests where id=p_request_id for update;
 if not found or q.status<>'pending' then raise exception 'Solicitação não encontrada ou já analisada.' using errcode='22023'; end if;
 if p_approve then
  if (select count(distinct document_type) from public.company_registration_documents where request_id=q.id and document_type in ('cnpj_card','identity','proof_of_address'))<3 then
   raise exception 'A solicitação precisa conter comprovante do CNPJ, documento do responsável e comprovante de endereço.' using errcode='22023';
  end if;
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