-- PratoPronto 3: additive migration. Client roles can read only; Edge Functions
-- own all writes. Existing legacy tables are preserved but made read-only.
begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade, nome text not null default '', email text not null default '', telefone text not null default '',
 endereco text not null default '', numero text not null default '', bairro text not null default '', complemento text not null default '',
 aceitar_marketing boolean not null default false, privacy_policy_version text, terms_version text, consent_timestamp timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.restaurant_admins (profile_id uuid primary key references public.profiles(id) on delete cascade, role text not null default 'restaurant_admin', permissions jsonb not null default '[]', created_at timestamptz not null default now());
create table if not exists public.products (id uuid primary key default gen_random_uuid(), name text not null, description text not null default '', category text not null, price_cents integer not null check(price_cents>0), image_url text, active boolean not null default true);
create table if not exists public.orders (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete set null, items jsonb not null, delivery_address jsonb not null, total_cents integer not null check(total_cents>0), payment_method text not null, payment_status text not null default 'pending', status text not null default 'received', created_at timestamptz not null default now(), updated_at timestamptz not null default now());

alter table public.profiles add column if not exists cep text not null default '';
alter table public.profiles add column if not exists cidade text not null default '';
alter table public.profiles add column if not exists uf text not null default '';
alter table public.products add column if not exists slug text unique;
alter table public.products add column if not exists promotion jsonb;
alter table public.products add column if not exists created_at timestamptz not null default now();
alter table public.products add column if not exists updated_at timestamptz not null default now();
alter table public.orders add column if not exists data jsonb not null default '{}';
alter table public.orders add column if not exists quote_id uuid unique;
alter table public.orders add column if not exists request_id uuid;
alter table public.orders alter column user_id drop not null;
create unique index if not exists orders_user_request on public.orders(user_id,request_id);
create index if not exists orders_user_created on public.orders(user_id,created_at desc);
create index if not exists orders_status_created on public.orders(status,created_at desc);

create table if not exists public.store_settings (
 id boolean primary key default true check(id), data jsonb not null,
 revision uuid not null default gen_random_uuid(), updated_at timestamptz not null default now()
);
insert into public.store_settings(id,data) values(true,'{"acceptingOrders":false,"methods":["maquina_entrega"]}') on conflict do nothing;
create table if not exists public.quotes (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 data jsonb not null, revision uuid not null, expires_at timestamptz not null, created_at timestamptz not null default now()
);
create index if not exists quotes_user_id on public.quotes(user_id);
create table if not exists public.order_events (
 id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id) on delete cascade,
 data jsonb not null, created_at timestamptz not null default now()
);
create index if not exists events_order_created on public.order_events(order_id,created_at);
create table if not exists public.refund_requests (
 id uuid primary key references public.orders(id), user_id uuid references auth.users(id) on delete set null,
 status text not null default 'pendente', data jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists refunds_user on public.refund_requests(user_id);
create table if not exists public.reviews (
 id uuid primary key references public.orders(id), user_id uuid references auth.users(id) on delete set null,
 data jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists reviews_user on public.reviews(user_id);
create table if not exists public.privacy_requests (
 id uuid primary key default gen_random_uuid(), user_id uuid unique references auth.users(id) on delete set null,
 status text not null default 'pendente', data jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists private.rate_limits (
 actor uuid not null, action text not null, bucket bigint not null, calls integer not null, primary key(actor,action,bucket)
);
revoke all on private.rate_limits from public,anon,authenticated;
grant all on private.rate_limits to service_role;

create or replace function private.verified(actor uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users where id=actor and email_confirmed_at is not null and deleted_at is null)
$$;
create or replace function private.admin(actor uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.verified(actor) and exists(select 1 from public.restaurant_admins where profile_id=actor and role='restaurant_admin')
$$;
revoke all on function private.verified(uuid), private.admin(uuid) from public, anon;
grant execute on function private.verified(uuid), private.admin(uuid) to authenticated,service_role;

-- No client write grants, even if a stale policy remains in an older deployment.
do $$ declare t text; p record; begin
 foreach t in array array['profiles','restaurant_admins','products','orders','store_settings','quotes','order_events','refund_requests','reviews','privacy_requests'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon, authenticated',t);
  execute format('grant all on public.%I to service_role',t);
  for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
   execute format('drop policy %I on public.%I',p.policyname,t);
  end loop;
 end loop;
 foreach t in array array['restaurantes','produtos','enderecos','pedidos','pedido_itens','favoritos'] loop
  if to_regclass('public.'||t) is not null then execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from anon, authenticated',t); end if;
 end loop;
end; $$;
grant select on public.products to anon,authenticated;
create policy products_read on public.products for select to anon,authenticated using(true);
grant select on public.profiles,public.restaurant_admins,public.orders,public.order_events,public.refund_requests,public.reviews,public.privacy_requests to authenticated;
create policy profile_own on public.profiles for select to authenticated using(id=(select auth.uid()) and (select private.verified(auth.uid())));
create policy admin_own on public.restaurant_admins for select to authenticated using(profile_id=(select auth.uid()) and (select private.verified(auth.uid())));
create policy orders_read on public.orders for select to authenticated using((select private.verified(auth.uid())) and (user_id=(select auth.uid()) or (select private.admin(auth.uid()))));
create policy events_read on public.order_events for select to authenticated using(exists(select 1 from public.orders o where o.id=order_id));
create policy refunds_read on public.refund_requests for select to authenticated using((select private.verified(auth.uid())) and (user_id=(select auth.uid()) or (select private.admin(auth.uid()))));
create policy reviews_read on public.reviews for select to authenticated using((select private.verified(auth.uid())) and (user_id=(select auth.uid()) or (select private.admin(auth.uid()))));
create policy privacy_read on public.privacy_requests for select to authenticated using((select private.verified(auth.uid())) and (user_id=(select auth.uid()) or (select private.admin(auth.uid()))));

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id,nome,email,telefone,endereco,numero,bairro,complemento,cep,cidade,uf,aceitar_marketing,privacy_policy_version,terms_version,consent_timestamp)
 values(new.id,left(coalesce(new.raw_user_meta_data->>'nome',''),80),lower(coalesce(new.email,'')),left(coalesce(new.raw_user_meta_data->>'telefone',''),11),
 left(coalesce(new.raw_user_meta_data->>'endereco',''),180),left(coalesce(new.raw_user_meta_data->>'numero',''),20),left(coalesce(new.raw_user_meta_data->>'bairro',''),100),
 left(coalesce(new.raw_user_meta_data->>'complemento',''),180),left(coalesce(new.raw_user_meta_data->>'cep',''),8),left(coalesce(new.raw_user_meta_data->>'cidade',''),100),left(coalesce(new.raw_user_meta_data->>'uf',''),2),
 coalesce(new.raw_user_meta_data->>'aceitar_marketing','false')='true',new.raw_user_meta_data->>'privacy_policy_version',new.raw_user_meta_data->>'terms_version',now())
 on conflict(id) do nothing;
 return new;
end; $$;
revoke all on function public.handle_new_user() from public,anon,authenticated;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.app_rate(actor uuid, action text) returns void
language plpgsql security invoker set search_path='' as $$
declare n integer; b bigint:=floor(extract(epoch from now())/60); begin
 insert into private.rate_limits values(actor,action,b,1)
 on conflict(actor,action,bucket) do update set calls=private.rate_limits.calls+1 returning calls into n;
 if n>30 then raise exception 'Muitas tentativas. Aguarde um minuto.' using errcode='P0001'; end if;
 delete from private.rate_limits where bucket<b-1440;
end; $$;

create or replace function private.store_open(cfg jsonb) returns boolean
language sql stable set search_path='' as $$
 select coalesce((cfg->>'acceptingOrders')::boolean,false) and exists(
  select 1 from jsonb_array_elements(coalesce(cfg->'hours'->(extract(dow from now() at time zone coalesce(cfg->>'timezone','America/Sao_Paulo'))::integer::text),'[]')) slot
  where (extract(hour from now() at time zone coalesce(cfg->>'timezone','America/Sao_Paulo'))*60+extract(minute from now() at time zone coalesce(cfg->>'timezone','America/Sao_Paulo'))) >= (slot->>'start')::integer
  and (extract(hour from now() at time zone coalesce(cfg->>'timezone','America/Sao_Paulo'))*60+extract(minute from now() at time zone coalesce(cfg->>'timezone','America/Sao_Paulo'))) < (slot->>'end')::integer
 )
$$;
revoke all on function private.store_open(jsonb) from public,anon,authenticated;
grant execute on function private.store_open(jsonb) to service_role;

-- Only trusted Edge Functions can execute the atomic mutation API.
create or replace function public.app_commit(actor uuid, action text, payload jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare admin_ok boolean; cfg public.store_settings; q public.quotes; o public.orders; r public.refund_requests;
 result jsonb; oid uuid; req uuid; previous text; next_status text; payment jsonb; p public.profiles;
begin
 if not private.verified(actor) then raise exception 'Confirme seu e-mail antes de continuar.' using errcode='42501'; end if;
 admin_ok:=private.admin(actor);
 if action in ('settings','product','promotion','advance','refundDecision','manualRefund','reply') and not admin_ok then
  raise exception 'Acesso exclusivo da empresa.' using errcode='42501'; end if;
 if action in ('settings','product','promotion','quote','checkout') then
  select * into cfg from public.store_settings where id=true for update;
 end if;
 if action='settings' then
  update public.store_settings set data=payload,revision=gen_random_uuid(),updated_at=now() where id=true;
  return '{"saved":true}';
 elsif action in ('product','promotion') then
  if action='product' then update public.products set price_cents=(payload->>'priceCents')::integer,active=(payload->>'active')::boolean,updated_at=now() where slug=payload->>'id';
  else update public.products set promotion=payload->'promotion',updated_at=now() where slug=payload->>'id'; end if;
  if not found then raise exception 'Produto não encontrado.'; end if;
  update public.store_settings set revision=gen_random_uuid() where id=true;
  return '{"saved":true}';
 elsif action='profile' then
  update public.profiles set nome=payload->>'nome',telefone=payload->>'telefone',endereco=payload->>'endereco',numero=payload->>'numero',bairro=payload->>'bairro',complemento=payload->>'complemento',cep=payload->>'cep',cidade=payload->>'cidade',uf=payload->>'uf',aceitar_marketing=(payload->>'aceitarMarketing')::boolean,updated_at=now() where id=actor;
  return '{"saved":true}';
 elsif action='quote' then
  if cfg.revision<>(payload->>'revision')::uuid then raise exception 'Os valores mudaram. Confira o pedido novamente.'; end if;
  insert into public.quotes(user_id,data,revision,expires_at) values(actor,payload->'quote',cfg.revision,(payload->>'expiresAt')::timestamptz) returning * into q;
  return q.data || jsonb_build_object('quoteId',q.id,'expiresAt',q.expires_at);
 elsif action='checkout' then
  req:=(payload->>'requestId')::uuid;
  select * into o from public.orders where user_id=actor and request_id=req;
  if found then
   if o.quote_id<>(payload->>'quoteId')::uuid then raise exception 'Tentativa incompatível.'; end if;
   return o.data || jsonb_build_object('id',o.id,'status',o.status);
  end if;
  select * into q from public.quotes where id=(payload->>'quoteId')::uuid and user_id=actor for update;
  if not found then raise exception 'Resumo não encontrado. Confira novamente.'; end if;
  select * into o from public.orders where quote_id=q.id;
  if found then return o.data || jsonb_build_object('id',o.id,'status',o.status); end if;
  if q.expires_at<=now() or q.revision<>cfg.revision or not private.store_open(cfg.data) then raise exception 'O resumo expirou ou a loja mudou. Confira novamente.' using errcode='P0002'; end if;
  select * into p from public.profiles where id=actor;
  if q.data->'entrega' <> jsonb_build_object('endereco',p.endereco,'numero',p.numero,'bairro',p.bairro,'complemento',p.complemento,'cep',p.cep,'cidade',p.cidade,'uf',p.uf) then raise exception 'O endereço mudou. Confira novamente.' using errcode='P0002'; end if;
  payment:=q.data->'pagamento';
  next_status:=case when payment->>'metodo'='maquina_entrega' then 'confirmado' else 'aguardando_pagamento' end;
  payment:=payment || jsonb_build_object('status',case when next_status='confirmado' then 'pendente_entrega' else 'pendente' end);
  oid:=gen_random_uuid();
  result:=q.data || jsonb_build_object('id',oid,'userId',actor,'status',next_status,'pagamento',payment,'createdAt',now(),'cliente',jsonb_build_object('nome',p.nome,'email',p.email,'telefone',p.telefone));
  insert into public.orders(id,user_id,quote_id,request_id,items,delivery_address,total_cents,payment_method,payment_status,status,data)
   values(oid,actor,q.id,req,result->'itens',result->'entrega',(result->>'totalCents')::integer,payment->>'metodo',payment->>'status',next_status,result);
  insert into public.order_events(order_id,data) values(oid,jsonb_build_object('status',next_status,'label','Pedido registrado','type','created'));
  return result;
 elsif action='privacy' then
  next_status:=case when admin_ok then 'transferir_administracao' when exists(select 1 from public.orders where user_id=actor and status not in ('entregue','cancelado')) or exists(select 1 from public.refund_requests where user_id=actor and status in ('pendente','reembolso_pendente','reembolso_manual_pendente')) then 'aguardando_pedidos' else 'pendente' end;
  insert into public.privacy_requests(user_id,status,data) values(actor,next_status,jsonb_build_object('userId',actor)) on conflict(user_id) do update set status=excluded.status,updated_at=now();
  return jsonb_build_object('state',next_status);
 end if;
 oid:=(payload->>'orderId')::uuid;
 select * into o from public.orders where id=oid for update;
 if not found or (o.user_id is distinct from actor and not admin_ok) then raise exception 'Pedido indisponível para esta conta.' using errcode='42501'; end if;
 result:=o.data;
 if action='advance' then
  next_status:=payload->>'next'; previous:=o.status;
  if next_status<>(case previous when 'confirmado' then 'preparando' when 'preparando' then 'pronto' when 'pronto' then 'saiu_entrega' when 'saiu_entrega' then 'entregue' else '' end) then raise exception 'Atualize o pedido. Esta mudança de etapa não é permitida.'; end if;
  if next_status='entregue' and o.payment_status='pendente_entrega' then
   if payload->>'received'<>'true' then raise exception 'Confirme que o pagamento foi recebido na entrega.'; end if;
   result:=jsonb_set(result,'{pagamento,status}','"recebido_entrega"');
  end if;
  result:=result||jsonb_build_object('status',next_status,'updatedAt',now());
 elsif action='refund' then
  if o.user_id is distinct from actor then raise exception 'Solicitação permitida somente ao cliente.' using errcode='42501'; end if;
  if o.status='cancelado' then raise exception 'Este pedido já foi cancelado.'; end if;
  insert into public.refund_requests(id,user_id,data) values(oid,actor,payload||jsonb_build_object('orderId',oid,'userId',actor,'motivo',payload->>'reason','total',o.total_cents/100.0)) on conflict(id) do nothing;
  return '{"saved":true}';
 elsif action='refundDecision' then
  select * into r from public.refund_requests where id=oid for update;
  if not found or r.status<>'pendente' then raise exception 'A solicitação já foi tratada. Atualize a página.'; end if;
  if payload->>'approve'='true' then
   next_status:=case when o.payment_status='recebido_entrega' then 'reembolso_manual_pendente' when o.payment_status='aprovado' then 'reembolso_pendente' else 'cancelado_sem_cobranca' end;
   result:=result||jsonb_build_object('status','cancelado','updatedAt',now());
   if next_status<>'cancelado_sem_cobranca' then result:=jsonb_set(result,'{pagamento,status}',to_jsonb(next_status)); end if;
  else next_status:='recusado'; end if;
  update public.refund_requests set status=next_status,data=data||jsonb_build_object('resposta',payload->>'answer'),updated_at=now() where id=oid;
 elsif action='manualRefund' then
  if o.payment_status<>'reembolso_manual_pendente' then raise exception 'Não existe devolução manual pendente.'; end if;
  result:=jsonb_set(result,'{pagamento,status}','"reembolsado_manual"');
  update public.refund_requests set status='reembolsado_manual',updated_at=now() where id=oid;
 elsif action='review' then
  if o.user_id is distinct from actor or o.status<>'entregue' then raise exception 'Avalie apenas seus pedidos entregues.' using errcode='42501'; end if;
  insert into public.reviews(id,user_id,data) values(oid,actor,payload||jsonb_build_object('userId',actor,'orderId',oid));
  return '{"saved":true}';
 elsif action='reply' then
  update public.reviews set data=data||jsonb_build_object('resposta',payload->>'answer','respondidoEm',now()),updated_at=now() where id=oid;
  return '{"saved":true}';
 else raise exception 'Operação desconhecida.'; end if;
 update public.orders set data=result,status=result->>'status',payment_status=result#>>'{pagamento,status}',updated_at=now() where id=oid;
 insert into public.order_events(order_id,data) values(oid,jsonb_build_object('type',action,'status',result->>'status','label',case when action='advance' then 'Etapa atualizada' else 'Atendimento atualizado' end));
 return result;
end; $$;
revoke all on function public.app_rate(uuid,text),public.app_commit(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.app_rate(uuid,text),public.app_commit(uuid,text,jsonb) to service_role;

create table if not exists private.admin_invitations(email text primary key);
revoke all on private.admin_invitations from public,anon,authenticated;
grant all on private.admin_invitations to service_role;
insert into private.admin_invitations(email) values ('douglas.souza.santos@escola.pr.gov.br') on conflict do nothing;
create or replace function private.accept_admin_invitation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.email_confirmed_at is not null and exists(select 1 from private.admin_invitations where email=lower(new.email)) then
  insert into public.restaurant_admins(profile_id,role) values(new.id,'restaurant_admin') on conflict(profile_id) do nothing;
  delete from private.admin_invitations where email=lower(new.email);
 end if;
 return new;
end; $$;
revoke all on function private.accept_admin_invitation() from public,anon,authenticated;
drop trigger if exists zz_accept_admin_invitation on auth.users;
create trigger zz_accept_admin_invitation after insert or update of email_confirmed_at on auth.users for each row execute function private.accept_admin_invitation();

-- Future public functions should not silently inherit anonymous EXECUTE.
alter default privileges for role postgres in schema public revoke execute on functions from public,anon,authenticated;
do $$ declare t text; begin
 foreach t in array array['products','orders','order_events','refund_requests','reviews','privacy_requests'] loop
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then execute format('alter publication supabase_realtime add table public.%I',t); end if;
 end loop;
end; $$;
insert into public.products(slug,name,description,category,price_cents,image_url,active) values('calabresa','Calabresa','Grande • molho da casa • queijo • calabresa','undefined',5890,'/images/produtos/pizza-calabresa.webp',true) on conflict(slug) do nothing;
insert into public.products(slug,name,description,category,price_cents,image_url,active) values('quatro-queijos','4 Queijos','Grande • mussarela • provolone • parmesão • catupiry','undefined',6290,'/images/produtos/pizza-quatro-queijos.webp',true) on conflict(slug) do nothing;
insert into public.products(slug,name,description,category,price_cents,image_url,active) values('estrogonofe','Estrogonofe','Grande • molho especial • frango • batata palha','undefined',5990,'/images/produtos/pizza-estrogonofe.webp',true) on conflict(slug) do nothing;
insert into public.products(slug,name,description,category,price_cents,image_url,active) values('frango-catupiry','Frango com Catupiry','Grande • frango desfiado • catupiry','undefined',5990,'/images/produtos/pizza-frango-catupiry.webp',true) on conflict(slug) do nothing;
insert into public.products(slug,name,description,category,price_cents,image_url,active) values('mussarela','Mussarela','Grande • molho da casa • mussarela • tomate • orégano','undefined',5490,'/images/produtos/pizza-mussarela.webp',true) on conflict(slug) do nothing;
insert into public.products(slug,name,description,category,price_cents,image_url,active) values('lombo-canadense','Lombo Canadense','Grande • lombo • cebola • mussarela','undefined',6190,'/images/produtos/pizza-lombo-canadense.webp',true) on conflict(slug) do nothing;
insert into public.products(slug,name,description,category,price_cents,image_url,active) values('coca-cola','Coca-Cola','550 ml','undefined',799,'/images/produtos/coca-cola.webp',true) on conflict(slug) do nothing;
insert into public.products(slug,name,description,category,price_cents,image_url,active) values('guarana','Guaraná','350 ml','undefined',699,'/images/produtos/guarana.webp',true) on conflict(slug) do nothing;
insert into public.products(slug,name,description,category,price_cents,image_url,active) values('fanta','Fanta','550 ml','undefined',799,'/images/produtos/fanta.webp',true) on conflict(slug) do nothing;
insert into public.products(slug,name,description,category,price_cents,image_url,active) values('sprite','Sprite','550 ml','undefined',799,'/images/produtos/sprite.webp',true) on conflict(slug) do nothing;
insert into public.products(slug,name,description,category,price_cents,image_url,active) values('monster','Monster','473 ml','undefined',1549,'/images/produtos/monster.webp',true) on conflict(slug) do nothing;
insert into public.products(slug,name,description,category,price_cents,image_url,active) values('red-bull','Red Bull','473 ml','undefined',1549,'/images/produtos/red-bull.webp',true) on conflict(slug) do nothing;
commit;
