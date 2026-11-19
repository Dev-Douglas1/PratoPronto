
drop table if exists public.delivery_offers cascade;
drop table if exists public.order_secrets cascade;

alter table public.orders
  drop column if exists delivery_offer_id,
  drop column if exists delivery_code_required;

drop index if exists public.orders_pilot_status_idx;
create index if not exists orders_pilot_status_idx
  on public.orders(assigned_pilot_id,delivery_status,created_at desc);
