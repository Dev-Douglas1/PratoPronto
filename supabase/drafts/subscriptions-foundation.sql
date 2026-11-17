-- DRAFT ONLY: subscription foundation for PratoPronto.
-- Intentionally outside supabase/migrations; NOT applied to any database.
-- Review and test only in an isolated local/test database first.
--
-- Current application contract remains Supabase RPC/PostgreSQL.
-- Subscription state and anti-abuse records live in private, not the Data API.
-- restaurants.account_status remains exclusively administrative.
-- Commercial subscription eligibility is an independent authorization gate.
-- No payment provider, invoice collection, webhook, or live billing is included.

create schema if not exists private;

create table if not exists private.subscription_plans (
  code text primary key,
  name text not null,
  description text not null default '',
  price_cents integer not null check (price_cents >= 0),
  billing_interval text not null default 'month'
    check (billing_interval in ('month', 'year', 'none')),
  trial_days integer not null default 0 check (trial_days between 0 and 365),
  features jsonb not null default '{}'::jsonb
    check (jsonb_typeof(features) = 'object'),
  active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into private.subscription_plans
  (code, name, description, price_cents, billing_interval, trial_days, display_order)
values
  ('basic', 'Basic', 'Plano gratuito com recursos essenciais.', 0, 'none', 0, 1),
  ('intermediate', 'Intermediário', 'Plano intermediário.', 5990, 'month', 30, 2),
  ('pro', 'Pro', 'Plano avançado.', 9990, 'month', 0, 3)
on conflict (code) do nothing;

create table if not exists private.restaurant_subscriptions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null unique
    references public.restaurantes(id) on delete restrict,
  plan_code text not null references private.subscription_plans(code) on update restrict on delete restrict,
  status text not null
    check (status in ('trialing', 'active', 'past_due', 'expired', 'canceled', 'suspended')),
  plan_name_snapshot text not null,
  plan_price_cents_snapshot integer not null check (plan_price_cents_snapshot >= 0),
  started_at timestamptz not null default now(),
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  current_period_started_at timestamptz,
  current_period_ends_at timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_subscription_trial_dates_check check (
    status <> 'trialing' or (
      trial_started_at is not null
      and trial_ends_at is not null
      and trial_ends_at > trial_started_at
    )
  ),
  constraint restaurant_subscription_period_dates_check check (
    current_period_ends_at is null
    or current_period_started_at is null
    or current_period_ends_at > current_period_started_at
  ),
  constraint restaurant_subscription_cancel_check check (
    not cancel_at_period_end or status = 'active'
  )
);

create index if not exists restaurant_subscriptions_status_expiry_idx
  on private.restaurant_subscriptions (status, current_period_ends_at);

create table if not exists private.subscription_trial_registry (
  -- Full 14-digit CNPJ, including branch digits, is the durable anti-repeat key.
  -- Keep this row when the account or restaurant is deleted.
  cnpj text primary key check (cnpj ~ '^[0-9]{14}$'),
  restaurant_id uuid unique
    references public.restaurantes(id) on delete set null,
  trial_subscription_id uuid
    references private.restaurant_subscriptions(id) on delete set null,
  granted_at timestamptz not null default now(),
  trial_started_at timestamptz not null,
  trial_ends_at timestamptz not null,
  approved_registration_id uuid
    references public.company_registration_requests(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  constraint subscription_trial_registry_dates_check
    check (trial_ends_at > trial_started_at)
);

create index if not exists subscription_trial_registry_restaurant_idx
  on private.subscription_trial_registry (restaurant_id)
  where restaurant_id is not null;

create table if not exists private.subscription_events (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid references public.restaurantes(id) on delete set null,
  subscription_id uuid
    references private.restaurant_subscriptions(id) on delete set null,
  event_type text not null check (event_type in (
    'plan_assigned',
    'trial_granted',
    'trial_rejected_duplicate',
    'trial_expired',
    'subscription_activated',
    'subscription_renewed',
    'subscription_canceled',
    'subscription_expired',
    'subscription_suspended',
    'subscription_reactivated',
    'plan_changed',
    'admin_adjustment'
  )),
  actor_user_id uuid references auth.users(id) on delete set null,
  -- Operational metadata only: never persist passwords, tokens, card data,
  -- provider credentials, or unfiltered webhook payloads.
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists subscription_events_restaurant_created_idx
  on private.subscription_events (restaurant_id, created_at desc);
create index if not exists subscription_events_subscription_created_idx
  on private.subscription_events (subscription_id, created_at desc);

alter table private.subscription_plans enable row level security;
alter table private.restaurant_subscriptions enable row level security;
alter table private.subscription_trial_registry enable row level security;
alter table private.subscription_events enable row level security;

revoke all on table
  private.subscription_plans,
  private.restaurant_subscriptions,
  private.subscription_trial_registry,
  private.subscription_events
from public, anon, authenticated;

-- Commercial gate only. Callers must separately enforce restaurantes.account_status
-- and the member's role/permission. Basic is perpetual; trial and paid plans
-- require a future expiry. There is no grace period.
create or replace function private.restaurant_subscription_allows_operations(
  p_restaurant_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $function$
  select exists (
    select 1
    from private.restaurant_subscriptions s
    join private.subscription_plans p on p.code = s.plan_code
    where s.restaurant_id = p_restaurant_id
      and p.active = true
      and (
        (p.code = 'basic' and s.status = 'active')
        or (s.status = 'trialing' and s.trial_ends_at > now())
        or (s.status = 'active' and p.code <> 'basic'
            and s.current_period_ends_at > now())
      )
  );
$function$;

revoke all on function private.restaurant_subscription_allows_operations(uuid)
  from public, anon, authenticated;

comment on table private.subscription_trial_registry is
  'Permanent one-trial-per-full-CNPJ registry; survives user/restaurant deletion.';
comment on table private.subscription_events is
  'Audit history for subscription and trial lifecycle events.';
comment on function private.restaurant_subscription_allows_operations(uuid) is
  'Commercial subscription gate only; administrative status must be checked independently.';
