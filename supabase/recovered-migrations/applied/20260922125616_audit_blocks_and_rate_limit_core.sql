
create table if not exists private.rpc_rate_limits (
  scope text not null,
  actor_id uuid not null,
  bucket_start timestamptz not null,
  hits integer not null default 0,
  primary key(scope, actor_id, bucket_start)
);
revoke all on private.rpc_rate_limits from public, anon, authenticated;

create index if not exists rpc_rate_limits_bucket_idx
  on private.rpc_rate_limits(bucket_start);

create or replace function private.enforce_rate_limit(
  p_scope text,
  p_limit integer,
  p_window_seconds integer
)
returns void
language plpgsql
security definer
set search_path=''
as $$
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
$$;
revoke all on function private.enforce_rate_limit(text,integer,integer) from public,anon,authenticated;

alter table public.restaurantes
  add column if not exists account_status text not null default 'active',
  add column if not exists blocked_reason text not null default '',
  add column if not exists blocked_at timestamptz,
  add column if not exists blocked_by uuid references public.profiles(id) on delete set null;

alter table public.pilot_profiles
  add column if not exists account_status text not null default 'active',
  add column if not exists blocked_reason text not null default '',
  add column if not exists blocked_at timestamptz,
  add column if not exists blocked_by uuid references public.profiles(id) on delete set null;

do $$
begin
  if not exists(select 1 from pg_constraint where conname='restaurantes_account_status_check') then
    alter table public.restaurantes
      add constraint restaurantes_account_status_check
      check(account_status in ('active','suspended','blocked'));
  end if;
  if not exists(select 1 from pg_constraint where conname='pilot_profiles_account_status_check') then
    alter table public.pilot_profiles
      add constraint pilot_profiles_account_status_check
      check(account_status in ('active','suspended','blocked'));
  end if;
end $$;

create index if not exists restaurantes_account_status_idx
  on public.restaurantes(account_status,ativo);
create index if not exists pilot_profiles_account_status_idx
  on public.pilot_profiles(account_status,approval_status,accepting_offers);

create or replace function private.restaurant_role(p_restaurant_id uuid,p_user_id uuid default auth.uid())
returns text
language sql
stable
security definer
set search_path=''
as $$
  select rm.role
  from public.restaurant_members rm
  join public.restaurantes r on r.id=rm.restaurante_id
  where rm.restaurante_id=p_restaurant_id
    and rm.profile_id=p_user_id
    and rm.active=true
    and r.account_status='active'
  limit 1
$$;

create or replace function private.restaurant_member(
  p_restaurant_id uuid,
  p_roles text[] default null,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
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
$$;

create or replace function private.pilot_operational(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select private.verified(p_user_id) and exists(
    select 1 from public.pilot_profiles pp
    where pp.profile_id=p_user_id
      and pp.approval_status='approved'
      and pp.account_status='active'
  )
$$;
revoke all on function private.pilot_operational(uuid) from public,anon,authenticated;

create or replace function private.pilot_available(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1 from public.pilot_profiles pp
    where pp.profile_id=p_user_id
      and pp.approval_status='approved'
      and pp.account_status='active'
      and pp.accepting_offers=true
  )
$$;
revoke all on function private.pilot_available(uuid) from public,anon,authenticated;

create table if not exists public.audit_events (
  id bigint generated by default as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  restaurant_id uuid references public.restaurantes(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.audit_events enable row level security;
revoke all on public.audit_events from anon,authenticated;
grant select on public.audit_events to authenticated;

create index if not exists audit_events_restaurant_created_idx
  on public.audit_events(restaurant_id,created_at desc);
create index if not exists audit_events_actor_created_idx
  on public.audit_events(actor_id,created_at desc);
create index if not exists audit_events_action_created_idx
  on public.audit_events(action,created_at desc);

drop policy if exists "audit platform or restaurant managers read" on public.audit_events;
create policy "audit platform or restaurant managers read"
on public.audit_events
for select
to authenticated
using(
  public.is_platform_admin()
  or (
    restaurant_id is not null
    and private.restaurant_member(restaurant_id,array['owner','admin'],(select auth.uid()))
  )
);

create or replace function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  newj jsonb:=case when tg_op='DELETE' then '{}'::jsonb else to_jsonb(new) end;
  oldj jsonb:=case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end;
  rid uuid;
  target text;
  meta jsonb;
begin
  rid:=coalesce(
    nullif(newj->>'restaurant_id','')::uuid,
    nullif(newj->>'restaurante_id','')::uuid,
    nullif(oldj->>'restaurant_id','')::uuid,
    nullif(oldj->>'restaurante_id','')::uuid,
    case when tg_table_name='restaurantes' then coalesce(nullif(newj->>'id','')::uuid,nullif(oldj->>'id','')::uuid) else null end
  );

  target:=coalesce(
    newj->>'id',newj->>'profile_id',newj->>'order_id',
    oldj->>'id',oldj->>'profile_id',oldj->>'order_id',''
  );

  meta:=jsonb_strip_nulls(jsonb_build_object(
    'operation',lower(tg_op),
    'status',coalesce(newj->>'status',oldj->>'status'),
    'role',coalesce(newj->>'role',oldj->>'role'),
    'approvalStatus',coalesce(newj->>'approval_status',oldj->>'approval_status'),
    'accountStatus',coalesce(newj->>'account_status',oldj->>'account_status'),
    'deliveryStatus',coalesce(newj->>'delivery_status',oldj->>'delivery_status'),
    'active',coalesce(newj->>'active',newj->>'ativo',oldj->>'active',oldj->>'ativo')
  ));

  insert into public.audit_events(actor_id,restaurant_id,action,target_type,target_id,metadata)
  values(auth.uid(),rid,tg_table_name||'.'||lower(tg_op),tg_table_name,target,meta);

  return case when tg_op='DELETE' then old else new end;
end
$$;
revoke all on function private.audit_row_change() from public,anon,authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'restaurantes','restaurant_members','restaurant_settings','products',
    'orders','order_delivery_offers','reviews','refund_requests',
    'pilot_profiles','restaurant_pilot_contacts'
  ]
  loop
    execute format('drop trigger if exists audit_%I on public.%I',t,t);
    execute format(
      'create trigger audit_%I after insert or update or delete on public.%I for each row execute function private.audit_row_change()',
      t,t
    );
  end loop;
end $$;

create or replace function public.list_platform_restaurants()
returns table(
  restaurant_id uuid,
  slug text,
  name text,
  open boolean,
  account_status text,
  blocked_reason text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path=''
as $$
begin
  if not public.is_platform_admin() then raise exception 'Acesso exclusivo da administração da plataforma.'; end if;
  return query
    select r.id,r.slug,r.nome,r.ativo,r.account_status,r.blocked_reason,r.created_at
    from public.restaurantes r
    order by r.created_at desc;
end
$$;
revoke all on function public.list_platform_restaurants() from public;
grant execute on function public.list_platform_restaurants() to authenticated;

create or replace function public.set_restaurant_account_status(
  p_slug text,
  p_status text,
  p_reason text default ''
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare uid uuid:=auth.uid(); rid uuid; reason text:=trim(coalesce(p_reason,''));
begin
  perform private.enforce_rate_limit('platform.restaurant_status',30,60);
  if not public.is_platform_admin() then raise exception 'Acesso exclusivo da administração da plataforma.'; end if;
  if p_status not in ('active','suspended','blocked') then raise exception 'Status inválido.'; end if;
  if p_status<>'active' and char_length(reason)<3 then raise exception 'Informe o motivo do bloqueio ou suspensão.'; end if;

  select id into rid from public.restaurantes where slug=lower(trim(p_slug)) for update;
  if rid is null then raise exception 'Empresa não encontrada.'; end if;

  update public.restaurantes
  set account_status=p_status,
      ativo=case when p_status='active' then ativo else false end,
      blocked_reason=case when p_status='active' then '' else left(reason,500) end,
      blocked_at=case when p_status='active' then null else now() end,
      blocked_by=case when p_status='active' then null else uid end,
      updated_at=now()
  where id=rid;

  if p_status<>'active' then
    update public.restaurant_settings
    set data=jsonb_set(data,'{acceptingOrders}','false'::jsonb,true),
        updated_by=uid,updated_at=now()
    where restaurante_id=rid;
  end if;

  return jsonb_build_object('companyId',lower(trim(p_slug)),'status',p_status);
end
$$;
revoke all on function public.set_restaurant_account_status(text,text,text) from public;
grant execute on function public.set_restaurant_account_status(text,text,text) to authenticated;

create or replace function public.set_pilot_account_status(
  p_profile_id uuid,
  p_status text,
  p_reason text default ''
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare uid uuid:=auth.uid(); reason text:=trim(coalesce(p_reason,''));
begin
  perform private.enforce_rate_limit('platform.pilot_status',30,60);
  if not public.is_platform_admin() then raise exception 'Acesso exclusivo da administração da plataforma.'; end if;
  if p_status not in ('active','suspended','blocked') then raise exception 'Status inválido.'; end if;
  if p_status<>'active' and char_length(reason)<3 then raise exception 'Informe o motivo do bloqueio ou suspensão.'; end if;
  if not exists(select 1 from public.pilot_profiles where profile_id=p_profile_id) then raise exception 'Piloto não encontrado.'; end if;

  update public.pilot_profiles
  set account_status=p_status,
      accepting_offers=case when p_status='active' and approval_status='approved' then accepting_offers else false end,
      blocked_reason=case when p_status='active' then '' else left(reason,500) end,
      blocked_at=case when p_status='active' then null else now() end,
      blocked_by=case when p_status='active' then null else uid end,
      updated_at=now()
  where profile_id=p_profile_id;

  return jsonb_build_object('profileId',p_profile_id,'status',p_status);
end
$$;
revoke all on function public.set_pilot_account_status(uuid,text,text) from public;
grant execute on function public.set_pilot_account_status(uuid,text,text) to authenticated;

drop policy if exists "restaurants public read" on public.restaurantes;
create policy "restaurants public read"
on public.restaurantes
for select
to anon,authenticated
using(
  (ativo=true and account_status='active')
  or private.restaurant_member(id,null,(select auth.uid()))
  or public.is_platform_admin()
);

drop policy if exists "products public read" on public.products;
create policy "products public read"
on public.products
for select
to anon,authenticated
using(
  (
    active=true
    and exists(
      select 1 from public.restaurantes r
      where r.id=restaurant_id and r.ativo=true and r.account_status='active'
    )
  )
  or private.restaurant_member(restaurant_id,array['owner','admin','attendant','kitchen'],(select auth.uid()))
  or public.is_platform_admin()
);
