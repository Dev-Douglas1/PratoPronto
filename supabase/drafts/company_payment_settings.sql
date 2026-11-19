-- Draft only: do not apply until the repository's remote migration history is reconciled.
-- Manual receiving details are kept outside public.restaurant_settings.data.
create schema if not exists private;

create table if not exists private.company_payment_settings (
  restaurant_id uuid primary key references public.restaurantes(id) on delete cascade,
  methods text[] not null default array['maquina_entrega']::text[],
  pix_key_type text,
  pix_key text,
  pix_holder_name text,
  pix_holder_document text,
  bank_name text,
  account_type text,
  bank_branch text,
  bank_account text,
  bank_account_digit text,
  bank_holder_name text,
  bank_holder_document text,
  updated_at timestamptz not null default now(),
  constraint company_payment_methods_allowed check (
    methods <@ array['pix_manual','cash_delivery','maquina_entrega']::text[]
    and cardinality(methods) > 0
  ),
  constraint company_payment_pix_type_allowed check (
    pix_key_type is null or pix_key_type in ('cpf','cnpj','email','telefone','aleatoria')
  ),
  constraint company_payment_account_type_allowed check (
    account_type is null or account_type in ('corrente','poupanca','pagamento')
  )
);

alter table private.company_payment_settings enable row level security;
revoke all on private.company_payment_settings from public, anon, authenticated;

create or replace function public.get_company_payment_settings(p_restaurant_slug text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurant_id uuid;
  v_data jsonb;
begin
  if auth.uid() is null then
    raise exception 'Autenticação necessária.' using errcode = '42501';
  end if;

  select r.id into v_restaurant_id
  from public.restaurantes r
  where r.slug = p_restaurant_slug
  limit 1;

  if v_restaurant_id is null or not exists (
    select 1 from public.restaurant_members m
    where m.restaurante_id = v_restaurant_id
      and m.profile_id = auth.uid()
      and m.active is true
      and m.role in ('owner','admin')
  ) then
    raise exception 'Acesso restrito ao proprietário ou administrador da empresa.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'methods', s.methods,
    'pixKeyType', coalesce(s.pix_key_type,''),
    'pixKey', coalesce(s.pix_key,''),
    'pixHolderName', coalesce(s.pix_holder_name,''),
    'pixHolderDocument', coalesce(s.pix_holder_document,''),
    'bankName', coalesce(s.bank_name,''),
    'accountType', coalesce(s.account_type,''),
    'bankBranch', coalesce(s.bank_branch,''),
    'bankAccount', coalesce(s.bank_account,''),
    'bankAccountDigit', coalesce(s.bank_account_digit,''),
    'bankHolderName', coalesce(s.bank_holder_name,''),
    'bankHolderDocument', coalesce(s.bank_holder_document,'')
  ) into v_data
  from private.company_payment_settings s
  where s.restaurant_id = v_restaurant_id;

  return jsonb_build_object(
    'settings', coalesce(v_data, jsonb_build_object('methods', array['maquina_entrega']::text[])),
    'provider', jsonb_build_object('connected', false, 'status', 'not_configured')
  );
end;
$$;

create or replace function public.save_company_payment_settings(p_restaurant_slug text, p_settings jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_restaurant_id uuid;
  v_methods text[];
  v_pix_type text;
  v_account_type text;
  v_pix_doc text;
  v_bank_doc text;
begin
  if auth.uid() is null then
    raise exception 'Autenticação necessária.' using errcode = '42501';
  end if;

  select r.id into v_restaurant_id
  from public.restaurantes r
  where r.slug = p_restaurant_slug
  limit 1;

  if v_restaurant_id is null or not exists (
    select 1 from public.restaurant_members m
    where m.restaurante_id = v_restaurant_id
      and m.profile_id = auth.uid()
      and m.active is true
      and m.role in ('owner','admin')
  ) then
    raise exception 'Acesso restrito ao proprietário ou administrador da empresa.' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct x), array[]::text[]) into v_methods
  from jsonb_array_elements_text(coalesce(p_settings->'methods','[]'::jsonb)) x;
  if cardinality(v_methods) = 0 or not (v_methods <@ array['pix_manual','cash_delivery','maquina_entrega']::text[]) then
    raise exception 'Selecione meios de pagamento válidos.' using errcode = '22023';
  end if;

  v_pix_type := nullif(p_settings->>'pixKeyType','');
  v_account_type := nullif(p_settings->>'accountType','');
  v_pix_doc := regexp_replace(coalesce(p_settings->>'pixHolderDocument',''), '\D', '', 'g');
  v_bank_doc := regexp_replace(coalesce(p_settings->>'bankHolderDocument',''), '\D', '', 'g');

  if 'pix_manual' = any(v_methods) and (
    v_pix_type not in ('cpf','cnpj','email','telefone','aleatoria')
    or length(trim(coalesce(p_settings->>'pixKey',''))) = 0
    or length(trim(coalesce(p_settings->>'pixHolderName',''))) = 0
    or length(v_pix_doc) not in (11,14)
  ) then
    raise exception 'Preencha corretamente a chave Pix e os dados do titular.' using errcode = '22023';
  end if;

  if coalesce(p_settings->>'bankName','') <> '' or coalesce(p_settings->>'bankAccount','') <> '' then
    if coalesce(p_settings->>'bankName','') = ''
      or v_account_type not in ('corrente','poupanca','pagamento')
      or coalesce(p_settings->>'bankBranch','') = ''
      or coalesce(p_settings->>'bankAccount','') = ''
      or coalesce(p_settings->>'bankHolderName','') = ''
      or length(v_bank_doc) not in (11,14) then
      raise exception 'Preencha todos os dados obrigatórios da conta bancária.' using errcode = '22023';
    end if;
  end if;

  insert into private.company_payment_settings (
    restaurant_id, methods, pix_key_type, pix_key, pix_holder_name, pix_holder_document,
    bank_name, account_type, bank_branch, bank_account, bank_account_digit,
    bank_holder_name, bank_holder_document, updated_at
  ) values (
    v_restaurant_id, v_methods, v_pix_type,
    nullif(trim(p_settings->>'pixKey'),''), nullif(trim(p_settings->>'pixHolderName'),''),
    nullif(v_pix_doc,''), nullif(trim(p_settings->>'bankName'),''),
    v_account_type, nullif(trim(p_settings->>'bankBranch'),''),
    nullif(trim(p_settings->>'bankAccount'),''), nullif(trim(p_settings->>'bankAccountDigit'),''),
    nullif(trim(p_settings->>'bankHolderName'),''), nullif(v_bank_doc,''), now()
  )
  on conflict (restaurant_id) do update set
    methods = excluded.methods,
    pix_key_type = excluded.pix_key_type,
    pix_key = excluded.pix_key,
    pix_holder_name = excluded.pix_holder_name,
    pix_holder_document = excluded.pix_holder_document,
    bank_name = excluded.bank_name,
    account_type = excluded.account_type,
    bank_branch = excluded.bank_branch,
    bank_account = excluded.bank_account,
    bank_account_digit = excluded.bank_account_digit,
    bank_holder_name = excluded.bank_holder_name,
    bank_holder_document = excluded.bank_holder_document,
    updated_at = now();

  return jsonb_build_object('saved', true, 'methods', v_methods);
end;
$$;

revoke all on function public.get_company_payment_settings(text) from public, anon;
revoke all on function public.save_company_payment_settings(text,jsonb) from public, anon;
grant execute on function public.get_company_payment_settings(text) to authenticated;
grant execute on function public.save_company_payment_settings(text,jsonb) to authenticated;
