-- Account IDs come from Supabase Auth (auth.users.id); never regenerate them.
-- Preserve p_email for clients already in use, accepting either a full UUID
-- or a verified email. Role changes are scoped to one restaurant on the server.
create or replace function public.add_restaurant_member(
  p_restaurant_slug text, p_email text, p_role text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  uid uuid := auth.uid();
  rid uuid;
  target_uid uuid;
  target_email text;
  target_role text;
  actor_role text;
  identifier text := lower(trim(p_email));
  role_value text := lower(trim(p_role));
begin
  if uid is null or not private.verified(uid) or not exists (
    select 1 from auth.users u where u.id = uid
    and (u.banned_until is null or u.banned_until <= now())
  ) then
    raise exception 'Entre com uma conta verificada para continuar.' using errcode = '42501';
  end if;

  rid := private.restaurant_id_from_slug(p_restaurant_slug);
  -- Serialize membership changes before checking the actor's current role.
  perform 1 from public.restaurantes r where r.id = rid for update;
  actor_role := private.restaurant_role(rid, uid);
  if actor_role is null or actor_role not in ('owner', 'admin') then
    raise exception 'Sem permissão para gerenciar a equipe desta empresa.' using errcode = '42501';
  end if;
  perform private.enforce_rate_limit('company.member_add', 20, 600);

  if role_value is null or role_value not in ('admin', 'attendant', 'kitchen') then
    raise exception 'Escolha administrador da empresa, atendente ou cozinha.' using errcode = '22023';
  end if;
  if role_value = 'admin' and actor_role <> 'owner' then
    raise exception 'Somente o proprietário pode conceder acesso de administrador.' using errcode = '42501';
  end if;
  if identifier is null or length(identifier) not between 1 and 254 then
    raise exception 'Informe o ID completo ou o e-mail da conta.' using errcode = '22023';
  end if;

  if identifier ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select u.id, coalesce(u.email, '') into target_uid, target_email
    from auth.users u
    where u.id = identifier::uuid and private.verified(u.id)
      and (u.banned_until is null or u.banned_until <= now());
  elsif position('@' in identifier) > 1 then
    select u.id, u.email into target_uid, target_email
    from auth.users u
    where lower(u.email) = identifier and u.email_confirmed_at is not null
      and u.deleted_at is null
      and (u.banned_until is null or u.banned_until <= now())
    limit 1;
  else
    raise exception 'ID inválido. Copie o ID completo em Meu perfil ou use o e-mail.' using errcode = '22023';
  end if;
  if target_uid is null then
    raise exception 'Conta verificada não encontrada. Confira o ID ou o e-mail.' using errcode = '22023';
  end if;
  if target_uid = uid then
    raise exception 'Você não pode alterar seu próprio acesso por este formulário.' using errcode = '42501';
  end if;

  select rm.role into target_role from public.restaurant_members rm
  where rm.restaurante_id = rid and rm.profile_id = target_uid for update;
  if target_role = 'owner' then
    raise exception 'O acesso do proprietário não pode ser alterado pela equipe.' using errcode = '42501';
  end if;
  if target_role = 'admin' and actor_role <> 'owner' then
    raise exception 'Somente o proprietário pode alterar o acesso de outro administrador.' using errcode = '42501';
  end if;

  insert into public.restaurant_members(restaurante_id, profile_id, role, active)
  values (rid, target_uid, role_value, true)
  on conflict (restaurante_id, profile_id)
  do update set role = excluded.role, active = true, updated_at = now();
  return jsonb_build_object('userId', target_uid, 'email', target_email, 'role', role_value);
end
$function$;

create or replace function public.remove_restaurant_member(
  p_restaurant_slug text, p_profile_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  uid uuid := auth.uid();
  rid uuid;
  actor_role text;
  target_role text;
begin
  if uid is null or not private.verified(uid) or not exists (
    select 1 from auth.users u where u.id = uid
    and (u.banned_until is null or u.banned_until <= now())
  ) then
    raise exception 'Entre com uma conta verificada para continuar.' using errcode = '42501';
  end if;
  rid := private.restaurant_id_from_slug(p_restaurant_slug);
  perform 1 from public.restaurantes r where r.id = rid for update;
  actor_role := private.restaurant_role(rid, uid);
  if actor_role is null or actor_role not in ('owner', 'admin') then
    raise exception 'Sem permissão para gerenciar a equipe desta empresa.' using errcode = '42501';
  end if;
  perform private.enforce_rate_limit('company.member_remove', 20, 600);

  select rm.role into target_role from public.restaurant_members rm
  where rm.restaurante_id = rid and rm.profile_id = p_profile_id and rm.active = true for update;
  if target_role is null then
    raise exception 'Membro não encontrado nesta empresa.' using errcode = '22023';
  end if;
  if target_role = 'owner' then
    raise exception 'O proprietário não pode ser removido pela equipe.' using errcode = '42501';
  end if;
  if p_profile_id = uid then
    raise exception 'Você não pode remover seu próprio acesso por este formulário.' using errcode = '42501';
  end if;
  if target_role = 'admin' and actor_role <> 'owner' then
    raise exception 'Somente o proprietário pode remover outro administrador.' using errcode = '42501';
  end if;

  update public.restaurant_members set active = false, updated_at = now()
  where restaurante_id = rid and profile_id = p_profile_id;
  return true;
end
$function$;

-- Keep RLS for reads; all mutations pass through the checked RPCs above.
revoke all on table public.restaurant_members from public, anon, authenticated;
grant select on table public.restaurant_members to authenticated;
revoke all on function public.add_restaurant_member(text, text, text) from public, anon;
revoke all on function public.remove_restaurant_member(text, uuid) from public, anon;
revoke all on function public.list_restaurant_members(text) from public, anon;
grant execute on function public.add_restaurant_member(text, text, text) to authenticated;
grant execute on function public.remove_restaurant_member(text, uuid) to authenticated;
grant execute on function public.list_restaurant_members(text) to authenticated;
