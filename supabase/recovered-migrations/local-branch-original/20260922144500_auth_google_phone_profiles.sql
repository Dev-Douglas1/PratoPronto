create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_phone text;
begin
  v_phone := regexp_replace(
    coalesce(new.raw_user_meta_data->>'telefone', new.phone, ''),
    '[^0-9]',
    '',
    'g'
  );

  if left(v_phone, 2) = '55' and length(v_phone) in (12, 13) then
    v_phone := substr(v_phone, 3);
  end if;

  insert into public.profiles(
    id,nome,email,telefone,avatar_url,endereco,numero,bairro,complemento,cep,cidade,uf,
    aceitar_marketing,privacy_policy_version,terms_version,consent_timestamp
  ) values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'nome',''),
      nullif(new.raw_user_meta_data->>'full_name',''),
      nullif(new.raw_user_meta_data->>'name',''),
      ''
    ),
    coalesce(new.email,''),
    v_phone,
    coalesce(
      nullif(new.raw_user_meta_data->>'avatar_url',''),
      nullif(new.raw_user_meta_data->>'picture','')
    ),
    coalesce(new.raw_user_meta_data->>'endereco',''),
    coalesce(new.raw_user_meta_data->>'numero',''),
    coalesce(new.raw_user_meta_data->>'bairro',''),
    coalesce(new.raw_user_meta_data->>'complemento',''),
    coalesce(new.raw_user_meta_data->>'cep',''),
    coalesce(new.raw_user_meta_data->>'cidade',''),
    upper(coalesce(new.raw_user_meta_data->>'uf','')),
    coalesce((new.raw_user_meta_data->>'aceitar_marketing')::boolean,false),
    new.raw_user_meta_data->>'privacy_policy_version',
    new.raw_user_meta_data->>'terms_version',
    coalesce((new.raw_user_meta_data->>'consent_timestamp')::timestamptz,now())
  )
  on conflict(id) do nothing;

  return new;
end
$function$;
