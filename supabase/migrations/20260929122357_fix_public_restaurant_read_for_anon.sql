
drop policy if exists "restaurants public read" on public.restaurantes;

create policy "restaurants public read"
on public.restaurantes
for select
to anon, authenticated
using (
  (ativo = true and account_status = 'active')
  or (
    auth.role() = 'authenticated'
    and (
      private.restaurant_membership_exists(id, auth.uid())
      or public.is_platform_admin()
    )
  )
);
