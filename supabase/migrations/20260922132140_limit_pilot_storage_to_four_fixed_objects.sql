
drop policy if exists "pilot docs own insert" on storage.objects;
drop policy if exists "pilot docs own update" on storage.objects;
drop policy if exists "pilot docs own delete" on storage.objects;
drop policy if exists "pilot docs own read" on storage.objects;

create policy "pilot docs own insert"
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
);

create policy "pilot docs own update"
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
)
with check (
  bucket_id='pilot-documents'
  and name in (
    (select auth.uid()::text)||'/profile',
    (select auth.uid()::text)||'/motorcycle',
    (select auth.uid()::text)||'/cnh-front',
    (select auth.uid()::text)||'/cnh-back'
  )
);

create policy "pilot docs own delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id='pilot-documents'
  and name in (
    (select auth.uid()::text)||'/profile',
    (select auth.uid()::text)||'/motorcycle',
    (select auth.uid()::text)||'/cnh-front',
    (select auth.uid()::text)||'/cnh-back'
  )
);

create policy "pilot docs own read"
on storage.objects
for select
to authenticated
using (
  bucket_id='pilot-documents'
  and (
    name in (
      (select auth.uid()::text)||'/profile',
      (select auth.uid()::text)||'/motorcycle',
      (select auth.uid()::text)||'/cnh-front',
      (select auth.uid()::text)||'/cnh-back'
    )
    or public.is_platform_admin()
  )
);
