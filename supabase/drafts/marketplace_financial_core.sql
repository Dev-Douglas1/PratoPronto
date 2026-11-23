-- PratoPronto — núcleo financeiro do marketplace
-- RASCUNHO DE ARQUITETURA: NÃO APLICAR DIRETAMENTE EM PRODUÇÃO.
-- Dependências: schema private existente; extensão Supabase Vault ativa.
-- Compatibilidade: reutiliza public.restaurantes e public.orders existentes.
--
-- Regras comerciais congeladas para o lançamento:
--   mensalidade inicial: R$ 49,90 (4990 centavos)
--   comissão: 5% (500 bps) sobre subtotal dos produtos, SEM taxa de entrega
--   entrega: responsabilidade do restaurante
--   pedidos offline: comissão vira recebível do restaurante no ledger
--   pedidos online: Split do gateway; ledger registra liquidação e tarifas
--
-- As tabelas financeiras ficam no schema private e não são expostas ao Data API.
-- O React só lê o status resumido já mantido em public.orders.
-- Chaves das subcontas Asaas são armazenadas no Vault; nunca em colunas texto.
--
-- IMPORTANTE:
-- 1) Não executar antes de revisar o diff e testar em PostgreSQL isolado.
-- 2) Não altera checkout_order/quote_order nesta etapa.
-- 3) O fluxo atual checkout_order aceita apenas maquina_entrega e ativa
--    delivery_verification_required para piloto. A migração desse fluxo para
--    entrega própria do restaurante será uma etapa separada, com testes.
-- 4) A migration pendente de planos/assinaturas ainda precisa ser validada e
--    reconciliada antes de ligar cobrança recorrente real.

begin;

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- 1. Credenciais e recebedores por restaurante
-- ---------------------------------------------------------------------------

create table if not exists private.payment_gateway_accounts (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurantes(id) on delete restrict,
  provider text not null check (provider in ('asaas', 'pagarme')),
  environment text not null check (environment in ('sandbox', 'production')),
  provider_account_id text,
  wallet_id text,
  vault_secret_id uuid references vault.secrets(id) on delete restrict,
  onboarding_status text not null default 'pending'
    check (onboarding_status in ('pending', 'under_review', 'active', 'rejected', 'suspended', 'disabled')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (restaurant_id, provider, environment)
);

create unique index if not exists payment_gateway_accounts_provider_account_uidx
  on private.payment_gateway_accounts(provider, environment, provider_account_id)
  where provider_account_id is not null;

create index if not exists payment_gateway_accounts_restaurant_idx
  on private.payment_gateway_accounts(restaurant_id, environment);

alter table private.payment_gateway_accounts enable row level security;
revoke all on table private.payment_gateway_accounts from public, anon, authenticated;
grant select, insert, update on table private.payment_gateway_accounts to service_role;

comment on table private.payment_gateway_accounts is
  'Mapeamento privado de recebedores. Segredos ficam no Supabase Vault, referenciados por vault_secret_id.';

-- ---------------------------------------------------------------------------
-- 2. Pagamentos: pedidos e mensalidades
-- ---------------------------------------------------------------------------

create table if not exists private.payments (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurantes(id) on delete restrict,
  order_id uuid references public.orders(id) on delete restrict,
  purpose text not null check (purpose in ('order', 'subscription')),
  provider text check (provider is null or provider in ('asaas', 'pagarme')),
  environment text not null check (environment in ('sandbox', 'production', 'internal')),
  provider_payment_id text,
  provider_subscription_id text,
  external_reference text,
  idempotency_key text not null unique,
  method text not null check (method in ('pix', 'credit_card', 'cash_on_delivery', 'card_on_delivery', 'subscription')),
  status text not null default 'pending'
    check (status in ('pending', 'awaiting_payment', 'authorized', 'paid', 'partially_refunded', 'refunded', 'failed', 'cancelled', 'chargeback')),
  currency char(3) not null default 'BRL' check (currency = 'BRL'),
  gross_amount_cents bigint not null check (gross_amount_cents > 0),
  items_subtotal_cents bigint not null default 0 check (items_subtotal_cents >= 0),
  delivery_fee_cents bigint not null default 0 check (delivery_fee_cents >= 0),
  commission_rate_bps integer not null default 500 check (commission_rate_bps between 0 and 10000),
  commission_base_cents bigint not null default 0 check (commission_base_cents >= 0),
  platform_commission_cents bigint not null default 0 check (platform_commission_cents >= 0),
  gateway_fee_cents bigint check (gateway_fee_cents is null or gateway_fee_cents >= 0),
  gateway_fee_payer text not null default 'restaurant'
    check (gateway_fee_payer in ('restaurant', 'platform')),
  restaurant_net_cents bigint check (restaurant_net_cents is null or restaurant_net_cents >= 0),
  checkout_expires_at timestamptz,
  paid_at timestamptz,
  refunded_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_order_purpose_check check (
    (purpose = 'order' and order_id is not null)
    or (purpose = 'subscription' and order_id is null)
  )
);

create unique index if not exists payments_provider_external_uidx
  on private.payments(provider, environment, provider_payment_id)
  where provider_payment_id is not null;

create index if not exists payments_restaurant_created_idx
  on private.payments(restaurant_id, created_at desc);

create index if not exists payments_order_idx
  on private.payments(order_id)
  where order_id is not null;

create index if not exists payments_status_created_idx
  on private.payments(status, created_at);

alter table private.payments enable row level security;
revoke all on table private.payments from public, anon, authenticated;
grant select, insert, update on table private.payments to service_role;

comment on table private.payments is
  'Registro privado de pagamentos. Valores monetários são inteiros em centavos; comissão incide sobre itens, sem frete.';

-- ---------------------------------------------------------------------------
-- 3. Split do gateway
-- ---------------------------------------------------------------------------

create table if not exists private.payment_splits (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references private.payments(id) on delete restrict,
  restaurant_id uuid not null references public.restaurantes(id) on delete restrict,
  recipient_type text not null check (recipient_type in ('platform', 'restaurant')),
  provider text not null check (provider in ('asaas', 'pagarme')),
  provider_split_id text,
  provider_recipient_id text,
  amount_cents bigint not null check (amount_cents > 0),
  status text not null default 'pending'
    check (status in ('pending', 'awaiting_credit', 'done', 'refused', 'cancelled', 'reversed')),
  processing_fee_responsibility text not null default 'restaurant'
    check (processing_fee_responsibility in ('restaurant', 'platform')),
  chargeback_liable boolean not null default false,
  settled_at timestamptz,
  reversed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (payment_id, recipient_type)
);

create unique index if not exists payment_splits_provider_split_uidx
  on private.payment_splits(provider, provider_split_id)
  where provider_split_id is not null;

create index if not exists payment_splits_restaurant_status_idx
  on private.payment_splits(restaurant_id, status, created_at desc);

alter table private.payment_splits enable row level security;
revoke all on table private.payment_splits from public, anon, authenticated;
grant select, insert, update on table private.payment_splits to service_role;

-- ---------------------------------------------------------------------------
-- 4. Eventos de webhook com idempotência
-- ---------------------------------------------------------------------------

create table if not exists private.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('asaas', 'pagarme')),
  environment text not null check (environment in ('sandbox', 'production')),
  external_event_id text not null,
  event_type text not null,
  payment_id uuid references private.payments(id) on delete restrict,
  signature_verified boolean not null default false,
  processing_status text not null default 'received'
    check (processing_status in ('received', 'processing', 'processed', 'ignored', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  -- Persistir payload minimizado/redigido. Nunca armazenar PAN, CVV ou tokens de cartão.
  payload_redacted jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error text,
  unique (provider, environment, external_event_id)
);

create index if not exists webhook_events_status_received_idx
  on private.webhook_events(processing_status, received_at);

create index if not exists webhook_events_payment_idx
  on private.webhook_events(payment_id)
  where payment_id is not null;

alter table private.webhook_events enable row level security;
revoke all on table private.webhook_events from public, anon, authenticated;
grant select, insert, update on table private.webhook_events to service_role;

-- ---------------------------------------------------------------------------
-- 5. Ledger de partidas dobradas, append-only
-- ---------------------------------------------------------------------------

create table if not exists private.financial_journals (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in (
    'online_order_paid',
    'offline_order_commission_due',
    'subscription_paid',
    'payment_refunded',
    'chargeback_opened',
    'chargeback_won',
    'chargeback_lost',
    'gateway_fee_recorded',
    'manual_adjustment'
  )),
  source_type text not null check (source_type in ('payment', 'order', 'subscription', 'refund', 'chargeback', 'manual')),
  source_id text not null,
  idempotency_key text not null unique,
  currency char(3) not null default 'BRL' check (currency = 'BRL'),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists private.financial_ledger (
  id uuid primary key default gen_random_uuid(),
  journal_id uuid not null references private.financial_journals(id) on delete restrict,
  line_no smallint not null check (line_no > 0),
  account_code text not null,
  restaurant_id uuid references public.restaurantes(id) on delete restrict,
  debit_cents bigint not null default 0 check (debit_cents >= 0),
  credit_cents bigint not null default 0 check (credit_cents >= 0),
  description text not null default '',
  created_at timestamptz not null default now(),
  constraint financial_ledger_one_sided_amount check (
    (debit_cents > 0 and credit_cents = 0)
    or (credit_cents > 0 and debit_cents = 0)
  ),
  unique (journal_id, line_no)
);

create index if not exists financial_ledger_journal_idx
  on private.financial_ledger(journal_id, line_no);

create index if not exists financial_ledger_restaurant_account_idx
  on private.financial_ledger(restaurant_id, account_code, created_at desc);

alter table private.financial_journals enable row level security;
alter table private.financial_ledger enable row level security;
revoke all on table private.financial_journals, private.financial_ledger from public, anon, authenticated;
grant select, insert on table private.financial_journals, private.financial_ledger to service_role;

comment on table private.financial_ledger is
  'Livro-razão imutável em partidas dobradas. Correções devem ser lançamentos compensatórios, nunca UPDATE/DELETE.';

create or replace function private.reject_financial_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Ledger financeiro é append-only; registre um lançamento compensatório.'
    using errcode = '55000';
end;
$$;

drop trigger if exists financial_journals_immutable on private.financial_journals;
create trigger financial_journals_immutable
before update or delete on private.financial_journals
for each row execute function private.reject_financial_mutation();

drop trigger if exists financial_ledger_immutable on private.financial_ledger;
create trigger financial_ledger_immutable
before update or delete on private.financial_ledger
for each row execute function private.reject_financial_mutation();

create or replace function private.assert_financial_journal_balanced()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_journal_id uuid;
  v_lines bigint;
  v_debits bigint;
  v_credits bigint;
begin
  if tg_table_name = 'financial_journals' then
    v_journal_id := new.id;
  else
    v_journal_id := new.journal_id;
  end if;

  select count(*), coalesce(sum(l.debit_cents), 0), coalesce(sum(l.credit_cents), 0)
    into v_lines, v_debits, v_credits
  from private.financial_ledger l
  where l.journal_id = v_journal_id;

  if v_lines < 2 or v_debits <= 0 or v_debits <> v_credits then
    raise exception 'Lançamento financeiro % não balanceado (linhas %, débitos %, créditos %).',
      v_journal_id, v_lines, v_debits, v_credits
      using errcode = '23514';
  end if;

  return null;
end;
$$;

drop trigger if exists financial_journal_balance_check on private.financial_journals;
create constraint trigger financial_journal_balance_check
after insert on private.financial_journals
deferrable initially deferred
for each row execute function private.assert_financial_journal_balanced();

drop trigger if exists financial_ledger_balance_check on private.financial_ledger;
create constraint trigger financial_ledger_balance_check
after insert on private.financial_ledger
deferrable initially deferred
for each row execute function private.assert_financial_journal_balanced();

-- Serviço interno: grava cabeçalho + linhas em uma única transação.
create or replace function public.edge_post_financial_journal(
  p_event_type text,
  p_source_type text,
  p_source_id text,
  p_idempotency_key text,
  p_entries jsonb,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_journal_id uuid;
  v_entry jsonb;
  v_line_no smallint := 0;
  v_debit bigint;
  v_credit bigint;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Acesso restrito ao backend financeiro.' using errcode = '42501';
  end if;

  if p_event_type not in (
    'online_order_paid','offline_order_commission_due','subscription_paid',
    'payment_refunded','chargeback_opened','chargeback_won','chargeback_lost',
    'gateway_fee_recorded','manual_adjustment'
  ) then
    raise exception 'Tipo de evento financeiro inválido.';
  end if;

  if p_source_type not in ('payment','order','subscription','refund','chargeback','manual')
     or coalesce(length(trim(p_source_id)),0) = 0
     or coalesce(length(trim(p_idempotency_key)),0) < 8 then
    raise exception 'Referência ou chave de idempotência inválida.';
  end if;

  if jsonb_typeof(p_entries) <> 'array'
     or jsonb_array_length(p_entries) < 2
     or jsonb_array_length(p_entries) > 20 then
    raise exception 'O lançamento deve conter entre 2 e 20 linhas.';
  end if;

  insert into private.financial_journals(event_type,source_type,source_id,idempotency_key,metadata)
  values (p_event_type,p_source_type,p_source_id,p_idempotency_key,coalesce(p_metadata,'{}'::jsonb))
  on conflict (idempotency_key) do nothing
  returning id into v_journal_id;

  if v_journal_id is null then
    select j.id into v_journal_id
    from private.financial_journals j
    where j.idempotency_key = p_idempotency_key;

    if not exists (
      select 1 from private.financial_journals j
      where j.id = v_journal_id
        and j.event_type = p_event_type
        and j.source_type = p_source_type
        and j.source_id = p_source_id
    ) then
      raise exception 'Chave de idempotência reutilizada com outra operação.';
    end if;

    return v_journal_id;
  end if;

  for v_entry in select value from jsonb_array_elements(p_entries)
  loop
    v_line_no := v_line_no + 1;
    v_debit := coalesce(nullif(v_entry ->> 'debitCents','')::bigint,0);
    v_credit := coalesce(nullif(v_entry ->> 'creditCents','')::bigint,0);

    if coalesce(length(trim(v_entry ->> 'accountCode')),0) = 0
       or v_debit < 0 or v_credit < 0
       or not ((v_debit > 0 and v_credit = 0) or (v_credit > 0 and v_debit = 0)) then
      raise exception 'Linha % do ledger inválida.', v_line_no;
    end if;

    insert into private.financial_ledger(
      journal_id,line_no,account_code,restaurant_id,debit_cents,credit_cents,description
    ) values (
      v_journal_id,
      v_line_no,
      trim(v_entry ->> 'accountCode'),
      nullif(v_entry ->> 'restaurantId','')::uuid,
      v_debit,
      v_credit,
      left(coalesce(v_entry ->> 'description',''),240)
    );
  end loop;

  return v_journal_id;
end;
$$;

revoke all on function public.edge_post_financial_journal(text,text,text,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.edge_post_financial_journal(text,text,text,text,jsonb,jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Supabase Vault: gravar/ler segredo apenas por RPC service_role
-- ---------------------------------------------------------------------------

create or replace function public.edge_store_gateway_secret(
  p_restaurant_id uuid,
  p_provider text,
  p_environment text,
  p_provider_account_id text,
  p_wallet_id text,
  p_api_key text,
  p_onboarding_status text default 'active',
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_id uuid;
  v_secret_id uuid;
  v_secret_name text;
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Acesso restrito ao backend financeiro.' using errcode = '42501';
  end if;

  if p_provider not in ('asaas','pagarme')
     or p_environment not in ('sandbox','production')
     or p_onboarding_status not in ('pending','under_review','active','rejected','suspended','disabled') then
    raise exception 'Configuração do recebedor inválida.';
  end if;

  if not exists (select 1 from public.restaurantes r where r.id = p_restaurant_id) then
    raise exception 'Restaurante não encontrado.';
  end if;

  if p_provider = 'asaas' and coalesce(length(trim(p_api_key)),0) < 20 then
    raise exception 'A chave da subconta Asaas é obrigatória.';
  end if;

  v_secret_name := 'pratopronto:' || p_provider || ':' || p_environment || ':' || p_restaurant_id::text;

  select a.id, a.vault_secret_id
    into v_account_id, v_secret_id
  from private.payment_gateway_accounts a
  where a.restaurant_id = p_restaurant_id
    and a.provider = p_provider
    and a.environment = p_environment
  for update;

  if p_api_key is not null and length(trim(p_api_key)) > 0 then
    if v_secret_id is null then
      v_secret_id := vault.create_secret(
        p_api_key,
        v_secret_name,
        'Credencial de gateway do restaurante ' || p_restaurant_id::text
      );
    else
      perform vault.update_secret(
        v_secret_id,
        p_api_key,
        v_secret_name,
        'Credencial de gateway do restaurante ' || p_restaurant_id::text
      );
    end if;
  end if;

  insert into private.payment_gateway_accounts(
    restaurant_id,provider,environment,provider_account_id,wallet_id,
    vault_secret_id,onboarding_status,metadata
  ) values (
    p_restaurant_id,p_provider,p_environment,p_provider_account_id,p_wallet_id,
    v_secret_id,p_onboarding_status,coalesce(p_metadata,'{}'::jsonb)
  )
  on conflict (restaurant_id,provider,environment) do update set
    provider_account_id = excluded.provider_account_id,
    wallet_id = excluded.wallet_id,
    vault_secret_id = coalesce(excluded.vault_secret_id, private.payment_gateway_accounts.vault_secret_id),
    onboarding_status = excluded.onboarding_status,
    metadata = excluded.metadata,
    updated_at = now()
  returning id into v_account_id;

  return v_account_id;
end;
$$;

revoke all on function public.edge_store_gateway_secret(uuid,text,text,text,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.edge_store_gateway_secret(uuid,text,text,text,text,text,text,jsonb) to service_role;

create or replace function public.edge_get_gateway_secret(
  p_restaurant_id uuid,
  p_provider text,
  p_environment text
)
returns table (
  provider_account_id text,
  wallet_id text,
  api_key text,
  onboarding_status text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'Acesso restrito ao backend financeiro.' using errcode = '42501';
  end if;

  return query
    select a.provider_account_id,
           a.wallet_id,
           ds.decrypted_secret,
           a.onboarding_status
    from private.payment_gateway_accounts a
    left join vault.decrypted_secrets ds on ds.id = a.vault_secret_id
    where a.restaurant_id = p_restaurant_id
      and a.provider = p_provider
      and a.environment = p_environment
      and a.onboarding_status = 'active'
    limit 1;
end;
$$;

revoke all on function public.edge_get_gateway_secret(uuid,text,text) from public, anon, authenticated;
grant execute on function public.edge_get_gateway_secret(uuid,text,text) to service_role;

commit;

-- ---------------------------------------------------------------------------
-- 7. Lançamentos contábeis de referência (a Edge Function deve montar as linhas)
-- ---------------------------------------------------------------------------
-- Pedido offline concluído: 5% do subtotal vira recebível do PratoPronto.
-- Exemplo subtotal = R$ 100, comissão = R$ 5:
--   DR restaurant_commission_receivable  500 (restaurant_id = restaurante)
--   CR platform_commission_revenue       500
--
-- Pedido online liquidado por split:
--   DR platform_cash                    500
--   CR platform_commission_revenue       500
--   (o recebimento do restaurante e a taxa do gateway devem ser conciliados
--    em linhas próprias conforme o extrato real do provedor)
--
-- Mensalidade paga:
--   DR platform_cash                   4990
--   CR subscription_revenue            4990
--
-- Estorno: lançar movimento inverso em novo journal; nunca editar o original.
