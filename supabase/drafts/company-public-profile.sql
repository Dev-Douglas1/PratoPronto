-- PratoPronto: public company profile and public image assets.
-- Draft only: review and apply to a non-production Supabase branch first.

alter table public.restaurantes
  add column if not exists categoria text not null default 'Restaurante',
  add column if not exists capa_url text,
  add column if not exists whatsapp text,
  add column if not exists instagram text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('company-public-assets','company-public-assets',true,4194304,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Public buckets serve objects by URL without a SELECT policy.
-- Avoid granting object listing through the Data API.
drop policy if exists "Company public profile images are readable" on storage.objects;

drop policy if exists "Company members upload profile images" on storage.objects;
create policy "Company members upload profile images"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'company-public-assets'
  and array_length(storage.foldername(name), 1) = 1
  and private.restaurant_role(
    private.restaurant_id_from_slug((storage.foldername(name))[1]),
    (select auth.uid())
  ) in ('owner','admin')
);

create or replace function public.get_storefront(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  rid uuid;
  r public.restaurantes;
  s jsonb;
begin
  rid := private.restaurant_id_from_slug(p_slug);
  if rid is null then raise exception 'Empresa não encontrada.'; end if;
  select * into r from public.restaurantes where id = rid;
  select data into s from public.restaurant_settings where restaurante_id = rid;
  s := coalesce(s, '{}'::jsonb);
  return jsonb_build_object(
    'companyId', r.slug,
    'restaurantId', r.id,
    'name', coalesce(s->>'name', r.nome),
    'description', coalesce(s->'publicProfile'->>'description', r.descricao, ''),
    'category', coalesce(s->'publicProfile'->>'category', r.categoria, 'Restaurante'),
    'logoUrl', coalesce(s->'publicProfile'->>'logoUrl', r.avatar_url, ''),
    'coverUrl', coalesce(s->'publicProfile'->>'coverUrl', r.capa_url, ''),
    'whatsapp', coalesce(s->'publicProfile'->>'whatsapp', r.whatsapp, ''),
    'instagram', coalesce(s->'publicProfile'->>'instagram', r.instagram, ''),
    'phone', coalesce(s->>'phone', r.telefone, ''),
    'address', coalesce(s->'address', '{}'::jsonb),
    'hours', coalesce(s->'hours', '[]'::jsonb),
    'zones', coalesce(s->'zones', '[]'::jsonb),
    'timezone', coalesce(s->>'timezone', 'America/Sao_Paulo'),
    'estimateMinutes', coalesce((s->>'estimateMinutes')::int, 45),
    'methods', (select coalesce(jsonb_agg(value), '[]'::jsonb)
      from jsonb_array_elements_text(coalesce(s->'methods','[]'::jsonb)) x(value)
      where value = 'maquina_entrega'),
    'open', r.ativo and coalesce((s->>'acceptingOrders')::boolean, false),
    'configured', s <> '{}'::jsonb,
    'environment', 'production'
  );
end
$function$;

create or replace function public.save_restaurant_settings(p_restaurant_slug text, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  uid uuid := auth.uid();
  rid uuid := private.restaurant_id_from_slug(p_restaurant_slug);
  name_value text;
  profile jsonb;
  category_value text;
  whatsapp_value text;
  instagram_value text;
  logo_value text;
  cover_value text;
  estimate integer;
  retention integer;
  zones jsonb;
  zone jsonb;
  hours jsonb;
  day_slots jsonb;
  slot jsonb;
  start_min integer;
  end_min integer;
begin
  perform private.enforce_rate_limit('company.settings',30,600);
  if private.restaurant_role(rid,uid) not in ('owner','admin') then
    raise exception 'Sem permissão para alterar a empresa.';
  end if;
  if jsonb_typeof(p_data) <> 'object' then raise exception 'Configuração inválida.'; end if;

  name_value := trim(coalesce(p_data->>'name',''));
  if char_length(name_value) < 2 or char_length(name_value) > 100 then
    raise exception 'Informe um nome de empresa com 2 a 100 caracteres.';
  end if;
  estimate := coalesce((p_data->>'estimateMinutes')::integer,45);
  retention := coalesce((p_data->>'retentionDays')::integer,90);
  if estimate < 10 or estimate > 240 then raise exception 'Previsão de entrega inválida.'; end if;
  if retention < 30 or retention > 3650 then raise exception 'Retenção operacional inválida.'; end if;
  if char_length(coalesce(p_data->>'phone','')) > 40 then raise exception 'Telefone da empresa muito longo.'; end if;
  if char_length(coalesce(p_data->>'privacyEmail','')) > 254 then raise exception 'E-mail de privacidade inválido.'; end if;
  if char_length(coalesce(p_data->>'legalName','')) > 160 then raise exception 'Nome do responsável muito longo.'; end if;
  if char_length(coalesce(p_data->>'document','')) > 40 then raise exception 'Documento muito longo.'; end if;

  profile := coalesce(p_data->'publicProfile','{}'::jsonb);
  if jsonb_typeof(profile) <> 'object' then raise exception 'Perfil público inválido.'; end if;
  if char_length(coalesce(profile->>'description','')) > 500 then raise exception 'Descrição da loja muito longa.'; end if;
  category_value := left(trim(coalesce(profile->>'category','Restaurante')),60);
  whatsapp_value := left(regexp_replace(coalesce(profile->>'whatsapp',''), '[^0-9+]', '', 'g'),20);
  instagram_value := left(trim(leading '@' from trim(coalesce(profile->>'instagram',''))),80);
  logo_value := coalesce(profile->>'logoUrl','');
  cover_value := coalesce(profile->>'coverUrl','');
  if (logo_value <> '' and logo_value !~ '^https://[^[:space:]]+$')
     or (cover_value <> '' and cover_value !~ '^https://[^[:space:]]+$') then
    raise exception 'As imagens do perfil devem usar endereços HTTPS.';
  end if;
  if instagram_value <> '' and instagram_value !~ '^[A-Za-z0-9._]+$' then
    raise exception 'Informe um usuário válido do Instagram.';
  end if;

  zones := coalesce(p_data->'zones','[]'::jsonb);
  if jsonb_typeof(zones) <> 'array' or jsonb_array_length(zones) > 100 then raise exception 'Áreas de entrega inválidas.'; end if;
  for zone in select value from jsonb_array_elements(zones) loop
    if char_length(trim(coalesce(zone->>'bairro',''))) < 2 or char_length(trim(coalesce(zone->>'bairro',''))) > 100 then raise exception 'Bairro inválido na área de entrega.'; end if;
    if coalesce((zone->>'feeCents')::integer,0) < 0 or coalesce((zone->>'feeCents')::integer,0) > 100000 then raise exception 'Taxa de entrega inválida.'; end if;
    if coalesce((zone->>'minCents')::integer,0) < 0 or coalesce((zone->>'minCents')::integer,0) > 1000000 then raise exception 'Pedido mínimo inválido.'; end if;
    if zone ? 'freeAboveCents' and zone->>'freeAboveCents' is not null and ((zone->>'freeAboveCents')::integer < 0 or (zone->>'freeAboveCents')::integer > 1000000) then raise exception 'Limite de frete grátis inválido.'; end if;
  end loop;

  hours := coalesce(p_data->'hours','[]'::jsonb);
  if jsonb_typeof(hours) <> 'array' or jsonb_array_length(hours) <> 7 then raise exception 'Informe os horários dos sete dias da semana.'; end if;
  for day_slots in select value from jsonb_array_elements(hours) loop
    if jsonb_typeof(day_slots) <> 'array' or jsonb_array_length(day_slots) > 3 then raise exception 'Horários de atendimento inválidos.'; end if;
    for slot in select value from jsonb_array_elements(day_slots) loop
      start_min := coalesce((slot->>'start')::integer,-1);
      end_min := coalesce((slot->>'end')::integer,-1);
      if start_min < 0 or start_min > 1439 or end_min < 1 or end_min > 1440 or end_min <= start_min then raise exception 'Intervalo de atendimento inválido.'; end if;
    end loop;
  end loop;

  p_data := jsonb_set(p_data,'{methods}','["maquina_entrega"]'::jsonb,true);
  p_data := jsonb_set(p_data,'{estimateMinutes}',to_jsonb(estimate),true);
  p_data := jsonb_set(p_data,'{retentionDays}',to_jsonb(retention),true);

  insert into public.restaurant_settings(restaurante_id,data,updated_by,updated_at)
  values(rid,p_data,uid,now())
  on conflict(restaurante_id) do update set data=excluded.data,updated_by=uid,updated_at=now();

  update public.restaurantes
  set nome=name_value,
      descricao=left(coalesce(profile->>'description',''),500),
      categoria=category_value,
      avatar_url=nullif(logo_value,''),
      capa_url=nullif(cover_value,''),
      whatsapp=nullif(whatsapp_value,''),
      instagram=nullif(instagram_value,''),
      telefone=left(coalesce(p_data->>'phone',''),40),
      endereco=left(coalesce(p_data->'address'->>'endereco',''),180),
      ativo=coalesce((p_data->>'acceptingOrders')::boolean,false),
      updated_at=now()
  where id=rid;
  return public.get_storefront(p_restaurant_slug);
end
$function$;
