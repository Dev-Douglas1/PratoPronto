-- Security hardening: keep the RPC rate-limit ledger inaccessible to API roles.
-- The table is written only by SECURITY DEFINER functions owned by postgres.
-- No direct policies or grants are added; application access remains through RPCs.
ALTER TABLE private.rpc_rate_limits ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE private.rpc_rate_limits IS
  'Internal rate-limit ledger. Direct client access is intentionally denied; use approved SECURITY DEFINER RPCs.';
