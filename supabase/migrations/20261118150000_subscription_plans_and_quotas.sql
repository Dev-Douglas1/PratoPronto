-- Assinaturas e limites por empresa. Esta migration deve ser aplicada primeiro em ambiente local.
-- Planos pagos permanecem indisponiveis ate existir integracao de cobranca/webhook verificado.

create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text not null default '',
  monthly_price_cents integer,
  product_limit integer,
  member_limit integer,
  monthly_order_limit integer,
  is_active boolean not null default false,
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_plans_code_check check (code ~ '^[a-z0-9][a-z0-9_-]{1,39}$'),
  constraint subscription_plans_price_check check (monthly_price_cents is null or monthly_price_cents >= 0),
  constraint subscription_plans_product_limit_check check (product_limit is null or product_limit >= 0),
  constraint subscription_plans_member_limit_check check (member_limit is null or member_limit >= 1),
  constraint subscription_plans_order_limit_check check (monthly_order_limit is null or monthly_order_limit >= 0)
);

create table if not exists public.restaurant_subscriptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null unique references public.restaurantes(id) on delete restrict,
  plan_id uuid not null references public.subscription_plans(id) on delete restrict,
  status text not null default 'active',
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  external_provider text,
  external_customer_id text,
  external_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_subscriptions_status_check check (status in ('active','trialing','pending_payment','past_due','canceled','expired')),
  constraint restaurant_subscriptions_provider_check check (external_provider is null or external_provider in ('mercadopago'))
);

create index if not exists restaurant_subscriptions_plan_status_idx on public.restaurant_subscriptions(plan_id,status);
create index if not exists restaurant_subscriptions_period_end_idx on public.restaurant_subscriptions(current_period_end) where current_period_end is not null;

insert into public.subscription_plans
  (code,name,description,monthly_price_cents,product_limit,member_limit,monthly_order_limit,is_active,is_public)
values
  ('gratuito','Gratuito','Plano inicial com limites operacionais configuráveis.',0,20,2,100,true,true)
on conflict (code) do nothing;

insert into public.restaurant_subscriptions (restaurant_id,plan_id,status)
select r.id,p.id,'active'
from public.restaurantes r
cross join public.subscription_plans p
where p.code='gratuito'
on conflict (restaurant_id) do nothing;

create or replace function private.subscription_is_entitled(p_restaurant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.restaurant_subscriptions s
    join public.subscription_plans p on p.id=s.plan_id
    where s.restaurant_id=p_restaurant_id
      and p.is_active=true
      and (s.status in ('active','trialing') or (s.status='canceled' and s.current_period_end > now()))
      and (s.current_period_end is null or s.current_period_end > now())
  );
$$;

create or replace function private.enforce_subscription_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rid uuid;
  plan_row public.subscription_plans;
  current_count bigint;
  quota integer;
begin
  if tg_table_name='products' then
    rid:=new.restaurant_id;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('subscription-quota:' || rid::text, 0));
    if tg_op='UPDATE' and old.restaurant_id is not distinct from new.restaurant_id then
      return new;
    end if;
    select p.* into plan_row
    from public.restaurant_subscriptions s
    join public.subscription_plans p on p.id=s.plan_id
    where s.restaurant_id=rid and p.is_active=true
      and (s.status in ('active','trialing') or (s.status='canceled' and s.current_period_end > now()))
      and (s.current_period_end is null or s.current_period_end > now());
    if not found then raise exception 'Assinatura inativa ou vencida. Regularize o plano para cadastrar produtos.' using errcode='P0001'; end if;
    quota:=plan_row.product_limit;
    if quota is not null then
      select count(*) into current_count from public.products p where p.restaurant_id=rid;
      if current_count >= quota then raise exception 'Limite do plano atingido: % produtos. Atualize o plano para continuar.',quota using errcode='P0001'; end if;
    end if;
  elsif tg_table_name='restaurant_members' then
    rid:=new.restaurante_id;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('subscription-quota:' || rid::text, 0));
    if tg_op='UPDATE' and old.restaurante_id is not distinct from new.restaurante_id and (new.active is not true or old.active is true) then
      return new;
    end if;
    if new.active is not true then return new; end if;
    select p.* into plan_row
    from public.restaurant_subscriptions s
    join public.subscription_plans p on p.id=s.plan_id
    where s.restaurant_id=rid and p.is_active=true
      and (s.status in ('active','trialing') or (s.status='canceled' and s.current_period_end > now()))
      and (s.current_period_end is null or s.current_period_end > now());
    if not found then raise exception 'Assinatura inativa ou vencida. Regularize o plano para gerenciar a equipe.' using errcode='P0001'; end if;
    quota:=plan_row.member_limit;
    if quota is not null then
      select count(*) into current_count from public.restaurant_members m where m.restaurante_id=rid and m.active=true;
      if current_count >= quota then raise exception 'Limite do plano atingido: % membros ativos na equipe.',quota using errcode='P0001'; end if;
    end if;
  elsif tg_table_name='orders' then
    rid:=new.restaurant_id;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('subscription-quota:' || rid::text, 0));
    select p.* into plan_row
    from public.restaurant_subscriptions s
    join public.subscription_plans p on p.id=s.plan_id
    where s.restaurant_id=rid and p.is_active=true
      and (s.status in ('active','trialing') or (s.status='canceled' and s.current_period_end > now()))
      and (s.current_period_end is null or s.current_period_end > now());
    if not found then raise exception 'Assinatura inativa ou vencida. A empresa não pode receber novos pedidos.' using errcode='P0001'; end if;
    quota:=plan_row.monthly_order_limit;
    if quota is not null then
      select count(*) into current_count from public.orders o
      where o.restaurant_id=rid
        and o.created_at >= date_trunc('month',now())
        and o.created_at < date_trunc('month',now()) + interval '1 month';
      if current_count >= quota then raise exception 'Limite mensal do plano atingido: % pedidos.',quota using errcode='P0001'; end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists products_subscription_quota on public.products;
create trigger products_subscription_quota
before insert or update of restaurant_id on public.products
for each row execute function private.enforce_subscription_quota();

drop trigger if exists restaurant_members_subscription_quota on public.restaurant_members;
create trigger restaurant_members_subscription_quota
before insert or update of restaurante_id,active on public.restaurant_members
for each row execute function private.enforce_subscription_quota();

drop trigger if exists orders_subscription_quota on public.orders;
create trigger orders_subscription_quota
before insert on public.orders
for each row execute function private.enforce_subscription_quota();

create or replace function private.assign_free_subscription_to_new_restaurant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare free_plan_id uuid;
begin
  select id into free_plan_id from public.subscription_plans where code='gratuito' and is_active=true;
  if free_plan_id is not null then
    insert into public.restaurant_subscriptions(restaurant_id,plan_id,status)
    values(new.id,free_plan_id,'active')
    on conflict(restaurant_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists restaurants_default_subscription on public.restaurantes;
create trigger restaurants_default_subscription
after insert on public.restaurantes
for each row execute function private.assign_free_subscription_to_new_restaurant();

create or replace function public.get_my_restaurant_subscription(p_restaurant_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  rid uuid;
  result jsonb;
begin
  rid:=private.restaurant_id_from_slug(p_restaurant_slug);
  if rid is null or not exists (
    select 1 from public.restaurant_members rm
    where rm.restaurante_id=rid and rm.profile_id=auth.uid()
      and rm.active=true and rm.role in ('owner','admin')
  ) then
    raise exception 'Sem permissão para consultar a assinatura desta empresa.' using errcode='42501';
  end if;

  select jsonb_build_object(
    'subscriptionId',s.id,'status',s.status,'periodStart',s.current_period_start,
    'periodEnd',s.current_period_end,'cancelAtPeriodEnd',s.cancel_at_period_end,
    'plan',jsonb_build_object('code',p.code,'name',p.name,'description',p.description,
      'monthlyPriceCents',p.monthly_price_cents,'productLimit',p.product_limit,
      'memberLimit',p.member_limit,'monthlyOrderLimit',p.monthly_order_limit),
    'usage',jsonb_build_object(
      'products',(select count(*) from public.products x where x.restaurant_id=rid),
      'members',(select count(*) from public.restaurant_members x where x.restaurante_id=rid and x.active=true),
      'monthlyOrders',(select count(*) from public.orders x where x.restaurant_id=rid and x.created_at>=date_trunc('month',now()) and x.created_at<date_trunc('month',now()) + interval '1 month')
    ),
    'entitled',private.subscription_is_entitled(rid)
  ) into result
  from public.restaurant_subscriptions s
  join public.subscription_plans p on p.id=s.plan_id
  where s.restaurant_id=rid;

  return coalesce(result,jsonb_build_object('status','missing','entitled',false));
end;
$$;

create or replace function public.list_platform_subscriptions()
returns table(
  restaurant_id uuid, restaurant_slug text, restaurant_name text,
  subscription_id uuid, status text, period_end timestamptz,
  plan_code text, plan_name text, monthly_price_cents integer,
  product_limit integer, member_limit integer, monthly_order_limit integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Acesso restrito à administração da plataforma.' using errcode='42501';
  end if;
  return query
    select r.id,r.slug,r.nome,s.id,s.status,s.current_period_end,p.code,p.name,p.monthly_price_cents,
      p.product_limit,p.member_limit,p.monthly_order_limit
    from public.restaurantes r
    left join public.restaurant_subscriptions s on s.restaurant_id=r.id
    left join public.subscription_plans p on p.id=s.plan_id
    order by r.nome;
end;
$$;

create or replace function public.list_subscription_plans()
returns table(
  id uuid, code text, name text, description text, monthly_price_cents integer,
  product_limit integer, member_limit integer, monthly_order_limit integer,
  is_active boolean, is_public boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id,p.code,p.name,p.description,p.monthly_price_cents,p.product_limit,
    p.member_limit,p.monthly_order_limit,p.is_active,p.is_public
  from public.subscription_plans p
  where p.is_active=true and p.is_public=true
  order by p.monthly_price_cents nulls last,p.name;
$$;


create or replace function public.list_admin_subscription_plans()
returns table(
  id uuid, code text, name text, description text, monthly_price_cents integer,
  product_limit integer, member_limit integer, monthly_order_limit integer,
  is_active boolean, is_public boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then raise exception 'Acesso restrito à administração da plataforma.' using errcode='42501'; end if;
  return query select p.id,p.code,p.name,p.description,p.monthly_price_cents,p.product_limit,
    p.member_limit,p.monthly_order_limit,p.is_active,p.is_public
  from public.subscription_plans p order by p.monthly_price_cents nulls last,p.name;
end;
$$;

create or replace function public.admin_save_subscription_plan(
  p_code text,p_name text,p_description text,p_monthly_price_cents integer,
  p_product_limit integer,p_member_limit integer,p_monthly_order_limit integer,
  p_is_active boolean,p_is_public boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $
declare result_id uuid; previous_price integer;
begin
  if not public.is_platform_admin() then raise exception 'Acesso restrito à administração da plataforma.' using errcode='42501'; end if;
  if p_code !~ '^[a-z0-9][a-z0-9_-]{1,39}$' or length(trim(p_name))<2 then raise exception 'Código ou nome de plano inválido.' using errcode='22023'; end if;
  if p_monthly_price_cents is not null and p_monthly_price_cents<0 then raise exception 'Preço inválido.' using errcode='22023'; end if;
  if p_product_limit is not null and p_product_limit<0 then raise exception 'Limite de produtos inválido.' using errcode='22023'; end if;
  if p_member_limit is not null and p_member_limit<1 then raise exception 'Limite de membros inválido.' using errcode='22023'; end if;
  if p_monthly_order_limit is not null and p_monthly_order_limit<0 then raise exception 'Limite de pedidos inválido.' using errcode='22023'; end if;
  select monthly_price_cents into previous_price from public.subscription_plans where code=p_code for update;
  insert into public.subscription_plans(code,name,description,monthly_price_cents,product_limit,member_limit,monthly_order_limit,is_active,is_public,updated_at)
  values(p_code,trim(p_name),left(coalesce(p_description,''),500),p_monthly_price_cents,p_product_limit,p_member_limit,p_monthly_order_limit,p_is_active,p_is_public,now())
  on conflict(code) do update set name=excluded.name,description=excluded.description,
    monthly_price_cents=excluded.monthly_price_cents,product_limit=excluded.product_limit,
    member_limit=excluded.member_limit,monthly_order_limit=excluded.monthly_order_limit,
    is_active=excluded.is_active,is_public=excluded.is_public,updated_at=now()
  returning id into result_id;
  -- Alterar um plano para pago invalida acessos que estavam ativos sem confirmação de cobrança.
  if previous_price is distinct from p_monthly_price_cents and p_monthly_price_cents is distinct from 0 then
    update public.restaurant_subscriptions
    set status='pending_payment',updated_at=now()
    where plan_id=result_id and status in ('active','trialing');
  end if;
  return result_id;
end;
$;

create or replace function public.admin_set_restaurant_subscription(
  p_restaurant_id uuid,p_plan_code text,p_period_end timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare plan_row public.subscription_plans; current_row public.restaurant_subscriptions;
  next_status text; uid uuid:=auth.uid();
begin
  if not public.is_platform_admin() then raise exception 'Acesso restrito à administração da plataforma.' using errcode='42501'; end if;
  select * into plan_row from public.subscription_plans where code=p_plan_code and is_active=true;
  if plan_row.id is null then raise exception 'Plano inexistente ou inativo.' using errcode='22023'; end if;
  if p_period_end is not null and p_period_end<=now() then raise exception 'A data final precisa estar no futuro.' using errcode='22023'; end if;
  -- Plano pago nunca é ativado manualmente: aguarda confirmação do provedor.
  next_status:=case when plan_row.monthly_price_cents=0 then 'active' else 'pending_payment' end;
  insert into public.restaurant_subscriptions(restaurant_id,plan_id,status,current_period_start,current_period_end,cancel_at_period_end,canceled_at,external_provider,external_customer_id,external_subscription_id,updated_at)
  values(p_restaurant_id,plan_row.id,next_status,now(),p_period_end,false,null,null,null,null,now())
  on conflict(restaurant_id) do update set plan_id=excluded.plan_id,status=excluded.status,
    current_period_start=now(),current_period_end=excluded.current_period_end,
    cancel_at_period_end=false,canceled_at=null,external_provider=null,
    external_customer_id=null,external_subscription_id=null,updated_at=now()
  returning * into current_row;
  insert into public.audit_events(actor_id,restaurant_id,action,target_type,target_id,metadata)
  values(uid,p_restaurant_id,'subscription.plan_changed','restaurant_subscription',current_row.id::text,
    jsonb_build_object('planCode',plan_row.code,'status',next_status,'periodEnd',p_period_end));
  return jsonb_build_object('subscriptionId',current_row.id,'status',next_status,'planCode',plan_row.code);
end;
$$;

alter table public.subscription_plans enable row level security;
alter table public.restaurant_subscriptions enable row level security;
revoke all on public.subscription_plans from anon,authenticated;
revoke all on public.restaurant_subscriptions from anon,authenticated;
revoke all on function private.subscription_is_entitled(uuid) from public,anon,authenticated;
revoke all on function private.assign_free_subscription_to_new_restaurant() from public,anon,authenticated;
revoke all on function private.enforce_subscription_quota() from public,anon,authenticated;
revoke all on function public.get_my_restaurant_subscription(text) from public,anon;
revoke all on function public.list_platform_subscriptions() from public,anon;
revoke all on function public.list_subscription_plans() from public,anon;
revoke all on function public.list_admin_subscription_plans() from public,anon;
revoke all on function public.admin_save_subscription_plan(text,text,text,integer,integer,integer,integer,boolean,boolean) from public,anon;
revoke all on function public.admin_set_restaurant_subscription(uuid,text,timestamptz) from public,anon;
grant execute on function public.get_my_restaurant_subscription(text) to authenticated;
grant execute on function public.list_platform_subscriptions() to authenticated;
grant execute on function public.list_subscription_plans() to anon,authenticated;
grant execute on function public.list_admin_subscription_plans() to authenticated;
grant execute on function public.admin_save_subscription_plan(text,text,text,integer,integer,integer,integer,boolean,boolean) to authenticated;
grant execute on function public.admin_set_restaurant_subscription(uuid,text,timestamptz) to authenticated;
