
drop policy if exists "products public or staff read" on public.products;
drop policy if exists "restaurants public or member read" on public.restaurantes;

create index if not exists pilot_profiles_blocked_by_idx
  on public.pilot_profiles(blocked_by);

create index if not exists restaurantes_blocked_by_idx
  on public.restaurantes(blocked_by);
