-- Mark only token-authenticated Asaas webhook events as verified.
CREATE OR REPLACE FUNCTION public.edge_record_asaas_webhook(p_event_id text, p_event_type text, p_environment text, p_payload jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare existing_status text;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'Acesso restrito ao backend financeiro.' using errcode='42501'; end if;
  select processing_status into existing_status from private.webhook_events
  where provider='asaas' and environment=p_environment and external_event_id=p_event_id for update;
  if found and existing_status in ('processed','ignored') then return false; end if;
  if found then
    update private.webhook_events set processing_status='processing',attempts=attempts+1,
      signature_verified=true,last_error=null,payload_redacted=coalesce(p_payload,'{}'::jsonb)
    where provider='asaas' and environment=p_environment and external_event_id=p_event_id;
    return true;
  end if;
  insert into private.webhook_events(provider,environment,external_event_id,event_type,signature_verified,processing_status,attempts,payload_redacted)
  values('asaas',p_environment,p_event_id,p_event_type,true,'processing',1,coalesce(p_payload,'{}'::jsonb));
  return true;
end;
$function$;

revoke all on function public.edge_record_asaas_webhook(text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.edge_record_asaas_webhook(text,text,text,jsonb) to service_role;
