create or replace function private.verified(actor uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists(
    select 1
    from auth.users
    where id = actor
      and (email_confirmed_at is not null or phone_confirmed_at is not null)
      and deleted_at is null
  )
$function$;

revoke all on function private.restaurant_membership_exists(uuid, uuid) from public;
grant execute on function private.restaurant_membership_exists(uuid, uuid) to authenticated;
