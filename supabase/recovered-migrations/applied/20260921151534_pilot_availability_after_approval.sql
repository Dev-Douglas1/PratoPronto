
create or replace function public.set_pilot_availability(p_accepting boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid:=auth.uid(); pp public.pilot_profiles;
begin
  select * into pp from public.pilot_profiles where profile_id=uid for update;
  if pp.profile_id is null then raise exception 'Cadastro de piloto não encontrado.'; end if;
  if pp.approval_status<>'approved' then raise exception 'Seu cadastro precisa estar aprovado para receber ofertas.'; end if;

  update public.pilot_profiles
  set accepting_offers=coalesce(p_accepting,false),updated_at=now()
  where profile_id=uid;

  return jsonb_build_object('accepting_offers',coalesce(p_accepting,false));
end
$$;
revoke all on function public.set_pilot_availability(boolean) from public;
grant execute on function public.set_pilot_availability(boolean) to authenticated;
