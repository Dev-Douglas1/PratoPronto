
create or replace function public.update_restaurant_product_state(
  p_restaurant_slug text,
  p_product_slug text,
  p_price_cents integer default null,
  p_active boolean default null,
  p_promotion jsonb default null,
  p_update_promotion boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  uid uuid:=auth.uid();
  rid uuid:=private.restaurant_id_from_slug(p_restaurant_slug);
  prod public.products;
  pct integer;
  start_ms bigint;
  end_ms bigint;
  title_value text;
begin
  perform private.enforce_rate_limit('company.product_state',120,600);
  if private.restaurant_role(rid,uid) not in ('owner','admin') then
    raise exception 'Sem permissão para alterar o cardápio.';
  end if;

  select * into prod
  from public.products
  where restaurant_id=rid and slug=p_product_slug
  for update;
  if prod.id is null then raise exception 'Produto não encontrado.'; end if;

  if p_price_cents is not null and (p_price_cents<1 or p_price_cents>200000) then
    raise exception 'Preço inválido.';
  end if;

  if p_update_promotion and p_promotion is not null then
    title_value:=trim(coalesce(p_promotion->>'titulo',''));
    pct:=coalesce((p_promotion->>'percentual')::integer,0);
    start_ms:=coalesce((p_promotion->>'inicio')::bigint,0);
    end_ms:=coalesce((p_promotion->>'fim')::bigint,0);
    if char_length(title_value)<3 or char_length(title_value)>60 then raise exception 'Título da promoção inválido.'; end if;
    if pct<1 or pct>90 then raise exception 'Desconto inválido.'; end if;
    if start_ms<=0 or end_ms<=start_ms or end_ms-start_ms>7776000000 then
      raise exception 'Validade da promoção inválida.';
    end if;
    if jsonb_typeof(p_promotion->'ativa')<>'boolean' then raise exception 'Status da promoção inválido.'; end if;
  end if;

  update public.products
  set price_cents=coalesce(p_price_cents,price_cents),
      active=coalesce(p_active,active),
      promotion=case when p_update_promotion then p_promotion else promotion end,
      updated_at=now()
  where id=prod.id;

  return jsonb_build_object(
    'id',prod.id,
    'slug',p_product_slug,
    'priceCents',coalesce(p_price_cents,prod.price_cents),
    'active',coalesce(p_active,prod.active),
    'promotion',case when p_update_promotion then p_promotion else prod.promotion end
  );
end
$$;
revoke all on function public.update_restaurant_product_state(text,text,integer,boolean,jsonb,boolean) from public;
grant execute on function public.update_restaurant_product_state(text,text,integer,boolean,jsonb,boolean) to authenticated;

create or replace function public.save_restaurant_pilot_contact(
  p_restaurant_slug text,
  p_contact_id uuid default null,
  p_pilot_profile_id uuid default null,
  p_relation_type text default 'own',
  p_label text default '',
  p_contact_type text default 'whatsapp',
  p_contact_value text default '',
  p_notes text default ''
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  uid uuid:=auth.uid();
  rid uuid:=private.restaurant_id_from_slug(p_restaurant_slug);
  cid uuid;
  label_value text:=trim(coalesce(p_label,''));
  contact_value text:=trim(coalesce(p_contact_value,''));
  notes_value text:=trim(coalesce(p_notes,''));
begin
  perform private.enforce_rate_limit('company.pilot_contact',40,600);
  if private.restaurant_role(rid,uid) not in ('owner','admin','attendant') then
    raise exception 'Sem permissão para gerenciar contatos de entrega.';
  end if;
  if p_relation_type not in ('own','partner') then raise exception 'Relação de piloto inválida.'; end if;
  if p_contact_type not in ('phone','whatsapp','email','other') then raise exception 'Meio de contato inválido.'; end if;
  if char_length(label_value)<2 or char_length(label_value)>100 then raise exception 'Nome/identificação inválido.'; end if;
  if char_length(contact_value)<3 or char_length(contact_value)>254 then raise exception 'Contato inválido.'; end if;
  if char_length(notes_value)>500 then raise exception 'Observação muito longa.'; end if;

  if p_pilot_profile_id is not null and not exists(
    select 1 from public.pilot_profiles pp
    where pp.profile_id=p_pilot_profile_id
      and pp.approval_status='approved'
      and pp.account_status='active'
  ) then
    raise exception 'O Piloto Parceiro vinculado não está aprovado ou está bloqueado.';
  end if;

  if p_contact_id is null then
    insert into public.restaurant_pilot_contacts(
      restaurante_id,pilot_profile_id,relation_type,label,contact_type,contact_value,notes,active,created_by,updated_at
    ) values(
      rid,p_pilot_profile_id,p_relation_type,label_value,p_contact_type,contact_value,notes_value,true,uid,now()
    ) returning id into cid;
  else
    update public.restaurant_pilot_contacts
    set pilot_profile_id=p_pilot_profile_id,
        relation_type=p_relation_type,
        label=label_value,
        contact_type=p_contact_type,
        contact_value=contact_value,
        notes=notes_value,
        active=true,
        updated_at=now()
    where id=p_contact_id and restaurante_id=rid
    returning id into cid;
    if cid is null then raise exception 'Contato não encontrado.'; end if;
  end if;

  return cid;
end
$$;
revoke all on function public.save_restaurant_pilot_contact(text,uuid,uuid,text,text,text,text,text) from public;
grant execute on function public.save_restaurant_pilot_contact(text,uuid,uuid,text,text,text,text,text) to authenticated;

create or replace function public.remove_restaurant_pilot_contact(
  p_restaurant_slug text,
  p_contact_id uuid
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  uid uuid:=auth.uid();
  rid uuid:=private.restaurant_id_from_slug(p_restaurant_slug);
begin
  perform private.enforce_rate_limit('company.pilot_contact_remove',30,600);
  if private.restaurant_role(rid,uid) not in ('owner','admin') then
    raise exception 'Somente proprietário ou administrador pode remover contatos.';
  end if;

  update public.restaurant_pilot_contacts
  set active=false,updated_at=now()
  where id=p_contact_id and restaurante_id=rid and active=true;
  if not found then raise exception 'Contato não encontrado.'; end if;
  return true;
end
$$;
revoke all on function public.remove_restaurant_pilot_contact(text,uuid) from public;
grant execute on function public.remove_restaurant_pilot_contact(text,uuid) to authenticated;

-- Critical writes go through validated, rate-limited RPCs only.
drop policy if exists "products managers insert" on public.products;
drop policy if exists "products managers update" on public.products;
drop policy if exists "products managers delete" on public.products;

drop policy if exists "settings managers insert" on public.restaurant_settings;
drop policy if exists "settings managers update" on public.restaurant_settings;

drop policy if exists "pilot contacts staff insert" on public.restaurant_pilot_contacts;
drop policy if exists "pilot contacts staff update" on public.restaurant_pilot_contacts;
drop policy if exists "pilot contacts managers delete" on public.restaurant_pilot_contacts;
