
drop policy if exists "pilot docs own insert" on storage.objects;
drop policy if exists "pilot docs own update" on storage.objects;
drop policy if exists "pilot docs own delete" on storage.objects;

create policy "pilot docs draft insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id='pilot-documents'
  and name in (
    (select auth.uid()::text)||'/profile',
    (select auth.uid()::text)||'/motorcycle',
    (select auth.uid()::text)||'/cnh-front',
    (select auth.uid()::text)||'/cnh-back'
  )
  and exists(
    select 1 from public.pilot_profiles pp
    where pp.profile_id=(select auth.uid())
      and pp.approval_status in ('draft','rejected')
      and pp.account_status<>'blocked'
  )
);

create policy "pilot docs draft update"
on storage.objects
for update
to authenticated
using (
  bucket_id='pilot-documents'
  and name in (
    (select auth.uid()::text)||'/profile',
    (select auth.uid()::text)||'/motorcycle',
    (select auth.uid()::text)||'/cnh-front',
    (select auth.uid()::text)||'/cnh-back'
  )
  and exists(
    select 1 from public.pilot_profiles pp
    where pp.profile_id=(select auth.uid())
      and pp.approval_status in ('draft','rejected')
      and pp.account_status<>'blocked'
  )
)
with check (
  bucket_id='pilot-documents'
  and name in (
    (select auth.uid()::text)||'/profile',
    (select auth.uid()::text)||'/motorcycle',
    (select auth.uid()::text)||'/cnh-front',
    (select auth.uid()::text)||'/cnh-back'
  )
  and exists(
    select 1 from public.pilot_profiles pp
    where pp.profile_id=(select auth.uid())
      and pp.approval_status in ('draft','rejected')
      and pp.account_status<>'blocked'
  )
);

-- No authenticated DELETE policy: approved/pending documents cannot be removed
-- or swapped by the pilot outside the re-verification flow. Cleanup uses the
-- privileged Edge Function after the retention deadline.
