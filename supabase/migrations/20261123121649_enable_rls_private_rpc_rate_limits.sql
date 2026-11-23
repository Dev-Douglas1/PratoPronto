alter table private.rpc_rate_limits enable row level security;
revoke all on table private.rpc_rate_limits from public, anon, authenticated, service_role;
