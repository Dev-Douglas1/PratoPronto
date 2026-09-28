-- Minimal PostgreSQL fixture for the account/team boundary, never loaded in production.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create schema private;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,phone_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz,raw_user_meta_data jsonb default '{}');
create table public.restaurantes(id uuid primary key default gen_random_uuid(),slug text unique,account_status text default 'active');
create table public.restaurant_members(id uuid primary key default gen_random_uuid(),restaurante_id uuid references public.restaurantes(id),profile_id uuid references auth.users(id),role text not null check(role in ('owner','admin','attendant','kitchen')),active boolean not null default true,updated_at timestamptz default now(),unique(restaurante_id,profile_id));
create table private.rpc_rate_limits(scope text,actor_id uuid,bucket_start timestamptz,hits integer,primary key(scope,actor_id,bucket_start));
CREATE OR REPLACE FUNCTION private.verified(actor uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists(
    select 1
    from auth.users
    where id = actor
      and (email_confirmed_at is not null or phone_confirmed_at is not null)
      and deleted_at is null
  )
$function$
;

CREATE OR REPLACE FUNCTION private.restaurant_id_from_slug(p_slug text)
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select r.id from public.restaurantes r where r.slug=lower(trim(p_slug)) limit 1
$function$
;

CREATE OR REPLACE FUNCTION private.restaurant_role(p_restaurant_id uuid, p_user_id uuid DEFAULT auth.uid())
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select rm.role
  from public.restaurant_members rm
  join public.restaurantes r on r.id=rm.restaurante_id
  where rm.restaurante_id=p_restaurant_id
    and rm.profile_id=p_user_id
    and rm.active=true
    and r.account_status='active'
  limit 1
$function$
;

CREATE OR REPLACE FUNCTION private.restaurant_member(p_restaurant_id uuid, p_roles text[] DEFAULT NULL::text[], p_user_id uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select private.verified(p_user_id) and exists(
    select 1
    from public.restaurant_members rm
    join public.restaurantes r on r.id=rm.restaurante_id
    where rm.restaurante_id=p_restaurant_id
      and rm.profile_id=p_user_id
      and rm.active=true
      and r.account_status<>'blocked'
      and (p_roles is null or rm.role=any(p_roles))
  )
$function$
;

CREATE OR REPLACE FUNCTION public.list_restaurant_members(p_restaurant_slug text)
 RETURNS TABLE(id uuid, profile_id uuid, email text, role text, active boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select rm.id,rm.profile_id,coalesce(u.email,''),rm.role,rm.active
  from public.restaurant_members rm
  join auth.users u on u.id=rm.profile_id
  where rm.restaurante_id=private.restaurant_id_from_slug(p_restaurant_slug)
    and rm.active=true
    and private.restaurant_member(rm.restaurante_id,array['owner','admin'],auth.uid())
  order by case rm.role when 'owner' then 0 when 'admin' then 1 when 'attendant' then 2 else 3 end,u.email
$function$
;

CREATE OR REPLACE FUNCTION private.enforce_rate_limit(p_scope text, p_limit integer, p_window_seconds integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  uid uuid:=auth.uid();
  start_at timestamptz;
  current_hits integer;
begin
  if uid is null then raise exception 'Entre novamente para continuar.'; end if;
  if p_limit < 1 or p_window_seconds < 1 then raise exception 'Configuração de limite inválida.'; end if;

  start_at:=to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  insert into private.rpc_rate_limits(scope,actor_id,bucket_start,hits)
  values(left(p_scope,80),uid,start_at,1)
  on conflict(scope,actor_id,bucket_start)
  do update set hits=private.rpc_rate_limits.hits+1
  returning hits into current_hits;

  if current_hits > p_limit then
    raise exception 'Muitas tentativas em pouco tempo. Aguarde e tente novamente.';
  end if;

  delete from private.rpc_rate_limits
  where bucket_start < now()-interval '2 days';
end
$function$
;
alter table public.restaurant_members enable row level security;
create policy members_read on public.restaurant_members for select to authenticated using(profile_id=auth.uid() or private.restaurant_member(restaurante_id,array['owner','admin'],auth.uid()));
grant usage on schema auth,private to authenticated,anon;
grant all on public.restaurant_members to authenticated,anon;
insert into auth.users(id,email,email_confirmed_at)
select ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'user'||n||'@example.test',now() from generate_series(1,10) n;
update auth.users set email='phone@example.test',email_confirmed_at=null,phone_confirmed_at=now() where email='user7@example.test';
update auth.users set email_confirmed_at=null where email='user8@example.test';
update auth.users set banned_until=now()+interval '1 day' where email='user9@example.test';
update auth.users set deleted_at=now() where email='user10@example.test';
insert into public.restaurantes(id,slug) values('20000000-0000-4000-8000-000000000001','loja-a'),('20000000-0000-4000-8000-000000000002','loja-b');
insert into public.restaurant_members(restaurante_id,profile_id,role) values
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','owner'),
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','admin'),
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000005','kitchen'),
('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000006','admin'),
('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000004','owner');
