create or replace function public.can_upload_company_registration_document(p_request_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
 select exists(select 1 from public.company_registration_requests q where q.id=p_request_id and q.user_id=auth.uid() and q.status='pending')
$$;
revoke all on function public.can_upload_company_registration_document(uuid) from public,anon;
grant execute on function public.can_upload_company_registration_document(uuid) to authenticated;
drop policy if exists company_docs_upload_owner on storage.objects;
create policy company_docs_upload_owner on storage.objects for insert to authenticated
with check (bucket_id='company-registration-documents'
 and (storage.foldername(name))[1]=auth.uid()::text
 and public.can_upload_company_registration_document(((storage.foldername(name))[2])::uuid));
