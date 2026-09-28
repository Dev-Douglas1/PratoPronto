-- Run after the account_ids_and_team_permissions migration.
-- All test users, memberships and audit entries are rolled back. No Auth emails
-- or external services are invoked. Execute the whole file as the database owner.
begin;
set local statement_timeout = '20s';
create temporary table team_test_ids(name text primary key, id uuid default gen_random_uuid());
insert into team_test_ids(name) values ('owner'),('admin'),('customer'),('outsider'),('phone'),('pending'),('peer'),('store');
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
select id, name||'-'||id::text||'@example.invalid',
  case when name in ('phone','pending') then null else now() end,
  jsonb_build_object('nome','Teste de equipe')
from team_test_ids where name <> 'store';
update auth.users set phone_confirmed_at=now() where id=(select id from team_test_ids where name='phone');
insert into public.restaurantes(id,slug,nome)
select id,'teste-equipe-'||id::text,'Teste transacional de equipe' from team_test_ids where name='store';
insert into public.restaurant_members(restaurante_id,profile_id,role)
select (select id from team_test_ids where name='store'),id,
  case when name='owner' then 'owner' else 'admin' end
from team_test_ids where name in ('owner','admin','peer');
grant select on table team_test_ids to authenticated;

create function pg_temp.team_denied(command text, expected_state text)
returns void language plpgsql security invoker as $$
declare rejected boolean := false;
begin
  begin
    execute command;
  exception when others then
    if sqlstate <> expected_state then raise; end if;
    rejected := true;
  end;
  if not rejected then raise exception 'Expected access rejection: %',command; end if;
end $$;

select set_config('request.jwt.claim.sub',(select id::text from team_test_ids where name='owner'),true);
set local role authenticated;
do $$
declare slug_value text; customer uuid; phone uuid;
begin
  select 'teste-equipe-'||id::text into slug_value from team_test_ids where name='store';
  select id into customer from team_test_ids where name='customer';
  select id into phone from team_test_ids where name='phone';
  perform public.add_restaurant_member(slug_value,customer::text,'admin');
  perform public.add_restaurant_member(slug_value,customer::text,'kitchen');
  if not exists(select 1 from public.restaurant_members where profile_id=customer and role='kitchen') then
    raise exception 'ID did not update the expected account';
  end if;
  perform public.add_restaurant_member(slug_value,'customer-'||customer::text||'@example.invalid','attendant');
  perform public.add_restaurant_member(slug_value,phone::text,'attendant');
  perform pg_temp.team_denied(format('select public.add_restaurant_member(%L,%L,%L)',slug_value,'phone-'||phone::text||'@example.invalid','attendant'),'22023');
  perform pg_temp.team_denied(format('select public.add_restaurant_member(%L,%L,%L)',slug_value,(select id::text from team_test_ids where name='pending'),'attendant'),'22023');
  perform pg_temp.team_denied(format('select public.add_restaurant_member(%L,%L,%L)',slug_value,customer::text,'platform_admin'),'22023');
  perform pg_temp.team_denied(format('update public.restaurant_members set role=%L where profile_id=%L','owner',customer),'42501');
end $$;

reset role;
select set_config('request.jwt.claim.sub',(select id::text from team_test_ids where name='outsider'),true);
set local role authenticated;
do $$
declare s text := 'teste-equipe-'||(select id::text from team_test_ids where name='store');
begin
  perform pg_temp.team_denied(format('select public.add_restaurant_member(%L,%L,%L)',s,(select id::text from team_test_ids where name='outsider'),'admin'),'42501');
  perform pg_temp.team_denied(format('select public.remove_restaurant_member(%L,%L)',s,(select id from team_test_ids where name='owner')),'42501');
  if exists(select 1 from public.list_restaurant_members(s)) then raise exception 'Team directory leaked'; end if;
end $$;

reset role;
select set_config('request.jwt.claim.sub',(select id::text from team_test_ids where name='admin'),true);
set local role authenticated;
do $$
declare s text := 'teste-equipe-'||(select id::text from team_test_ids where name='store');
begin
  perform pg_temp.team_denied(format('select public.add_restaurant_member(%L,%L,%L)',s,(select id::text from team_test_ids where name='customer'),'admin'),'42501');
  perform pg_temp.team_denied(format('select public.add_restaurant_member(%L,%L,%L)',s,(select id::text from team_test_ids where name='owner'),'kitchen'),'42501');
  perform pg_temp.team_denied(format('select public.remove_restaurant_member(%L,%L)',s,(select id from team_test_ids where name='peer')),'42501');
  perform public.remove_restaurant_member(s,(select id from team_test_ids where name='customer'));
end $$;
reset role;
rollback;
select 'Account/team checks passed; all fixtures rolled back' as result;
